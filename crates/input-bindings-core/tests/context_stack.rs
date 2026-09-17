use std::{collections::BTreeSet, fs, path::PathBuf};

use input_bindings_core::{
    Binding, ContextLayer, InputStroke, ResolutionCandidateStatus,
    explain_resolution_with_context_stack, resolve_with_context_stack,
};
use serde::Deserialize;
use serde_json::Value;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ContextStackFixture {
    bindings: Vec<Binding>,
    cases: Vec<ContextStackCase>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ContextStackCase {
    name: String,
    sequence: Vec<InputStroke>,
    active_contexts: Vec<String>,
    context_stack: Vec<ContextLayer>,
    expected: Value,
}

#[test]
fn context_stack_resolution_and_trace_match_shared_fixture() {
    let fixture = load_fixture();

    for case in fixture.cases {
        let active_contexts = case.active_contexts.into_iter().collect::<BTreeSet<_>>();
        let actual = resolve_with_context_stack(
            &fixture.bindings,
            &case.sequence,
            &active_contexts,
            &case.context_stack,
        );
        let actual = serde_json::to_value(actual).expect("resolution should serialize");
        assert_eq!(actual, case.expected, "case: {}", case.name);

        let trace = explain_resolution_with_context_stack(
            &fixture.bindings,
            &case.sequence,
            &active_contexts,
            &case.context_stack,
        );
        let traced = serde_json::to_value(trace.resolution).expect("trace resolution should serialize");
        assert_eq!(traced, case.expected, "trace case: {}", case.name);
    }
}

#[test]
fn resolution_trace_exposes_modal_blocking_and_winning_layer() {
    let fixture = load_fixture();
    let case = fixture
        .cases
        .iter()
        .find(|case| case.name == "blocking layer still resolves its own binding")
        .expect("fixture case should exist");
    let active_contexts = case.active_contexts.iter().cloned().collect::<BTreeSet<_>>();
    let trace = explain_resolution_with_context_stack(
        &fixture.bindings,
        &case.sequence,
        &active_contexts,
        &case.context_stack,
    );

    let barrier = trace.barrier.expect("menu should be a modal barrier");
    assert_eq!(barrier.id, "menu");
    assert_eq!(barrier.depth, 1);
    assert_eq!(trace.active_contexts, vec!["gameplay", "menu"]);
    assert_eq!(
        candidate_status(&trace.candidates, "gameplay.primary"),
        ResolutionCandidateStatus::BlockedByModal
    );
    assert_eq!(
        candidate_status(&trace.candidates, "menu.primary"),
        ResolutionCandidateStatus::Winner
    );
}

#[test]
fn resolution_trace_explains_higher_layer_chord_waiting() {
    let fixture = load_fixture();
    let case = fixture
        .cases
        .iter()
        .find(|case| case.name == "top-layer chord prefix suppresses a lower-layer exact binding")
        .expect("fixture case should exist");
    let active_contexts = case.active_contexts.iter().cloned().collect::<BTreeSet<_>>();
    let trace = explain_resolution_with_context_stack(
        &fixture.bindings,
        &case.sequence,
        &active_contexts,
        &case.context_stack,
    );

    assert_eq!(
        candidate_status(&trace.candidates, "gameplay.leader"),
        ResolutionCandidateStatus::LowerContextLayer
    );
    assert_eq!(
        candidate_status(&trace.candidates, "menu.chord"),
        ResolutionCandidateStatus::PendingContinuation
    );
}

fn candidate_status(
    candidates: &[input_bindings_core::ResolutionCandidateTrace],
    binding_id: &str,
) -> ResolutionCandidateStatus {
    candidates
        .iter()
        .find(|candidate| candidate.binding_id == binding_id)
        .map(|candidate| candidate.status)
        .expect("candidate should exist")
}

fn load_fixture() -> ContextStackFixture {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../fixtures")
        .join("context-stack.json");
    serde_json::from_str(
        &fs::read_to_string(path).expect("context stack fixture should be readable"),
    )
    .expect("context stack fixture should be valid")
}
