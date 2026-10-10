use std::{fs, path::PathBuf};

use input_bindings_core::{
    ActionDefinition, ActionRegistry, Binding, BindingPatch, ContextLayer, DeviceClass,
    InputRuntime, InputRuntimeOptions, InputStroke, KeyMatch, KeyStroke, Modifiers, Profile,
    RepeatPolicy, RuntimeActionPhase, RuntimeConsumePolicy, RuntimeDecision, RuntimeDecisionKind,
    RuntimeDispatchReason, SemanticControlState, WhenExpr,
};
use serde::{Deserialize, Serialize};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct LifecycleFixture {
    registry: ActionRegistry,
    cases: Vec<LifecycleCase>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct LifecycleCase {
    name: String,
    chord_timeout_ms: Option<u64>,
    active_contexts: Vec<String>,
    context_stack: Option<Vec<ContextLayer>>,
    steps: Vec<LifecycleStep>,
    expected: Vec<Observation>,
}

#[derive(Deserialize)]
#[serde(tag = "op", rename_all = "camelCase", rename_all_fields = "camelCase")]
enum LifecycleStep {
    Down {
        stroke: InputStroke,
        repeat: bool,
        at_ms: u64,
    },
    Up {
        stroke: InputStroke,
        at_ms: u64,
    },
    Advance {
        at_ms: u64,
    },
    Reset {
        reason: String,
    },
    SetActiveContexts {
        contexts: Vec<String>,
    },
    PushContext {
        layer: ContextLayer,
    },
    PopContext,
}

#[derive(Debug, PartialEq, Eq, Serialize, Deserialize)]
struct Observation {
    decisions: Vec<String>,
    dispatches: Vec<String>,
    held: Vec<String>,
    presses: Vec<String>,
}

fn json_name(value: impl Serialize) -> String {
    serde_json::to_value(value)
        .expect("runtime enums serialize")
        .as_str()
        .expect("runtime enums serialize as strings")
        .to_owned()
}

fn observe(decisions: &[RuntimeDecision], state: &mut SemanticControlState) -> Observation {
    state.apply_decisions(decisions);
    Observation {
        decisions: decisions
            .iter()
            .map(|decision| {
                let consumed = if decision.consumed { ":consumed" } else { "" };
                format!(
                    "{}:{}{consumed}",
                    json_name(decision.kind),
                    json_name(decision.explanation.reason)
                )
            })
            .collect(),
        dispatches: decisions
            .iter()
            .flat_map(|decision| &decision.dispatches)
            .map(|dispatch| {
                format!(
                    "{} {} {} {}",
                    json_name(dispatch.phase),
                    dispatch.action,
                    dispatch.binding_id,
                    json_name(dispatch.reason)
                )
            })
            .collect(),
        held: state.snapshot().held,
        presses: state.drain_presses(),
    }
}

/// The browser runtime runs the same fixture (`runtime-lifecycle.test.ts`); context changes
/// there are the consumer's explicit `reset("contextChanged")`.
#[test]
fn runtime_lifecycle_matches_the_shared_browser_fixture() {
    let path =
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../fixtures/runtime-lifecycle.json");
    let fixture: LifecycleFixture =
        serde_json::from_str(&fs::read_to_string(path).expect("lifecycle fixture is readable"))
            .expect("lifecycle fixture is valid");

    for case in fixture.cases {
        let mut options = InputRuntimeOptions::default();
        if let Some(timeout) = case.chord_timeout_ms {
            options.chord_timeout_ms = timeout;
        }
        let mut runtime = InputRuntime::new(fixture.registry.clone(), None, options);
        runtime.set_active_contexts(case.active_contexts.clone());
        runtime.set_context_stack(case.context_stack.clone());
        let mut state = SemanticControlState::new();
        let actual = case
            .steps
            .into_iter()
            .map(|step| {
                let decisions = match step {
                    LifecycleStep::Down {
                        stroke,
                        repeat,
                        at_ms,
                    } => runtime.input_down(stroke, repeat, at_ms),
                    LifecycleStep::Up { stroke, at_ms } => runtime.input_up(&stroke, at_ms),
                    LifecycleStep::Advance { at_ms } => {
                        runtime.advance(at_ms).into_iter().collect()
                    }
                    LifecycleStep::Reset { reason } => vec![runtime.reset(&reason)],
                    LifecycleStep::SetActiveContexts { contexts } => {
                        vec![runtime.set_active_contexts(contexts)]
                    }
                    LifecycleStep::PushContext { layer } => vec![runtime.push_context(layer)],
                    LifecycleStep::PopContext => vec![runtime.pop_context().1],
                };
                observe(&decisions, &mut state)
            })
            .collect::<Vec<_>>();
        assert_eq!(actual, case.expected, "case: {}", case.name);
    }
}

fn key(value: &str) -> InputStroke {
    InputStroke::Keyboard(KeyStroke {
        key: KeyMatch::Physical {
            value: value.to_owned(),
        },
        modifiers: Modifiers::default(),
    })
}

fn registry(actions: &[(&str, &str, RepeatPolicy)]) -> ActionRegistry {
    ActionRegistry {
        actions: actions
            .iter()
            .map(|(action, code, repeat_policy)| ActionDefinition {
                id: (*action).to_owned(),
                title: (*action).to_owned(),
                description: None,
                category_path: Vec::new(),
                repeat_policy: repeat_policy.clone(),
                allowed_devices: vec![DeviceClass::Keyboard],
                defaults: vec![Binding {
                    id: format!("{action}.default"),
                    action: (*action).to_owned(),
                    sequence: vec![key(code)],
                    when: WhenExpr::Always,
                    priority: 0,
                }],
                provenance: None,
            })
            .collect(),
    }
}

#[test]
fn profile_and_configuration_changes_release_held_actions_first() {
    let mut runtime = InputRuntime::new(
        registry(&[("move", "KeyW", RepeatPolicy::Allow)]),
        None,
        InputRuntimeOptions::default(),
    );
    runtime.input_down(key("KeyW"), false, 0);

    let removed = Profile {
        id: "user".to_owned(),
        patches: vec![BindingPatch::Remove {
            binding_id: "move.default".to_owned(),
        }],
    };
    let reset = runtime.update_profile(Some(removed));
    assert_eq!(reset.kind, RuntimeDecisionKind::Reset);
    assert_eq!(
        reset.explanation.reset_reason.as_deref(),
        Some("profileChanged")
    );
    assert_eq!(reset.dispatches.len(), 1);
    assert_eq!(reset.dispatches[0].phase, RuntimeActionPhase::Release);
    assert_eq!(reset.dispatches[0].reason, RuntimeDispatchReason::Reset);
    assert!(runtime.effective_bindings().is_empty());
    assert_eq!(
        runtime.input_down(key("KeyW"), false, 10)[0].kind,
        RuntimeDecisionKind::None
    );

    let reset =
        runtime.update_configuration(registry(&[("jump", "Space", RepeatPolicy::Never)]), None);
    assert_eq!(
        reset.explanation.reset_reason.as_deref(),
        Some("configurationChanged")
    );
    assert_eq!(
        runtime.input_down(key("Space"), false, 20)[0].dispatches[0].action,
        "jump"
    );
}

#[test]
fn invalid_configuration_is_fail_closed() {
    let mut duplicate = registry(&[("move", "KeyW", RepeatPolicy::Never)]);
    duplicate.actions.push(duplicate.actions[0].clone());
    let mut runtime = InputRuntime::new(duplicate, None, InputRuntimeOptions::default());
    assert!(!runtime.validation_report().valid);
    let decision = runtime.input_down(key("KeyW"), false, 0).remove(0);
    assert_eq!(decision.kind, RuntimeDecisionKind::InvalidConfiguration);
    assert!(decision.dispatches.is_empty());
    assert!(!decision.consumed);
}

#[test]
fn consume_policy_and_pending_deadline_follow_the_options() {
    let leader = |code: &str| {
        InputStroke::Keyboard(KeyStroke {
            key: KeyMatch::Logical {
                value: code.to_owned(),
            },
            modifiers: Modifiers {
                ctrl: true,
                ..Modifiers::default()
            },
        })
    };
    let chord = ActionRegistry {
        actions: vec![ActionDefinition {
            id: "comment".to_owned(),
            title: "comment".to_owned(),
            description: None,
            category_path: Vec::new(),
            repeat_policy: RepeatPolicy::Never,
            allowed_devices: vec![DeviceClass::Keyboard],
            defaults: vec![Binding {
                id: "comment.default".to_owned(),
                action: "comment".to_owned(),
                sequence: vec![leader("k"), leader("c")],
                when: WhenExpr::Always,
                priority: 0,
            }],
            provenance: None,
        }],
    };
    let mut runtime = InputRuntime::new(
        chord,
        None,
        InputRuntimeOptions {
            chord_timeout_ms: 250,
            consume_policy: RuntimeConsumePolicy::Dispatched,
            retry_on_chord_mismatch: true,
        },
    );
    let pending = runtime.input_down(leader("k"), false, 1000).remove(0);
    assert_eq!(pending.kind, RuntimeDecisionKind::Pending);
    assert!(!pending.consumed);
    assert_eq!(runtime.pending_deadline_ms(), Some(1250));
    assert!(runtime.advance(1249).is_none());
    let expired = runtime.advance(1250).expect("the chord times out");
    assert_eq!(expired.kind, RuntimeDecisionKind::Cancelled);
    assert!(!runtime.has_pending_chord());
    assert_eq!(runtime.pending_deadline_ms(), None);
}

#[test]
fn held_state_samples_axes_and_presses_between_ticks() {
    let mut runtime = InputRuntime::new(
        registry(&[
            ("left", "KeyA", RepeatPolicy::Never),
            ("right", "KeyD", RepeatPolicy::Never),
            ("jump", "Space", RepeatPolicy::Never),
        ]),
        None,
        InputRuntimeOptions::default(),
    );
    let mut state = SemanticControlState::new();
    state.apply_decisions(&runtime.input_down(key("KeyD"), false, 0));
    // A press and release between two ticks is still sampled once.
    state.apply_decisions(&runtime.input_down(key("Space"), false, 5));
    state.apply_decisions(&runtime.input_up(&key("Space"), 8));
    assert_eq!(state.axis("left", "right"), 1);
    assert!(!state.is_held("jump"));
    assert_eq!(state.drain_presses(), ["right", "jump"]);
    assert!(state.drain_presses().is_empty());
    state.apply_decisions(&runtime.input_down(key("KeyA"), false, 16));
    assert_eq!(state.axis("left", "right"), 0);
    state.apply_decisions([&runtime.reset("blur")]);
    assert_eq!(state.axis("left", "right"), 0);
    assert!(state.snapshot().held.is_empty());
}

/// Observable orderings follow UTF-16 code units, as in the browser runtime
/// (`runtime-order.test.ts`): a supplementary character sorts before a later BMP one.
#[test]
fn contexts_and_held_actions_order_by_utf16_code_units() {
    let mut runtime = InputRuntime::new(
        registry(&[
            ("\u{e000}", "KeyA", RepeatPolicy::Never),
            ("😀", "KeyB", RepeatPolicy::Never),
            ("go", "KeyC", RepeatPolicy::Never),
        ]),
        None,
        InputRuntimeOptions::default(),
    );
    runtime.set_active_contexts(vec!["\u{e000}".to_owned(), "😀".to_owned(), "g".to_owned()]);
    let mut state = SemanticControlState::new();
    let mut last = Vec::new();
    for code in ["KeyA", "KeyB", "KeyC"] {
        last = runtime.input_down(key(code), false, 0);
        state.apply_decisions(&last);
    }
    assert_eq!(last[0].active_contexts, ["g", "😀", "\u{e000}"]);
    assert_eq!(state.snapshot().held, ["go", "😀", "\u{e000}"]);
}
