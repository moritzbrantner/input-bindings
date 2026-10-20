use input_bindings_core::{ActionRegistry, Binding, Profile, apply_profile, profile_from_bindings};
use serde::Deserialize;

#[derive(Deserialize)]
struct Fixture {
    registry: ActionRegistry,
    cases: Vec<Case>,
}
#[derive(Deserialize)]
struct Case {
    name: String,
    bindings: Vec<Binding>,
    expected: Profile,
}

#[test]
fn editor_deltas_match_the_shared_fixture_and_recreate_effective_bindings() {
    let fixture: Fixture =
        serde_json::from_str(include_str!("../../../fixtures/editor-profiles.json")).unwrap();
    let defaults = fixture
        .registry
        .actions
        .iter()
        .flat_map(|action| action.defaults.clone())
        .collect::<Vec<_>>();
    for case in fixture.cases {
        let profile = profile_from_bindings(&fixture.registry, &case.bindings, &case.expected.id);
        assert_eq!(profile, case.expected, "{}", case.name);
        let application = apply_profile(&defaults, &profile);
        assert!(application.diagnostics.is_empty());
        let mut actual = application.bindings;
        let mut expected = case.bindings;
        actual.sort_by(|a, b| a.id.cmp(&b.id));
        expected.sort_by(|a, b| a.id.cmp(&b.id));
        assert_eq!(actual, expected, "{}", case.name);
    }
}
