use std::collections::BTreeSet;

use input_bindings_core::{
    Binding, BindingPatch, InputStroke, KeyMatch, KeyStroke, Modifiers, Profile, WhenExpr,
    analyze_conflicts, apply_profile, portable_configuration_from_profile,
    profile_from_portable_configuration, resolve,
};

struct Generator(u32);

impl Generator {
    fn new(seed: u32) -> Self {
        Self(seed)
    }

    fn next(&mut self) -> u32 {
        self.0 = self.0.wrapping_mul(1_664_525).wrapping_add(1_013_904_223);
        self.0
    }

    fn shuffle<T>(&mut self, values: &mut [T]) {
        for index in (1..values.len()).rev() {
            let target = self.next() as usize % (index + 1);
            values.swap(index, target);
        }
    }
}

fn generated_bindings(generator: &mut Generator, count: usize) -> Vec<Binding> {
    let keys = ["a", "b", "c", "d", "e", "f", "g", "h"];
    (0..count)
        .map(|index| {
            let context_index = generator.next() % 4;
            Binding {
                id: format!("binding-{index:02}"),
                action: format!("action-{}", generator.next() % 9),
                sequence: vec![InputStroke::Keyboard(KeyStroke {
                    key: KeyMatch::Logical {
                        value: keys[generator.next() as usize % keys.len()].to_owned(),
                    },
                    modifiers: Modifiers {
                        ctrl: generator.next() & 1 != 0,
                        alt: generator.next() & 1 != 0,
                        shift: generator.next() & 1 != 0,
                        meta: false,
                        alt_graph: false,
                    },
                })],
                when: if context_index == 0 {
                    WhenExpr::Always
                } else {
                    WhenExpr::Context {
                        id: format!("context-{context_index}"),
                    }
                },
                priority: (generator.next() % 3) as i32 - 1,
            }
        })
        .collect()
}

fn normalized_conflicts(bindings: &[Binding]) -> Vec<(String, String, String, Vec<String>)> {
    let mut values = analyze_conflicts(bindings)
        .into_iter()
        .map(|conflict| {
            let mut pair = [conflict.left_binding_id, conflict.right_binding_id];
            pair.sort();
            let kind = serde_json::to_value(conflict.kind)
                .expect("conflict kind should serialize")
                .as_str()
                .expect("conflict kind should serialize as a string")
                .to_owned();
            let mut witness = conflict.witness_contexts;
            witness.sort();
            (pair[0].clone(), pair[1].clone(), kind, witness)
        })
        .collect::<Vec<_>>();
    values.sort();
    values
}

#[test]
fn resolver_and_conflict_semantics_ignore_registration_order() {
    let mut generator = Generator::new(0x51f1_5eed);
    for iteration in 0..128 {
        let bindings = generated_bindings(&mut generator, 18);
        let candidate = &bindings[generator.next() as usize % bindings.len()];
        let mut contexts = BTreeSet::new();
        if let WhenExpr::Context { id } = &candidate.when {
            contexts.insert(id.clone());
        }
        if generator.next() & 1 != 0 {
            contexts.insert(format!("context-{}", 1 + generator.next() % 3));
        }

        let expected_resolution = resolve(&bindings, &candidate.sequence, &contexts);
        let expected_conflicts = normalized_conflicts(&bindings);

        for permutation in 0..5 {
            let mut reordered = bindings.clone();
            generator.shuffle(&mut reordered);
            assert_eq!(
                resolve(&reordered, &candidate.sequence, &contexts),
                expected_resolution,
                "resolution iteration={iteration} permutation={permutation}"
            );
            assert_eq!(
                normalized_conflicts(&reordered),
                expected_conflicts,
                "conflicts iteration={iteration} permutation={permutation}"
            );
        }
    }
}

#[test]
fn profile_portable_round_trips_preserve_generated_effective_bindings() {
    let mut generator = Generator::new(0xc0ff_ee42);
    for iteration in 0..128 {
        let mut base = generated_bindings(&mut generator, 12);
        for (index, binding) in base.iter_mut().enumerate() {
            binding.id = format!("base-{index}");
            binding.action = format!("action-{index}");
        }

        let mut patches = Vec::new();
        for (index, binding) in base.iter().enumerate() {
            match generator.next() % 4 {
                0 => patches.push(BindingPatch::Remove {
                    binding_id: binding.id.clone(),
                }),
                1 => {
                    let mut replacement = binding.clone();
                    replacement.priority += 1;
                    patches.push(BindingPatch::Replace {
                        binding_id: binding.id.clone(),
                        binding: replacement,
                    });
                }
                _ => {}
            }
            if index == 0 && generator.next() & 1 != 0 {
                let mut added = binding.clone();
                added.id = format!("user-added-{iteration}");
                patches.push(BindingPatch::Add { binding: added });
            }
        }

        let profile = Profile {
            id: format!("generated-{iteration}"),
            patches,
        };
        let expected = apply_profile(&base, &profile);
        assert!(expected.diagnostics.is_empty());

        let (portable, diagnostics) =
            portable_configuration_from_profile(&profile, &base, 1, None);
        assert!(diagnostics.is_empty());
        let round_trip = profile_from_portable_configuration(&portable);
        let actual = apply_profile(&base, &round_trip);

        assert!(actual.diagnostics.is_empty());
        assert_eq!(actual.bindings, expected.bindings, "iteration={iteration}");
    }
}
