use std::{fs, path::PathBuf};

use input_bindings_core::{ActionRegistry, Profile, RegistryValidationReport, validate_registry};
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
        let actual = validate_registry(&case.registry, case.profile.as_ref());
        assert_eq!(actual, case.expected, "case: {}", case.name);
    }
}
