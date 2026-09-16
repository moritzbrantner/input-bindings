use std::{fs, path::PathBuf};

use input_bindings_core::{
    Binding, PlatformConflictEnvironment, PlatformConflictRule, analyze_platform_conflicts,
};
use serde::Deserialize;

fn fixture_path() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../fixtures/platform_conflicts.json")
}

#[derive(Deserialize)]
struct Fixture {
    catalog: Vec<PlatformConflictRule>,
    cases: Vec<FixtureCase>,
}

#[derive(Deserialize)]
struct FixtureCase {
    name: String,
    environment: PlatformConflictEnvironment,
    bindings: Vec<Binding>,
    expected: Vec<ExpectedDiagnostic>,
}

#[derive(Deserialize, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct ExpectedDiagnostic {
    binding_id: String,
    kind: String,
    #[serde(default)]
    rule_id: Option<String>,
}

#[test]
fn platform_conflict_diagnostics_match_shared_fixture() {
    let fixture: Fixture = serde_json::from_str(
        &fs::read_to_string(fixture_path()).expect("platform conflict fixture should be readable"),
    )
    .expect("platform conflict fixture should deserialize");

    for entry in fixture.cases {
        let actual =
            analyze_platform_conflicts(&entry.bindings, &fixture.catalog, &entry.environment)
                .iter()
                .map(|diagnostic| ExpectedDiagnostic {
                    binding_id: diagnostic.binding_id.clone(),
                    kind: serde_json::to_value(&diagnostic.kind)
                        .expect("kind should serialize")
                        .as_str()
                        .expect("kind should be a string")
                        .to_owned(),
                    rule_id: diagnostic.rule_id.clone(),
                })
                .collect::<Vec<_>>();
        assert_eq!(actual, entry.expected, "case: {}", entry.name);
    }
}
