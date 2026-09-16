use std::{collections::BTreeSet, env, fs, time::Instant};

use input_bindings_core::{
    Binding, BindingPatch, ConflictKind, InputStroke, KeyMatch, KeyStroke, Modifiers, Profile,
    Resolution, WhenExpr, analyze_conflicts, apply_profile, resolve,
};
use serde::Deserialize;
use serde_json::json;

#[derive(Clone, Copy, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
enum ScenarioKind {
    ResolveDirect,
    ResolveChordPrefix,
    AnalyzeConflicts,
    ApplyProfile,
}

impl ScenarioKind {
    fn as_str(self) -> &'static str {
        match self {
            Self::ResolveDirect => "resolveDirect",
            Self::ResolveChordPrefix => "resolveChordPrefix",
            Self::AnalyzeConflicts => "analyzeConflicts",
            Self::ApplyProfile => "applyProfile",
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Scenario {
    id: String,
    kind: ScenarioKind,
    seed: u32,
    binding_count: usize,
    iterations: u64,
    #[serde(default)]
    patch_count: usize,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BenchmarkManifest {
    schema_version: u32,
    generator_version: u32,
    scenarios: Vec<Scenario>,
}

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

fn modifiers(rng: &mut DeterministicRng) -> Modifiers {
    let mask = rng.range(8);
    Modifiers {
        ctrl: mask & 1 != 0,
        shift: mask & 2 != 0,
        alt: mask & 4 != 0,
        ..Modifiers::default()
    }
}

fn stroke(index: usize, step: usize, rng: &mut DeterministicRng) -> InputStroke {
    let key = if step.is_multiple_of(2) {
        KeyMatch::Physical {
            value: format!("Code{index}"),
        }
    } else {
        KeyMatch::Logical {
            value: format!("key.{index}.{step}"),
        }
    };
    InputStroke::Keyboard(KeyStroke {
        key,
        modifiers: modifiers(rng),
    })
}

fn generated_when(index: usize) -> WhenExpr {
    match index % 5 {
        0 => WhenExpr::Always,
        1 => WhenExpr::Context {
            id: "editing".to_owned(),
        },
        2 => WhenExpr::Context {
            id: "game".to_owned(),
        },
        3 => WhenExpr::All {
            exprs: vec![
                WhenExpr::Context {
                    id: "editing".to_owned(),
                },
                WhenExpr::Not {
                    expr: Box::new(WhenExpr::Context {
                        id: "modal".to_owned(),
                    }),
                },
            ],
        },
        _ => WhenExpr::Any {
            exprs: vec![
                WhenExpr::Context {
                    id: "editing".to_owned(),
                },
                WhenExpr::Context {
                    id: "game".to_owned(),
                },
            ],
        },
    }
}

fn generate_bindings(count: usize, seed: u32, kind: ScenarioKind) -> Vec<Binding> {
    let mut rng = DeterministicRng::new(seed);
    let conflict_divisor = (count / 4).max(1);

    (0..count)
        .map(|index| {
            let key_index = if matches!(kind, ScenarioKind::AnalyzeConflicts) {
                index % conflict_divisor
            } else {
                index
            };
            let sequence = if matches!(kind, ScenarioKind::ResolveChordPrefix) {
                vec![stroke(key_index, 0, &mut rng), stroke(key_index, 1, &mut rng)]
            } else {
                vec![stroke(key_index, 0, &mut rng)]
            };
            Binding {
                id: format!("binding.{index}"),
                action: format!("action.{}", index % 64),
                sequence,
                when: if matches!(kind, ScenarioKind::AnalyzeConflicts) {
                    generated_when(index)
                } else {
                    WhenExpr::Always
                },
                priority: rng.range(5) as i32 - 2,
            }
        })
        .collect()
}

fn generate_profile(bindings: &[Binding], patch_count: usize, seed: u32) -> Profile {
    let mut rng = DeterministicRng::new(seed ^ 0xa5a5_a5a5);
    let mut patches = Vec::with_capacity(patch_count);
    let third = (bindings.len() / 3).max(1);

    for index in 0..patch_count {
        let slot = index / 3;
        match index % 3 {
            0 => {
                let target = &bindings[slot % third];
                let mut replacement = target.clone();
                replacement.action = format!("profile.replaced.{}", slot % 16);
                replacement.priority += 1;
                patches.push(BindingPatch::Replace {
                    binding_id: target.id.clone(),
                    binding: replacement,
                });
            }
            1 => {
                let target = &bindings[(third + slot) % bindings.len()];
                patches.push(BindingPatch::Remove {
                    binding_id: target.id.clone(),
                });
            }
            _ => {
                let source = &bindings[(2 * third + slot) % bindings.len()];
                let mut added = source.clone();
                added.id = format!("profile.added.{slot}");
                added.action = format!("profile.added-action.{}", rng.range(16));
                patches.push(BindingPatch::Add { binding: added });
            }
        }
    }

    Profile {
        id: format!("benchmark.{seed}"),
        patches,
    }
}

fn mix(checksum: u32, value: u32) -> u32 {
    (checksum ^ value).wrapping_mul(16_777_619)
}

fn text_fingerprint(value: &str) -> u32 {
    value
        .bytes()
        .fold(2_166_136_261, |checksum, byte| mix(checksum, u32::from(byte)))
}

fn resolution_fingerprint(resolution: &Resolution) -> u32 {
    match resolution {
        Resolution::None => 1,
        Resolution::Resolved {
            binding_id,
            action,
        } => mix(text_fingerprint(binding_id), text_fingerprint(action)),
        Resolution::Ambiguous { binding_ids } => binding_ids
            .iter()
            .fold(3, |checksum, id| mix(checksum, text_fingerprint(id))),
        Resolution::Pending {
            exact_binding_ids,
            continuation_binding_ids,
        } => exact_binding_ids
            .iter()
            .chain(continuation_binding_ids)
            .fold(5, |checksum, id| mix(checksum, text_fingerprint(id))),
    }
}

fn conflict_kind_name(kind: &ConflictKind) -> &'static str {
    match kind {
        ConflictKind::Duplicate => "duplicate",
        ConflictKind::AmbiguousExact => "ambiguousExact",
        ConflictKind::OverrideExact => "overrideExact",
        ConflictKind::ChordPrefix => "chordPrefix",
        ConflictKind::PotentialExact => "potentialExact",
        ConflictKind::PotentialPrefix => "potentialPrefix",
    }
}

fn benchmark_resolve(scenario: &Scenario) -> serde_json::Value {
    let bindings = generate_bindings(scenario.binding_count, scenario.seed, scenario.kind);
    let active_contexts = BTreeSet::new();
    let mut checksum = 2_166_136_261_u32;
    let started = Instant::now();

    for iteration in 0..scenario.iterations {
        let binding = &bindings[((iteration as usize * 17) + scenario.seed as usize) % bindings.len()];
        let sequence = if matches!(scenario.kind, ScenarioKind::ResolveChordPrefix) {
            &binding.sequence[..1]
        } else {
            binding.sequence.as_slice()
        };
        checksum = mix(
            checksum,
            resolution_fingerprint(&resolve(&bindings, sequence, &active_contexts)),
        );
    }

    scenario_result(scenario, started, checksum)
}

fn benchmark_conflicts(scenario: &Scenario) -> serde_json::Value {
    let bindings = generate_bindings(scenario.binding_count, scenario.seed, scenario.kind);
    let mut checksum = 2_166_136_261_u32;
    let started = Instant::now();

    for _ in 0..scenario.iterations {
        let conflicts = analyze_conflicts(&bindings);
        checksum = mix(checksum, conflicts.len() as u32);
        for conflict in conflicts {
            checksum = mix(checksum, text_fingerprint(&conflict.left_binding_id));
            checksum = mix(checksum, text_fingerprint(&conflict.right_binding_id));
            checksum = mix(checksum, text_fingerprint(conflict_kind_name(&conflict.kind)));
        }
    }

    scenario_result(scenario, started, checksum)
}

fn benchmark_profile(scenario: &Scenario) -> serde_json::Value {
    let bindings = generate_bindings(scenario.binding_count, scenario.seed, scenario.kind);
    let profile = generate_profile(&bindings, scenario.patch_count, scenario.seed);
    let mut checksum = 2_166_136_261_u32;
    let started = Instant::now();

    for _ in 0..scenario.iterations {
        let application = apply_profile(&bindings, &profile);
        checksum = mix(checksum, application.bindings.len() as u32);
        checksum = mix(checksum, application.diagnostics.len() as u32);
        checksum = mix(
            checksum,
            text_fingerprint(
                application
                    .bindings
                    .first()
                    .map_or("", |binding| binding.id.as_str()),
            ),
        );
        checksum = mix(
            checksum,
            text_fingerprint(
                application
                    .bindings
                    .last()
                    .map_or("", |binding| binding.id.as_str()),
            ),
        );
    }

    scenario_result(scenario, started, checksum)
}

fn scenario_result(scenario: &Scenario, started: Instant, checksum: u32) -> serde_json::Value {
    let elapsed = started.elapsed();
    let elapsed_ms = elapsed.as_secs_f64() * 1_000.0;
    json!({
        "id": scenario.id,
        "kind": scenario.kind.as_str(),
        "operations": scenario.iterations,
        "elapsedMs": elapsed_ms,
        "nsPerOperation": elapsed.as_nanos() as f64 / scenario.iterations as f64,
        "checksum": checksum,
    })
}

fn main() {
    let manifest: BenchmarkManifest = serde_json::from_str(include_str!(
        "../../../benchmarks/scenarios.json"
    ))
    .expect("benchmark scenario manifest must be valid");

    let results = manifest
        .scenarios
        .iter()
        .map(|scenario| match scenario.kind {
            ScenarioKind::ResolveDirect | ScenarioKind::ResolveChordPrefix => {
                benchmark_resolve(scenario)
            }
            ScenarioKind::AnalyzeConflicts => benchmark_conflicts(scenario),
            ScenarioKind::ApplyProfile => benchmark_profile(scenario),
        })
        .collect::<Vec<_>>();

    let output = serde_json::to_string_pretty(&json!({
        "benchmarkSchemaVersion": 1,
        "manifestSchemaVersion": manifest.schema_version,
        "generatorVersion": manifest.generator_version,
        "implementation": "rust",
        "runtime": env!("CARGO_PKG_VERSION"),
        "platform": env::consts::OS,
        "architecture": env::consts::ARCH,
        "results": results,
    }))
    .expect("benchmark output must serialize");

    if let Some(output_path) = env::args().nth(1) {
        fs::write(output_path, format!("{output}\n")).expect("benchmark output must be writable");
    } else {
        println!("{output}");
    }
}
