use std::{collections::BTreeSet, fs, path::PathBuf};

use input_bindings_core::{
    ActionRegistry, Binding, Conflict, GestureMatch, GestureResolution, ValidationDiagnostic,
    analyze_conflicts, resolve_gesture, validate_registry,
};
use serde::Deserialize;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GestureFixture {
    bindings: Vec<Binding>,
    resolution_cases: Vec<GestureResolutionCase>,
    expected_conflicts: Vec<Conflict>,
    validation: GestureValidationFixture,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GestureResolutionCase {
    name: String,
    recognized: Vec<GestureMatch>,
    active_contexts: Vec<String>,
    expected: GestureResolution,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GestureValidationFixture {
    registry: ActionRegistry,
    expected_diagnostics: Vec<ValidationDiagnostic>,
    expected_effective_binding_ids: Vec<String>,
}

fn fixture() -> GestureFixture {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../fixtures/gestures.json");
    let content = fs::read_to_string(path).expect("gesture fixture should be readable");
    serde_json::from_str(&content).expect("gesture fixture should deserialize")
}

#[test]
fn gesture_resolution_matches_shared_fixture() {
    let fixture = fixture();
    for case in fixture.resolution_cases {
        let contexts = case.active_contexts.into_iter().collect::<BTreeSet<_>>();
        let actual = resolve_gesture(&fixture.bindings, &case.recognized, &contexts);
        assert_eq!(actual, case.expected, "case: {}", case.name);
    }
}

#[test]
fn gesture_conflicts_match_shared_fixture() {
    let fixture = fixture();
    assert_eq!(
        analyze_conflicts(&fixture.bindings),
        fixture.expected_conflicts
    );
}

#[test]
fn gesture_validation_matches_shared_fixture() {
    let fixture = fixture().validation;
    let report = validate_registry(&fixture.registry, None);
    assert!(!report.valid);
    assert_eq!(report.diagnostics, fixture.expected_diagnostics);
    assert_eq!(
        report
            .effective_bindings
            .iter()
            .map(|binding| binding.id.clone())
            .collect::<Vec<_>>(),
        fixture.expected_effective_binding_ids
    );
}

#[test]
fn gesture_strokes_round_trip_through_canonical_json() {
    let fixture = fixture();
    let serialized = serde_json::to_value(&fixture.bindings).expect("bindings serialize");
    let reparsed: Vec<Binding> =
        serde_json::from_value(serialized.clone()).expect("bindings deserialize");
    assert_eq!(reparsed, fixture.bindings);
    assert_eq!(
        serialized[0]["sequence"][0],
        serde_json::json!({"device": "gesture", "gesture": {"kind": "slash", "direction": "NE"}})
    );
    assert_eq!(
        serialized[1]["sequence"][0],
        serde_json::json!({"device": "gesture", "gesture": {"kind": "slash"}})
    );
}
