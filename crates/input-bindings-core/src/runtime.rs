//! Platform-neutral runtime controller: the Rust counterpart of the browser
//! `InputRuntimeController` plus `SemanticControlState`.
//!
//! Callers feed normalized [`InputStroke`] down/up events with a caller-owned clock
//! (`now_ms`); the controller resolves them against the effective bindings and the
//! active contexts, tracks which activation pressed which semantic action, and pairs
//! every release with that activation. Chord timeouts fire from [`InputRuntime::advance`]
//! or from the next input event, so a fixed-tick consumer never needs a scheduler.

use std::collections::{BTreeMap, BTreeSet};

use serde::{Deserialize, Serialize};

use crate::{
    ActionRegistry, Binding, CompiledActionRegistry, ContextLayer, DeviceStroke, InputStroke,
    KeyMatch, Profile, RegistryValidationReport, RepeatPolicy, Resolution, compile_action_registry,
    resolve, resolve::code_unit_order, resolve_with_context_stack, validate_compiled_registry,
};

/// Default chord timeout, identical to the browser runtime.
pub const DEFAULT_CHORD_TIMEOUT_MS: u64 = 1000;

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum RuntimeActionPhase {
    #[default]
    Press,
    Repeat,
    Release,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum RuntimeConsumePolicy {
    Never,
    #[default]
    Matched,
    Dispatched,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum RuntimeDispatchReason {
    Direct,
    Chord,
    Timeout,
    KeyUp,
    Reset,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum RuntimeDecisionKind {
    None,
    Pending,
    Dispatched,
    Released,
    Ambiguous,
    RepeatSuppressed,
    Cancelled,
    Reset,
    InvalidConfiguration,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum RuntimeDecisionReason {
    Unmatched,
    PendingChord,
    Resolved,
    Ambiguous,
    RepeatSuppressed,
    KeyReleased,
    ChordMismatch,
    ChordCancelled,
    TimeoutResolved,
    TimeoutAmbiguous,
    TimeoutExpired,
    Reset,
    InvalidConfiguration,
}

/// One semantic action edge. Releases carry the binding and sequence of the press they end.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeDispatch {
    pub action: String,
    pub binding_id: String,
    pub phase: RuntimeActionPhase,
    pub repeat: bool,
    pub reason: RuntimeDispatchReason,
    pub sequence: Vec<InputStroke>,
    pub active_contexts: Vec<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeExplanation {
    pub reason: RuntimeDecisionReason,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub binding_ids: Option<Vec<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub continuation_binding_ids: Option<Vec<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cancelled_sequence: Option<Vec<InputStroke>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reset_reason: Option<String>,
}

impl RuntimeExplanation {
    fn new(reason: RuntimeDecisionReason) -> Self {
        Self {
            reason,
            binding_ids: None,
            continuation_binding_ids: None,
            cancelled_sequence: None,
            reset_reason: None,
        }
    }

    fn bindings(mut self, binding_ids: Vec<String>) -> Self {
        self.binding_ids = Some(binding_ids);
        self
    }

    fn cancelled(mut self, cancelled: Option<Vec<InputStroke>>) -> Self {
        self.cancelled_sequence = cancelled;
        self
    }
}

/// What the runtime decided for one input event, timeout or lifecycle call.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeDecision {
    pub kind: RuntimeDecisionKind,
    pub sequence: Vec<InputStroke>,
    pub active_contexts: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub resolution: Option<Resolution>,
    pub dispatches: Vec<RuntimeDispatch>,
    pub consumed: bool,
    pub explanation: RuntimeExplanation,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct InputRuntimeOptions {
    pub chord_timeout_ms: u64,
    pub consume_policy: RuntimeConsumePolicy,
    pub retry_on_chord_mismatch: bool,
}

impl Default for InputRuntimeOptions {
    fn default() -> Self {
        Self {
            chord_timeout_ms: DEFAULT_CHORD_TIMEOUT_MS,
            consume_policy: RuntimeConsumePolicy::Matched,
            retry_on_chord_mismatch: true,
        }
    }
}

/// The physical input a release pairs with. Modifiers are deliberately not part of it, so
/// releasing `S` after `Ctrl` releases the `Ctrl+S` activation (browser parity).
#[derive(Clone, Debug, PartialEq, Eq)]
enum TriggerKey {
    Key(KeyMatch),
    MouseButton(u16),
    Wheel(crate::WheelDirection),
    GamepadButton {
        gamepad: Option<u8>,
        button: u16,
        threshold: u8,
    },
    GamepadAxis {
        gamepad: Option<u8>,
        axis: u8,
        direction: crate::AxisDirection,
        threshold: u8,
        deadzone: u8,
    },
    Gesture(crate::GestureMatch),
}

impl TriggerKey {
    fn of(stroke: &InputStroke) -> Self {
        match stroke {
            InputStroke::Keyboard(key) => Self::Key(key.key.clone()),
            InputStroke::Device(DeviceStroke::MouseButton { button, .. }) => {
                Self::MouseButton(*button)
            }
            InputStroke::Device(DeviceStroke::Wheel { direction, .. }) => {
                Self::Wheel(direction.clone())
            }
            InputStroke::Device(DeviceStroke::GamepadButton {
                button,
                threshold,
                gamepad,
            }) => Self::GamepadButton {
                gamepad: *gamepad,
                button: *button,
                threshold: *threshold,
            },
            InputStroke::Device(DeviceStroke::GamepadAxis {
                axis,
                direction,
                threshold,
                deadzone,
                gamepad,
            }) => Self::GamepadAxis {
                gamepad: *gamepad,
                axis: *axis,
                direction: direction.clone(),
                threshold: *threshold,
                deadzone: *deadzone,
            },
            InputStroke::Device(DeviceStroke::Gesture { gesture }) => {
                Self::Gesture(gesture.clone())
            }
        }
    }
}

#[derive(Clone, Debug)]
struct Activation {
    action: String,
    binding_id: String,
    sequence: Vec<InputStroke>,
}

/// Resolves normalized input into semantic action presses, repeats and releases.
///
/// Contexts belong to the runtime: changing the active contexts or the context stack
/// retires every held action (`reset` with reason `contextChanged`), as does a
/// configuration or profile change, so no action stays held across a transition.
#[derive(Clone, Debug)]
pub struct InputRuntime {
    registry: ActionRegistry,
    compiled: CompiledActionRegistry,
    profile: Option<Profile>,
    report: RegistryValidationReport,
    options: InputRuntimeOptions,
    active_contexts: BTreeSet<String>,
    context_stack: Option<Vec<ContextLayer>>,
    pending: Vec<InputStroke>,
    pending_exact_binding_ids: Vec<String>,
    pending_deadline_ms: Option<u64>,
    /// Held activations per trigger input, in first-activation order.
    active: Vec<(TriggerKey, Vec<Activation>)>,
    pressed: Vec<TriggerKey>,
}

impl InputRuntime {
    pub fn new(
        registry: ActionRegistry,
        profile: Option<Profile>,
        options: InputRuntimeOptions,
    ) -> Self {
        let compiled = compile_action_registry(&registry);
        let report = validate_compiled_registry(&compiled, profile.as_ref());
        Self {
            registry,
            compiled,
            profile,
            report,
            options,
            active_contexts: BTreeSet::new(),
            context_stack: None,
            pending: Vec::new(),
            pending_exact_binding_ids: Vec::new(),
            pending_deadline_ms: None,
            active: Vec::new(),
            pressed: Vec::new(),
        }
    }

    pub fn validation_report(&self) -> &RegistryValidationReport {
        &self.report
    }

    pub fn effective_bindings(&self) -> &[Binding] {
        &self.report.effective_bindings
    }

    pub fn pending_sequence(&self) -> &[InputStroke] {
        &self.pending
    }

    pub fn has_pending_chord(&self) -> bool {
        !self.pending.is_empty()
    }

    /// When the pending chord times out, if one is pending.
    pub fn pending_deadline_ms(&self) -> Option<u64> {
        self.pending_deadline_ms
    }

    pub fn active_contexts(&self) -> Vec<String> {
        self.contexts()
    }

    pub fn context_stack(&self) -> Option<&[ContextLayer]> {
        self.context_stack.as_deref()
    }

    pub fn update_configuration(
        &mut self,
        registry: ActionRegistry,
        profile: Option<Profile>,
    ) -> RuntimeDecision {
        let decision = self.reset("configurationChanged");
        self.compiled = compile_action_registry(&registry);
        self.registry = registry;
        self.profile = profile;
        self.report = validate_compiled_registry(&self.compiled, self.profile.as_ref());
        decision
    }

    pub fn update_profile(&mut self, profile: Option<Profile>) -> RuntimeDecision {
        let decision = self.reset("profileChanged");
        self.profile = profile;
        self.report = validate_compiled_registry(&self.compiled, self.profile.as_ref());
        decision
    }

    /// Replaces the flat active contexts and retires every held action.
    pub fn set_active_contexts(
        &mut self,
        contexts: impl IntoIterator<Item = String>,
    ) -> RuntimeDecision {
        self.active_contexts = contexts.into_iter().collect();
        self.reset("contextChanged")
    }

    /// Replaces the context stack (`None` resolves without one) and retires every held action.
    pub fn set_context_stack(&mut self, stack: Option<Vec<ContextLayer>>) -> RuntimeDecision {
        self.context_stack = stack;
        self.reset("contextChanged")
    }

    /// Pushes a layer on top of the context stack and retires every held action.
    pub fn push_context(&mut self, layer: ContextLayer) -> RuntimeDecision {
        self.context_stack.get_or_insert_with(Vec::new).push(layer);
        self.reset("contextChanged")
    }

    /// Pops the top context layer, if any, and retires every held action.
    pub fn pop_context(&mut self) -> (Option<ContextLayer>, RuntimeDecision) {
        let popped = self.context_stack.as_mut().and_then(Vec::pop);
        (popped, self.reset("contextChanged"))
    }

    /// Fires an expired chord timeout. Returns its decision, if one was due by `now_ms`.
    pub fn advance(&mut self, now_ms: u64) -> Option<RuntimeDecision> {
        match self.pending_deadline_ms {
            Some(deadline) if deadline <= now_ms => {
                self.pending_deadline_ms = None;
                self.flush_pending_timeout()
            }
            _ => None,
        }
    }

    /// An input went down (or auto-repeated). Any chord timeout due by `now_ms` fires first,
    /// so the result holds that timeout's decision, if any, followed by this event's.
    pub fn input_down(
        &mut self,
        stroke: InputStroke,
        repeat: bool,
        now_ms: u64,
    ) -> Vec<RuntimeDecision> {
        let mut decisions = self.advance(now_ms).into_iter().collect::<Vec<_>>();
        decisions.push(self.handle_input_down(stroke, repeat, now_ms));
        decisions
    }

    /// An input went up. Any chord timeout due by `now_ms` fires first.
    pub fn input_up(&mut self, stroke: &InputStroke, now_ms: u64) -> Vec<RuntimeDecision> {
        let mut decisions = self.advance(now_ms).into_iter().collect::<Vec<_>>();
        decisions.push(self.handle_input_up(stroke));
        decisions
    }

    pub fn cancel_chord(&mut self, reason: &str) -> RuntimeDecision {
        let contexts = self.contexts();
        let cancelled = std::mem::take(&mut self.pending);
        self.clear_pending();
        let mut explanation = RuntimeExplanation::new(RuntimeDecisionReason::ChordCancelled)
            .cancelled(Some(cancelled.clone()));
        explanation.reset_reason = Some(reason.to_owned());
        decision(
            RuntimeDecisionKind::Cancelled,
            cancelled,
            contexts,
            Vec::new(),
            false,
            explanation,
            None,
        )
    }

    /// Cancels any pending chord, forgets pressed inputs and releases every held action.
    /// Call it on focus loss, window hide and device disconnect.
    pub fn reset(&mut self, reason: &str) -> RuntimeDecision {
        let contexts = self.contexts();
        let sequence = std::mem::take(&mut self.pending);
        self.clear_pending();
        self.pressed.clear();
        let mut activations = std::mem::take(&mut self.active)
            .into_iter()
            .flat_map(|(_, activations)| activations)
            .collect::<Vec<_>>();
        activations.sort_by(|left, right| code_unit_order(&left.binding_id, &right.binding_id));
        let dispatches = activations
            .into_iter()
            .map(|activation| release(activation, RuntimeDispatchReason::Reset, &contexts))
            .collect();
        let mut explanation = RuntimeExplanation::new(RuntimeDecisionReason::Reset);
        explanation.reset_reason = Some(reason.to_owned());
        decision(
            RuntimeDecisionKind::Reset,
            sequence,
            contexts,
            dispatches,
            false,
            explanation,
            None,
        )
    }

    fn handle_input_down(
        &mut self,
        stroke: InputStroke,
        repeat: bool,
        now_ms: u64,
    ) -> RuntimeDecision {
        if matches!(stroke, InputStroke::Device(DeviceStroke::Gesture { .. })) {
            // A recognised gesture has no up edge, so it never becomes held input; gestures
            // resolve through the gesture path, which presses and releases at once.
            return decision(
                RuntimeDecisionKind::None,
                vec![stroke],
                self.contexts(),
                Vec::new(),
                false,
                RuntimeExplanation::new(RuntimeDecisionReason::Unmatched),
                None,
            );
        }
        let trigger = TriggerKey::of(&stroke);
        if !self.pressed.contains(&trigger) {
            self.pressed.push(trigger);
        }
        let contexts = self.contexts();

        if !self.report.valid {
            return invalid(vec![stroke], contexts);
        }

        // An auto-repeat belongs to what its input already holds and never resolves
        // afresh, so it cannot start, cancel or re-press a chord.
        if repeat {
            return self.repeat_held(stroke, contexts);
        }

        let mut sequence = self.pending.clone();
        sequence.push(stroke.clone());
        let resolution = self.resolve(&sequence, &contexts, None);

        if resolution == Resolution::None && !self.pending.is_empty() {
            let cancelled = std::mem::take(&mut self.pending);
            self.clear_pending();
            if self.options.retry_on_chord_mismatch {
                let fresh = vec![stroke.clone()];
                let resolution = self.resolve(&fresh, &contexts, None);
                return self.finish_input_down(
                    fresh,
                    &stroke,
                    repeat,
                    contexts,
                    resolution,
                    Some(cancelled),
                    now_ms,
                );
            }
            let consumed = self.should_consume(true, false);
            return decision(
                RuntimeDecisionKind::Cancelled,
                sequence,
                contexts,
                Vec::new(),
                consumed,
                RuntimeExplanation::new(RuntimeDecisionReason::ChordMismatch)
                    .cancelled(Some(cancelled)),
                Some(resolution),
            );
        }

        self.finish_input_down(
            sequence, &stroke, repeat, contexts, resolution, None, now_ms,
        )
    }

    /// Each activation held on the repeated input repeats as its action's policy allows,
    /// including a fired chord prefix and while an unrelated chord is pending. A repeat of
    /// an input that holds nothing dispatches nothing; it is consumed when the input is bound.
    fn repeat_held(&self, stroke: InputStroke, contexts: Vec<String>) -> RuntimeDecision {
        let trigger = TriggerKey::of(&stroke);
        let mut held = self
            .active
            .iter()
            .filter(|(key, _)| key == &trigger)
            .flat_map(|(_, activations)| activations)
            .collect::<Vec<_>>();
        held.sort_by(|left, right| code_unit_order(&left.binding_id, &right.binding_id));
        let dispatches = held
            .iter()
            .filter(|activation| {
                self.registry
                    .actions
                    .iter()
                    .find(|definition| definition.id == activation.action)
                    .is_some_and(|definition| definition.repeat_policy == RepeatPolicy::Allow)
            })
            .map(|activation| RuntimeDispatch {
                action: activation.action.clone(),
                binding_id: activation.binding_id.clone(),
                phase: RuntimeActionPhase::Repeat,
                repeat: true,
                reason: if activation.sequence.len() > 1 {
                    RuntimeDispatchReason::Chord
                } else {
                    RuntimeDispatchReason::Direct
                },
                sequence: activation.sequence.clone(),
                active_contexts: contexts.clone(),
            })
            .collect::<Vec<_>>();
        if dispatches.is_empty() {
            // Bound means held, part of the pending chord, or resolvable on its own; an
            // unrelated repeat during a pending chord keeps its default behaviour.
            let matched = !held.is_empty()
                || self
                    .pending
                    .iter()
                    .any(|pending| TriggerKey::of(pending) == trigger)
                || self.resolve(std::slice::from_ref(&stroke), &contexts, None) != Resolution::None;
            if !matched {
                return decision(
                    RuntimeDecisionKind::None,
                    vec![stroke],
                    contexts,
                    Vec::new(),
                    false,
                    RuntimeExplanation::new(RuntimeDecisionReason::Unmatched),
                    None,
                );
            }
            let consumed = self.should_consume(true, false);
            return decision(
                RuntimeDecisionKind::RepeatSuppressed,
                vec![stroke],
                contexts,
                Vec::new(),
                consumed,
                RuntimeExplanation::new(RuntimeDecisionReason::RepeatSuppressed).bindings(
                    held.iter()
                        .map(|activation| activation.binding_id.clone())
                        .collect(),
                ),
                None,
            );
        }
        let binding_ids = dispatches
            .iter()
            .map(|dispatch| dispatch.binding_id.clone())
            .collect();
        let consumed = self.should_consume(true, true);
        decision(
            RuntimeDecisionKind::Dispatched,
            vec![stroke],
            contexts,
            dispatches,
            consumed,
            RuntimeExplanation::new(RuntimeDecisionReason::Resolved).bindings(binding_ids),
            None,
        )
    }

    fn handle_input_up(&mut self, stroke: &InputStroke) -> RuntimeDecision {
        let contexts = self.contexts();
        let trigger = TriggerKey::of(stroke);
        self.pressed.retain(|pressed| pressed != &trigger);

        if !self.report.valid {
            return invalid(vec![stroke.clone()], contexts);
        }

        let mut activations = match self.active.iter().position(|(key, _)| key == &trigger) {
            Some(index) => self.active.remove(index).1,
            None => Vec::new(),
        };
        if activations.is_empty() {
            return decision(
                RuntimeDecisionKind::None,
                vec![stroke.clone()],
                contexts,
                Vec::new(),
                false,
                RuntimeExplanation::new(RuntimeDecisionReason::Unmatched),
                None,
            );
        }
        activations.sort_by(|left, right| code_unit_order(&left.binding_id, &right.binding_id));
        let dispatches = activations
            .into_iter()
            .map(|activation| release(activation, RuntimeDispatchReason::KeyUp, &contexts))
            .collect::<Vec<_>>();
        let binding_ids = dispatches
            .iter()
            .map(|dispatch| dispatch.binding_id.clone())
            .collect();
        let consumed = self.should_consume(true, true);
        decision(
            RuntimeDecisionKind::Released,
            vec![stroke.clone()],
            contexts,
            dispatches,
            consumed,
            RuntimeExplanation::new(RuntimeDecisionReason::KeyReleased).bindings(binding_ids),
            None,
        )
    }

    #[allow(clippy::too_many_arguments)]
    fn finish_input_down(
        &mut self,
        sequence: Vec<InputStroke>,
        trigger_stroke: &InputStroke,
        repeat: bool,
        contexts: Vec<String>,
        resolution: Resolution,
        cancelled: Option<Vec<InputStroke>>,
        now_ms: u64,
    ) -> RuntimeDecision {
        match resolution {
            Resolution::None => {
                self.clear_pending();
                let reason = if cancelled.is_some() {
                    RuntimeDecisionReason::ChordMismatch
                } else {
                    RuntimeDecisionReason::Unmatched
                };
                decision(
                    RuntimeDecisionKind::None,
                    sequence,
                    contexts,
                    Vec::new(),
                    false,
                    RuntimeExplanation::new(reason).cancelled(cancelled),
                    Some(Resolution::None),
                )
            }
            Resolution::Pending {
                ref exact_binding_ids,
                ref continuation_binding_ids,
            } => {
                self.pending = sequence.clone();
                self.pending_exact_binding_ids = exact_binding_ids.clone();
                self.pending_deadline_ms =
                    Some(now_ms.saturating_add(self.options.chord_timeout_ms));
                let mut explanation = RuntimeExplanation::new(RuntimeDecisionReason::PendingChord)
                    .bindings(exact_binding_ids.clone())
                    .cancelled(cancelled);
                explanation.continuation_binding_ids = Some(continuation_binding_ids.clone());
                let consumed = self.should_consume(true, false);
                decision(
                    RuntimeDecisionKind::Pending,
                    sequence,
                    contexts,
                    Vec::new(),
                    consumed,
                    explanation,
                    Some(resolution),
                )
            }
            Resolution::Ambiguous { ref binding_ids } => {
                self.clear_pending();
                let consumed = self.should_consume(true, false);
                decision(
                    RuntimeDecisionKind::Ambiguous,
                    sequence,
                    contexts,
                    Vec::new(),
                    consumed,
                    RuntimeExplanation::new(RuntimeDecisionReason::Ambiguous)
                        .bindings(binding_ids.clone())
                        .cancelled(cancelled),
                    Some(resolution),
                )
            }
            Resolution::Resolved {
                ref binding_id,
                ref action,
            } => {
                self.clear_pending();
                let repeat_policy = self
                    .registry
                    .actions
                    .iter()
                    .find(|definition| &definition.id == action)
                    .map(|definition| definition.repeat_policy.clone())
                    .unwrap_or_default();
                if repeat && repeat_policy != RepeatPolicy::Allow {
                    let consumed = self.should_consume(true, false);
                    return decision(
                        RuntimeDecisionKind::RepeatSuppressed,
                        sequence,
                        contexts,
                        Vec::new(),
                        consumed,
                        RuntimeExplanation::new(RuntimeDecisionReason::RepeatSuppressed)
                            .bindings(vec![binding_id.clone()])
                            .cancelled(cancelled),
                        Some(resolution),
                    );
                }
                let dispatch = RuntimeDispatch {
                    action: action.clone(),
                    binding_id: binding_id.clone(),
                    phase: if repeat {
                        RuntimeActionPhase::Repeat
                    } else {
                        RuntimeActionPhase::Press
                    },
                    repeat,
                    reason: if sequence.len() > 1 {
                        RuntimeDispatchReason::Chord
                    } else {
                        RuntimeDispatchReason::Direct
                    },
                    sequence: sequence.clone(),
                    active_contexts: contexts.clone(),
                };
                if !repeat {
                    self.activate(&dispatch, trigger_stroke);
                }
                let consumed = self.should_consume(true, true);
                decision(
                    RuntimeDecisionKind::Dispatched,
                    sequence,
                    contexts,
                    vec![dispatch],
                    consumed,
                    RuntimeExplanation::new(RuntimeDecisionReason::Resolved)
                        .bindings(vec![binding_id.clone()])
                        .cancelled(cancelled),
                    Some(resolution),
                )
            }
        }
    }

    fn flush_pending_timeout(&mut self) -> Option<RuntimeDecision> {
        if self.pending.is_empty() || !self.report.valid {
            return None;
        }
        let sequence = std::mem::take(&mut self.pending);
        let exact_ids = std::mem::take(&mut self.pending_exact_binding_ids)
            .into_iter()
            .collect::<BTreeSet<_>>();
        let contexts = self.contexts();
        let exact_bindings = self
            .report
            .effective_bindings
            .iter()
            .filter(|binding| {
                exact_ids.contains(&binding.id) && binding.sequence.len() == sequence.len()
            })
            .cloned()
            .collect::<Vec<_>>();
        let resolution = self.resolve(&sequence, &contexts, Some(&exact_bindings));
        Some(match resolution {
            Resolution::Resolved {
                ref binding_id,
                ref action,
            } => {
                let dispatch = RuntimeDispatch {
                    action: action.clone(),
                    binding_id: binding_id.clone(),
                    phase: RuntimeActionPhase::Press,
                    repeat: false,
                    reason: RuntimeDispatchReason::Timeout,
                    sequence: sequence.clone(),
                    active_contexts: contexts.clone(),
                };
                let mut dispatches = vec![dispatch.clone()];
                match sequence.last() {
                    Some(last) if self.pressed.contains(&TriggerKey::of(last)) => {
                        self.activate(&dispatch, last);
                    }
                    // The chord's last input is already up: release at once so nothing
                    // stays held.
                    _ => dispatches.push(RuntimeDispatch {
                        phase: RuntimeActionPhase::Release,
                        reason: RuntimeDispatchReason::KeyUp,
                        ..dispatch
                    }),
                }
                let binding_ids = vec![binding_id.clone()];
                decision(
                    RuntimeDecisionKind::Dispatched,
                    sequence,
                    contexts,
                    dispatches,
                    false,
                    RuntimeExplanation::new(RuntimeDecisionReason::TimeoutResolved)
                        .bindings(binding_ids),
                    Some(resolution),
                )
            }
            Resolution::Ambiguous { ref binding_ids } => {
                let binding_ids = binding_ids.clone();
                decision(
                    RuntimeDecisionKind::Ambiguous,
                    sequence,
                    contexts,
                    Vec::new(),
                    false,
                    RuntimeExplanation::new(RuntimeDecisionReason::TimeoutAmbiguous)
                        .bindings(binding_ids),
                    Some(resolution),
                )
            }
            Resolution::None | Resolution::Pending { .. } => decision(
                RuntimeDecisionKind::Cancelled,
                sequence.clone(),
                contexts,
                Vec::new(),
                false,
                RuntimeExplanation::new(RuntimeDecisionReason::TimeoutExpired)
                    .cancelled(Some(sequence)),
                Some(resolution),
            ),
        })
    }

    fn resolve(
        &self,
        sequence: &[InputStroke],
        contexts: &[String],
        bindings: Option<&[Binding]>,
    ) -> Resolution {
        let bindings = bindings.unwrap_or(&self.report.effective_bindings);
        let active = contexts.iter().cloned().collect::<BTreeSet<_>>();
        match &self.context_stack {
            Some(stack) => resolve_with_context_stack(bindings, sequence, &active, stack),
            None => resolve(bindings, sequence, &active),
        }
    }

    fn activate(&mut self, dispatch: &RuntimeDispatch, trigger_stroke: &InputStroke) {
        let trigger = TriggerKey::of(trigger_stroke);
        let index = match self.active.iter().position(|(key, _)| key == &trigger) {
            Some(index) => index,
            None => {
                self.active.push((trigger, Vec::new()));
                self.active.len() - 1
            }
        };
        let activations = &mut self.active[index].1;
        if !activations
            .iter()
            .any(|activation| activation.binding_id == dispatch.binding_id)
        {
            activations.push(Activation {
                action: dispatch.action.clone(),
                binding_id: dispatch.binding_id.clone(),
                sequence: dispatch.sequence.clone(),
            });
        }
    }

    fn contexts(&self) -> Vec<String> {
        let mut contexts = self.active_contexts.clone();
        for layer in self.context_stack.iter().flatten() {
            contexts.insert(layer.id.clone());
        }
        let mut contexts = contexts.into_iter().collect::<Vec<_>>();
        contexts.sort_by(|left, right| code_unit_order(left, right));
        contexts
    }

    fn clear_pending(&mut self) {
        self.pending.clear();
        self.pending_exact_binding_ids.clear();
        self.pending_deadline_ms = None;
    }

    fn should_consume(&self, matched: bool, dispatched: bool) -> bool {
        match self.options.consume_policy {
            RuntimeConsumePolicy::Never => false,
            RuntimeConsumePolicy::Matched => matched,
            RuntimeConsumePolicy::Dispatched => dispatched,
        }
    }
}

fn release(
    activation: Activation,
    reason: RuntimeDispatchReason,
    contexts: &[String],
) -> RuntimeDispatch {
    RuntimeDispatch {
        action: activation.action,
        binding_id: activation.binding_id,
        phase: RuntimeActionPhase::Release,
        repeat: false,
        reason,
        sequence: activation.sequence,
        active_contexts: contexts.to_vec(),
    }
}

fn invalid(sequence: Vec<InputStroke>, contexts: Vec<String>) -> RuntimeDecision {
    decision(
        RuntimeDecisionKind::InvalidConfiguration,
        sequence,
        contexts,
        Vec::new(),
        false,
        RuntimeExplanation::new(RuntimeDecisionReason::InvalidConfiguration),
        None,
    )
}

fn decision(
    kind: RuntimeDecisionKind,
    sequence: Vec<InputStroke>,
    active_contexts: Vec<String>,
    dispatches: Vec<RuntimeDispatch>,
    consumed: bool,
    explanation: RuntimeExplanation,
    resolution: Option<Resolution>,
) -> RuntimeDecision {
    RuntimeDecision {
        kind,
        sequence,
        active_contexts,
        resolution,
        dispatches,
        consumed,
        explanation,
    }
}

/// Snapshot of held semantic actions, as in the browser `SemanticControlSnapshot`.
#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SemanticControlSnapshot {
    /// Semantic actions held by at least one activation, sorted.
    pub held: Vec<String>,
    /// Binding ids currently holding each held action, sorted.
    pub holders: BTreeMap<String, Vec<String>>,
}

/// Consumer-side held state for fixed-tick consumers. Feed it every runtime dispatch; it
/// tracks which semantic actions are held by which bindings and queues presses so a tick
/// samples both continuous held state and one-shot actions without missing a press and
/// release that happened between ticks. It never interprets actions.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct SemanticControlState {
    holders: BTreeMap<String, BTreeMap<String, u32>>,
    presses: Vec<String>,
}

impl SemanticControlState {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn apply(&mut self, dispatch: &RuntimeDispatch) {
        match dispatch.phase {
            RuntimeActionPhase::Press => {
                self.presses.push(dispatch.action.clone());
                *self
                    .holders
                    .entry(dispatch.action.clone())
                    .or_default()
                    .entry(dispatch.binding_id.clone())
                    .or_default() += 1;
            }
            RuntimeActionPhase::Release => {
                let Some(bindings) = self.holders.get_mut(&dispatch.action) else {
                    return;
                };
                let Some(count) = bindings.get_mut(&dispatch.binding_id) else {
                    return;
                };
                *count -= 1;
                if *count == 0 {
                    bindings.remove(&dispatch.binding_id);
                }
                if bindings.is_empty() {
                    self.holders.remove(&dispatch.action);
                }
            }
            RuntimeActionPhase::Repeat => {}
        }
    }

    /// Applies every dispatch of `decisions` in order.
    pub fn apply_decisions<'a>(
        &mut self,
        decisions: impl IntoIterator<Item = &'a RuntimeDecision>,
    ) {
        for decision in decisions {
            for dispatch in &decision.dispatches {
                self.apply(dispatch);
            }
        }
    }

    pub fn is_held(&self, action: &str) -> bool {
        self.holders.contains_key(action)
    }

    /// -1, 0 or 1 from two opposing held actions; both or neither held is 0.
    pub fn axis(&self, negative: &str, positive: &str) -> i8 {
        i8::from(self.is_held(positive)) - i8::from(self.is_held(negative))
    }

    /// Actions pressed since the previous call, in dispatch order.
    pub fn drain_presses(&mut self) -> Vec<String> {
        std::mem::take(&mut self.presses)
    }

    pub fn snapshot(&self) -> SemanticControlSnapshot {
        let sorted = |ids: Vec<String>| {
            let mut ids = ids;
            ids.sort_by(|left, right| code_unit_order(left, right));
            ids
        };
        SemanticControlSnapshot {
            held: sorted(self.holders.keys().cloned().collect()),
            holders: self
                .holders
                .iter()
                .map(|(action, bindings)| {
                    (action.clone(), sorted(bindings.keys().cloned().collect()))
                })
                .collect(),
        }
    }

    /// Forgets all held state and queued presses without dispatching anything.
    pub fn clear(&mut self) {
        self.holders.clear();
        self.presses.clear();
    }
}
