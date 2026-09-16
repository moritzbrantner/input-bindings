use std::collections::BTreeSet;

use input_bindings_core::{
    Binding, BindingPatch, Conflict, InputStroke, KeyMatch, KeyStroke, Modifiers, Profile,
    WhenExpr, analyze_conflicts, apply_profile, canonicalize_portable_configuration,
    portable_configuration_from_profile, profile_from_portable_configuration, resolve,
};

struct DeterministicRng {
    state: u32,
}

impl DeterministicRng {
    fn new(seed: u32) -> Self {
        Self {
            state: if seed == 0 { 0x9e37_79b9 } else { seed },
        }
    }

    fn next(&mut self) -> u32 {
        let mut value = self.state;
        value ^= value << 13;
        value ^= value >> 17;
        value ^= value << 5;
        self.state = value;
        value
    }

    fn range(&mut self, upper_exclusive: u32) -> u32 {
        self.next() % upper_exclusive
    }
}

const KEYS: [&str; 6] = ["a", "b", "c", "x", "y", "z"];
const CONTEXTS: [&str; 3] = ["editing", "game", "modal"];

fn generated_modifiers(rng: &mut DeterministicRng) -> Modifiers {
    let mask = rng.range(8);
    Modifiers {
        ctrl: mask & 1 != 0,
        shift: mask & 2 != 0,
        alt: mask & 4 != 0,
        ..Modifiers::default()
    }
}

fn generated_stroke(rng: &mut DeterministicRng) -> InputStroke {
    let key = KEYS[rng.range(KEYS.len() as u32) as usize];
    let key = if rng.range(2) == 0 {
        KeyMatch::Logical {
            value: key.to_owned(),
        }
    } else {
        KeyMatch::Physical {
            value: format!("Key{}", key.to_uppercase()),
        }
    };
    InputStroke::Keyboard(KeyStroke {
        key,
        modifiers: generated_modifiers(rng),
    })
}

fn context(id: &str) -> WhenExpr {
    WhenExpr::Context { id: id.to_owned() }
}

fn generated_when(rng: &mut DeterministicRng) -> WhenExpr {
    match rng.range(6) {
        0 => WhenExpr::Always,
        1 => context(CONTEXTS[rng.range(CONTEXTS.len() as u32) as usize]),
        2 => WhenExpr::Not {
            expr: Box::new(context(CONTEXTS[rng.range(CONTEXTS.len() as u32) as usize])),
        },
        3 => WhenExpr::All {
            exprs: vec![
                context("editing"),
                WhenExpr::Not {
                    expr: Box::new(context("modal")),
                },
            ],
        },
        4 => WhenExpr::Any {
            exprs: vec![context("editing"), context("game")],
        },
        _ => WhenExpr::Always,
    }
}

fn generated_binding(rng: &mut DeterministicRng, index: usize) -> Binding {
    let sequence_length = 1 + rng.range(2) as usize;
    Binding {
        id: format!("b{index}"),
        action: format!("action.{}", rng.range(4)),
        sequence: (0..sequence_length)
            .map(|_| generated_stroke(rng))
            .collect(),
        when: generated_when(rng),
        priority: rng.range(5) as i32 - 2,
    }
}

fn normalized_conflicts(conflicts: Vec<Conflict>) -> Vec<String> {
    let mut normalized = conflicts
        .into_iter()
        .map(|conflict| {
            let (left, right) = if conflict.left_binding_id <= conflict.right_binding_id {
                (conflict.left_binding_id, conflict.right_binding_id)
            } else {
                (conflict.right_binding_id, conflict.left_binding_id)
            };
            format!(
                "{left}|{right}|{:?}|{}",
                conflict.kind,
                conflict.witness_contexts.join(",")
            )
        })
        .collect::<Vec<_>>();
    normalized.sort();
    normalized
}

fn generated_contexts(rng: &mut DeterministicRng) -> BTreeSet<String> {
    CONTEXTS
        .iter()
        .enumerate()
        .filter(|(index, _)| rng.next() & (1 << index) != 0)
        .map(|(_, context)| (*context).to_owned())
        .collect()
}

fn profile_for(seed: u32, bindings: &[Binding]) -> Profile {
    let mut replacement = bindings[0].clone();
    replacement.action = format!("profile.replace.{}", seed % 3);
    replacement.priority += 1;

    let mut added = bindings[2].clone();
    added.id = format!("added-{seed}");
    added.action = format!("profile.add.{}", seed % 2);

    Profile {
        id: format!("generated-{seed}"),
        patches: vec![
            BindingPatch::Replace {
                binding_id: bindings[0].id.clone(),
                binding: replacement,
            },
            BindingPatch::Remove {
                binding_id: bindings[1].id.clone(),
            },
            BindingPatch::Add { binding: added },
        ],
    }
}

#[test]
fn generated_resolver_and_conflicts_are_invariant_to_registry_order() {
    for seed in 1..=128_u32 {
        let mut rng = DeterministicRng::new(seed);
        let bindings = (0..8)
            .map(|index| generated_binding(&mut rng, index))
            .collect::<Vec<_>>();
        let mut reversed = bindings.clone();
        reversed.reverse();

        let selected = &bindings[rng.range(bindings.len() as u32) as usize];
        let prefix_length = 1 + rng.range(selected.sequence.len() as u32) as usize;
        let sequence = selected.sequence[..prefix_length].to_vec();
        let active_contexts = generated_contexts(&mut rng);

        assert_eq!(
            resolve(&bindings, &sequence, &active_contexts),
            resolve(&reversed, &sequence, &active_contexts),
            "resolver order dependence for seed {seed}"
        );
        assert_eq!(
            normalized_conflicts(analyze_conflicts(&bindings)),
            normalized_conflicts(analyze_conflicts(&reversed)),
            "conflict order dependence for seed {seed}"
        );
    }
}

#[test]
fn generated_profiles_are_deterministic_and_canonical_persistence_is_idempotent() {
    for seed in 1..=128_u32 {
        let mut rng = DeterministicRng::new(seed);
        let bindings = (0..8)
            .map(|index| generated_binding(&mut rng, index))
            .collect::<Vec<_>>();
        let profile = profile_for(seed, &bindings);

        let first = apply_profile(&bindings, &profile);
        let repeated = apply_profile(&bindings, &profile);
        let mut reversed = bindings.clone();
        reversed.reverse();
        let reordered_base = apply_profile(&reversed, &profile);
        assert_eq!(
            repeated, first,
            "profile application was nondeterministic for seed {seed}"
        );
        assert_eq!(
            reordered_base, first,
            "profile depended on base order for seed {seed}"
        );

        let (portable, diagnostics) =
            portable_configuration_from_profile(&profile, &bindings, 1, None);
        assert!(
            diagnostics.is_empty(),
            "unexpected conversion diagnostic for seed {seed}"
        );
        let canonical = canonicalize_portable_configuration(&portable);
        assert_eq!(
            canonicalize_portable_configuration(&canonical),
            canonical,
            "portable canonicalization was not idempotent for seed {seed}"
        );

        let round_tripped_profile = profile_from_portable_configuration(&canonical);
        let (round_tripped, round_trip_diagnostics) =
            portable_configuration_from_profile(&round_tripped_profile, &bindings, 1, None);
        assert!(
            round_trip_diagnostics.is_empty(),
            "unexpected round-trip diagnostic for seed {seed}"
        );
        assert_eq!(
            round_tripped, canonical,
            "profile/portable round trip changed canonical state for seed {seed}"
        );
    }
}
