use std::{collections::BTreeSet, fs, path::PathBuf};

use input_bindings_core::{Binding, ContextLayer, InputStroke, resolve_with_context_stack};
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
fn context_stack_resolution_matches_shared_fixture() {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../fixtures")
        .join("context-stack.json");
    let fixture: ContextStackFixture = serde_json::from_str(
        &fs::read_to_string(path).expect("context stack fixture should be readable"),
    )
    .expect("context stack fixture should be valid");

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
    }
}
