use std::{collections::BTreeSet, fs, path::PathBuf};

use input_bindings_core::{
    Binding, Conflict, KeyStroke, Profile, ProfileApplication, analyze_conflicts, apply_profile,
    resolve,
};
use serde::Deserialize;
use serde_json::Value;

fn fixture_path(name: &str) -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../fixtures")
        .join(name)
}

fn read_fixture(name: &str) -> String {
    fs::read_to_string(fixture_path(name)).expect("fixture should be readable")
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ResolutionFixture {
    bindings: Vec<Binding>,
    cases: Vec<ResolutionCase>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ResolutionCase {
    name: String,
    sequence: Vec<KeyStroke>,
    active_contexts: Vec<String>,
    expected: Value,
}

#[test]
fn resolution_matches_shared_fixture() {
    let fixture: ResolutionFixture =
        serde_json::from_str(&read_fixture("resolution.json")).expect("valid resolution fixture");

    for case in fixture.cases {
        let active_contexts = case.active_contexts.into_iter().collect::<BTreeSet<_>>();
        let actual = resolve(&fixture.bindings, &case.sequence, &active_contexts);
        let actual = serde_json::to_value(actual).expect("resolution should serialize");
        assert_eq!(actual, case.expected, "case: {}", case.name);
    }
}

#[derive(Deserialize)]
struct ConflictFixture {
    bindings: Vec<Binding>,
    expected: Vec<Conflict>,
}

#[test]
fn conflicts_match_shared_fixture() {
    let fixture: ConflictFixture =
        serde_json::from_str(&read_fixture("conflicts.json")).expect("valid conflict fixture");
    assert_eq!(analyze_conflicts(&fixture.bindings), fixture.expected);
}

#[derive(Deserialize)]
struct ProfileFixture {
    base: Vec<Binding>,
    profile: Profile,
    expected: ProfileApplication,
}

#[test]
fn profiles_match_shared_fixture() {
    let fixture: ProfileFixture =
        serde_json::from_str(&read_fixture("profiles.json")).expect("valid profile fixture");
    assert_eq!(
        apply_profile(&fixture.base, &fixture.profile),
        fixture.expected
    );
}
