use std::collections::BTreeSet;

use input_bindings_core::{
    Binding, Conflict, ConflictDisposition, ConflictRepair, InputStroke, analyze_conflicts,
    apply_conflict_repair, plan_conflict_repairs, resolve,
};
use serde_json::{Value, json};

fn parse_bindings(value: Value) -> Vec<Binding> {
    serde_json::from_value(value).expect("bindings should deserialize")
}

fn sequence(value: &str) -> Vec<InputStroke> {
    serde_json::from_value(json!([{"key":{"kind":"logical","value":value}}]))
        .expect("sequence should deserialize")
}

fn conflict_between(bindings: &[Binding], left: &str, right: &str) -> Conflict {
    analyze_conflicts(bindings)
        .into_iter()
        .find(|conflict| {
            (conflict.left_binding_id == left && conflict.right_binding_id == right)
                || (conflict.left_binding_id == right && conflict.right_binding_id == left)
        })
        .expect("bindings should conflict")
}

fn repair_kinds(repairs: &[ConflictRepair]) -> Vec<String> {
    repairs
        .iter()
        .map(|repair| {
            serde_json::to_value(repair)
                .expect("repair should serialize")
                .get("kind")
                .and_then(Value::as_str)
                .expect("repair should have kind")
                .to_owned()
        })
        .collect()
}

#[test]
fn ambiguous_exact_bindings_offer_prefer_or_unbind_repairs() {
    let bindings = parse_bindings(json!([
        {"id":"editor.first","action":"editor.first","sequence":[{"key":{"kind":"logical","value":"a"}}],"when":{"op":"context","id":"editor"}},
        {"id":"editor.second","action":"editor.second","sequence":[{"key":{"kind":"logical","value":"a"}}],"when":{"op":"context","id":"editor"}}
    ]));
    let conflict = conflict_between(&bindings, "editor.first", "editor.second");
    let plan = plan_conflict_repairs(&bindings, &conflict);

    assert_eq!(plan.disposition, ConflictDisposition::Ambiguous);
    assert_eq!(
        repair_kinds(&plan.repairs),
        vec!["prefer", "prefer", "unbind", "unbind"]
    );

    let prefer_first = plan
        .repairs
        .iter()
        .find(|repair| matches!(repair, ConflictRepair::Prefer { binding_id, .. } if binding_id == "editor.first"))
        .expect("prefer repair should exist");
    let repaired = apply_conflict_repair(&bindings, prefer_first);
    let contexts = BTreeSet::from(["editor".to_owned()]);
    assert_eq!(
        serde_json::to_value(resolve(&repaired, &sequence("a"), &contexts)).unwrap(),
        json!({"kind":"resolved","bindingId":"editor.first","action":"editor.first"})
    );
    assert_eq!(
        serde_json::to_value(conflict_between(&repaired, "editor.first", "editor.second").kind)
            .unwrap(),
        json!("overrideExact")
    );
}

#[test]
fn context_narrowing_preserves_global_fallback_outside_the_other_context() {
    let bindings = parse_bindings(json!([
        {"id":"global.escape","action":"global.escape","sequence":[{"key":{"kind":"logical","value":"Escape"}}]},
        {"id":"menu.escape","action":"menu.escape","sequence":[{"key":{"kind":"logical","value":"Escape"}}],"when":{"op":"context","id":"menu"}}
    ]));
    let conflict = conflict_between(&bindings, "global.escape", "menu.escape");
    let plan = plan_conflict_repairs(&bindings, &conflict);

    assert_eq!(plan.disposition, ConflictDisposition::OrderedOverride);
    let narrow_global = plan
        .repairs
        .iter()
        .find(|repair| matches!(repair, ConflictRepair::NarrowContext { binding_id, .. } if binding_id == "global.escape"))
        .expect("narrow repair should exist");
    let repaired = apply_conflict_repair(&bindings, narrow_global);
    assert!(analyze_conflicts(&repaired).is_empty());
    assert_eq!(
        serde_json::to_value(resolve(&repaired, &sequence("Escape"), &BTreeSet::new())).unwrap(),
        json!({"kind":"resolved","bindingId":"global.escape","action":"global.escape"})
    );
    assert_eq!(
        serde_json::to_value(resolve(
            &repaired,
            &sequence("Escape"),
            &BTreeSet::from(["menu".to_owned()]),
        ))
        .unwrap(),
        json!({"kind":"resolved","bindingId":"menu.escape","action":"menu.escape"})
    );
}

#[test]
fn identical_scopes_do_not_offer_degenerate_context_narrowing() {
    let bindings = parse_bindings(json!([
        {"id":"game.leader","action":"game.leader","sequence":[{"key":{"kind":"logical","value":"k"}}],"when":{"op":"context","id":"gameplay"}},
        {"id":"game.chord","action":"game.chord","sequence":[{"key":{"kind":"logical","value":"k"}},{"key":{"kind":"logical","value":"c"}}],"when":{"op":"context","id":"gameplay"}}
    ]));
    let conflict = conflict_between(&bindings, "game.leader", "game.chord");
    let plan = plan_conflict_repairs(&bindings, &conflict);

    assert_eq!(plan.disposition, ConflictDisposition::ChordPrefix);
    assert_eq!(repair_kinds(&plan.repairs), vec!["unbind", "unbind"]);
}

#[test]
fn duplicate_same_action_bindings_can_be_kept_or_deduplicated() {
    let bindings = parse_bindings(json!([
        {"id":"save.one","action":"save","sequence":[{"key":{"kind":"logical","value":"s"}}]},
        {"id":"save.two","action":"save","sequence":[{"key":{"kind":"logical","value":"s"}}]}
    ]));
    let conflict = conflict_between(&bindings, "save.one", "save.two");
    let plan = plan_conflict_repairs(&bindings, &conflict);

    assert_eq!(plan.disposition, ConflictDisposition::Redundant);
    assert_eq!(
        repair_kinds(&plan.repairs),
        vec!["keep", "unbind", "unbind"]
    );
}
