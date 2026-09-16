use std::{collections::BTreeSet, hint::black_box, time::Instant};

use input_bindings_core::{
    Binding, BindingPatch, InputStroke, KeyMatch, KeyStroke, Modifiers, Profile, WhenExpr,
    analyze_conflicts, apply_profile, resolve,
};
use serde_json::json;

fn main() {
    let resolve_iterations = std::env::var("BENCH_RESOLVE_ITERATIONS")
        .ok()
        .and_then(|value| value.parse::<usize>().ok())
        .unwrap_or(100_000);
    let catalog_size = std::env::var("BENCH_CATALOG_SIZE")
        .ok()
        .and_then(|value| value.parse::<usize>().ok())
        .unwrap_or(512);

    let bindings = generated_bindings(catalog_size);
    let active_contexts = ["context-0", "context-3", "context-6"]
        .into_iter()
        .map(str::to_owned)
        .collect::<BTreeSet<_>>();
    let query = bindings[catalog_size / 3].sequence.clone();
    let mut resolution_checksum = 0_usize;

    let resolve_start = Instant::now();
    for _ in 0..resolve_iterations {
        let result = resolve(
            black_box(&bindings),
            black_box(&query),
            black_box(&active_contexts),
        );
        resolution_checksum = resolution_checksum.wrapping_add(format!("{result:?}").len());
    }
    let resolve_elapsed = resolve_start.elapsed();

    let conflicts_start = Instant::now();
    let conflicts = analyze_conflicts(black_box(&bindings));
    let conflicts_elapsed = conflicts_start.elapsed();

    let base = bindings.iter().take(128).cloned().collect::<Vec<_>>();
    let profile = Profile {
        id: "benchmark-profile".to_owned(),
        patches: base
            .iter()
            .enumerate()
            .filter_map(|(index, binding)| match index % 8 {
                0 => Some(BindingPatch::Remove {
                    binding_id: binding.id.clone(),
                }),
                1 => {
                    let mut replacement = binding.clone();
                    replacement.priority += 1;
                    Some(BindingPatch::Replace {
                        binding_id: binding.id.clone(),
                        binding: replacement,
                    })
                }
                _ => None,
            })
            .collect(),
    };
    let profile_iterations = (resolve_iterations / 50).max(1);
    let mut profile_checksum = 0_usize;
    let profile_start = Instant::now();
    for _ in 0..profile_iterations {
        let result = apply_profile(black_box(&base), black_box(&profile));
        profile_checksum = profile_checksum
            .wrapping_add(result.bindings.len())
            .wrapping_add(result.diagnostics.len());
    }
    let profile_elapsed = profile_start.elapsed();

    println!(
        "{}",
        serde_json::to_string_pretty(&json!({
            "schemaVersion": 1,
            "runtime": format!("rustc-{}", rustc_version()),
            "catalogSize": catalog_size,
            "workloads": {
                "resolve": {
                    "iterations": resolve_iterations,
                    "totalMs": millis(resolve_elapsed),
                    "operationsPerSecond": ops_per_second(resolve_iterations, resolve_elapsed),
                    "checksum": resolution_checksum,
                },
                "conflictScan": {
                    "pairs": catalog_size * (catalog_size.saturating_sub(1)) / 2,
                    "totalMs": millis(conflicts_elapsed),
                    "conflicts": conflicts.len(),
                },
                "profileApplication": {
                    "iterations": profile_iterations,
                    "totalMs": millis(profile_elapsed),
                    "operationsPerSecond": ops_per_second(profile_iterations, profile_elapsed),
                    "checksum": profile_checksum,
                }
            }
        }))
        .expect("benchmark evidence should serialize")
    );
}

fn generated_bindings(count: usize) -> Vec<Binding> {
    (0..count)
        .map(|index| Binding {
            id: format!("benchmark-{index:04}"),
            action: format!("action-{}", index % 137),
            sequence: vec![InputStroke::Keyboard(KeyStroke {
                key: KeyMatch::Logical {
                    value: char::from(b'a' + (index % 26) as u8).to_string(),
                },
                modifiers: Modifiers {
                    ctrl: index & 1 != 0,
                    alt: index & 2 != 0,
                    shift: index & 4 != 0,
                    meta: false,
                    alt_graph: false,
                },
            })],
            when: if index % 3 == 0 {
                WhenExpr::Context {
                    id: format!("context-{}", index % 7),
                }
            } else {
                WhenExpr::Always
            },
            priority: (index % 5) as i32 - 2,
        })
        .collect()
}

fn millis(duration: std::time::Duration) -> f64 {
    duration.as_secs_f64() * 1_000.0
}

fn ops_per_second(iterations: usize, duration: std::time::Duration) -> u64 {
    if duration.is_zero() {
        return 0;
    }
    (iterations as f64 / duration.as_secs_f64()).round() as u64
}

fn rustc_version() -> String {
    option_env!("RUSTC_VERSION").unwrap_or("stable").to_owned()
}
