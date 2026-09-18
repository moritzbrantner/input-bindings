use std::{fs, path::PathBuf};

use input_bindings_core::{
    ActionRegistry, Profile, RegistryValidationReport, compile_action_registry,
    validate_compiled_registry, validate_registry,
};
use serde::Deserialize;

fn fixture_path(name: &str) -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../fixtures")
        .join(name)
}

#[derive(Deserialize)]
struct RegistryFixture {
    cases: Vec<RegistryCase>,
}

#[derive(Deserialize)]
struct RegistryCase {
    name: String,
    registry: ActionRegistry,
    profile: Option<Profile>,
    expected: RegistryValidationReport,
}

#[test]
fn registry_validation_matches_shared_fixtures() {
    let content = fs::read_to_string(fixture_path("registry.json"))
        .expect("registry fixture should be readable");
    let fixture: RegistryFixture =
        serde_json::from_str(&content).expect("registry fixture should deserialize");

    for case in fixture.cases {
        let compiled = compile_action_registry(&case.registry);
        let compiled_actual = validate_compiled_registry(&compiled, case.profile.as_ref());
        assert_eq!(
            compiled_actual, case.expected,
            "compiled case: {}",
            case.name
        );

        let actual = validate_registry(&case.registry, case.profile.as_ref());
        assert_eq!(actual, case.expected, "case: {}", case.name);
    }
}

#[test]
fn compiled_registry_reuses_the_same_baseline_across_profiles() {
    let content = fs::read_to_string(fixture_path("registry.json"))
        .expect("registry fixture should be readable");
    let fixture: RegistryFixture =
        serde_json::from_str(&content).expect("registry fixture should deserialize");
    let case = fixture
        .cases
        .into_iter()
        .next()
        .expect("registry fixture should contain a case");
    let compiled = compile_action_registry(&case.registry);

    let baseline = validate_compiled_registry(&compiled, None);
    let empty_profile = Profile {
        id: "empty".to_string(),
        patches: Vec::new(),
    };
    let through_empty_profile = validate_compiled_registry(&compiled, Some(&empty_profile));

    assert_eq!(baseline, through_empty_profile);
    assert_eq!(baseline.effective_bindings, compiled.base_bindings());
}
