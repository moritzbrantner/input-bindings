use std::collections::{BTreeMap, BTreeSet};

use serde::{Deserialize, Serialize};

use crate::{Binding, InputStroke, Resolution, WhenExpr, resolve::finish_resolution};

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContextLayer {
    pub id: String,
    #[serde(default)]
    pub blocks_lower: bool,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ResolutionCandidateMatch {
    None,
    Exact,
    Continuation,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ResolutionCandidateStatus {
    InactiveContext,
    InputLongerThanBinding,
    SequenceMismatch,
    BlockedByModal,
    LowerContextLayer,
    PendingExact,
    PendingContinuation,
    LowerRank,
    Winner,
    EquivalentWinner,
    AmbiguousWinner,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolutionCandidateTrace {
    pub binding_id: String,
    pub action: String,
    #[serde(rename = "match")]
    pub match_kind: ResolutionCandidateMatch,
    pub status: ResolutionCandidateStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub owner_depth: Option<isize>,
    pub priority: i32,
    pub specificity: u32,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolutionBarrierTrace {
    pub id: String,
    pub depth: isize,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolutionTrace {
    pub resolution: Resolution,
    pub active_contexts: Vec<String>,
    pub context_stack: Vec<ContextLayer>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub barrier: Option<ResolutionBarrierTrace>,
    pub candidates: Vec<ResolutionCandidateTrace>,
}

struct WorkingCandidate<'a> {
    binding: &'a Binding,
    trace_index: usize,
    depth: isize,
    match_kind: ResolutionCandidateMatch,
}

pub fn resolve_with_context_stack(
    bindings: &[Binding],
    sequence: &[InputStroke],
    active_contexts: &BTreeSet<String>,
    context_stack: &[ContextLayer],
) -> Resolution {
    explain_resolution_with_context_stack(bindings, sequence, active_contexts, context_stack)
        .resolution
}

pub fn reachable_bindings_with_context_stack<'a>(
    bindings: &'a [Binding],
    active_contexts: &BTreeSet<String>,
    context_stack: &[ContextLayer],
) -> Vec<&'a Binding> {
    let (contexts, depth_by_context, barrier) =
        prepare_context_stack_state(active_contexts, context_stack);

    bindings
        .iter()
        .filter(|binding| {
            if binding.sequence.is_empty() || !binding.when.evaluate(&contexts) {
                return false;
            }
            barrier.as_ref().is_none_or(|entry| {
                owner_depth(&binding.when, &depth_by_context, true) >= entry.depth
            })
        })
        .collect()
}

pub fn explain_resolution_with_context_stack(
    bindings: &[Binding],
    sequence: &[InputStroke],
    active_contexts: &BTreeSet<String>,
    context_stack: &[ContextLayer],
) -> ResolutionTrace {
    let (contexts, depth_by_context, barrier) =
        prepare_context_stack_state(active_contexts, context_stack);

    if sequence.is_empty() {
        return ResolutionTrace {
            resolution: Resolution::None,
            active_contexts: contexts.into_iter().collect(),
            context_stack: context_stack.to_vec(),
            barrier,
            candidates: Vec::new(),
        };
    }

    let mut sorted_bindings = bindings.iter().collect::<Vec<_>>();
    sorted_bindings.sort_by(|left, right| left.id.cmp(&right.id));

    let mut candidates = Vec::with_capacity(sorted_bindings.len());
    let mut working = Vec::new();

    for binding in sorted_bindings {
        let base = ResolutionCandidateTrace {
            binding_id: binding.id.clone(),
            action: binding.action.clone(),
            match_kind: ResolutionCandidateMatch::None,
            status: ResolutionCandidateStatus::SequenceMismatch,
            owner_depth: None,
            priority: binding.priority,
            specificity: binding.when.specificity(),
        };

        if !binding.when.evaluate(&contexts) {
            candidates.push(ResolutionCandidateTrace {
                status: ResolutionCandidateStatus::InactiveContext,
                ..base
            });
            continue;
        }
        if sequence.len() > binding.sequence.len() {
            candidates.push(ResolutionCandidateTrace {
                status: ResolutionCandidateStatus::InputLongerThanBinding,
                ..base
            });
            continue;
        }
        if !sequence
            .iter()
            .zip(binding.sequence.iter())
            .all(|(left, right)| left == right)
        {
            candidates.push(base);
            continue;
        }

        let depth = owner_depth(&binding.when, &depth_by_context, true);
        let match_kind = if sequence.len() == binding.sequence.len() {
            ResolutionCandidateMatch::Exact
        } else {
            ResolutionCandidateMatch::Continuation
        };

        if barrier.as_ref().is_some_and(|entry| depth < entry.depth) {
            candidates.push(ResolutionCandidateTrace {
                match_kind,
                status: ResolutionCandidateStatus::BlockedByModal,
                owner_depth: Some(depth),
                ..base
            });
            continue;
        }

        let trace_index = candidates.len();
        candidates.push(ResolutionCandidateTrace {
            match_kind,
            status: ResolutionCandidateStatus::LowerContextLayer,
            owner_depth: Some(depth),
            ..base
        });
        working.push(WorkingCandidate {
            binding,
            trace_index,
            depth,
            match_kind,
        });
    }

    let Some(top_depth) = working.iter().map(|candidate| candidate.depth).max() else {
        return ResolutionTrace {
            resolution: Resolution::None,
            active_contexts: contexts.into_iter().collect(),
            context_stack: context_stack.to_vec(),
            barrier,
            candidates,
        };
    };

    let selected = working
        .iter()
        .filter(|candidate| candidate.depth == top_depth)
        .collect::<Vec<_>>();
    let mut exact = Vec::new();
    let mut continuations = Vec::new();
    for candidate in &selected {
        match candidate.match_kind {
            ResolutionCandidateMatch::Exact => exact.push(candidate.binding),
            ResolutionCandidateMatch::Continuation => continuations.push(candidate.binding),
            ResolutionCandidateMatch::None => unreachable!(),
        }
    }
    let resolution = finish_resolution(exact, continuations);

    for candidate in selected {
        let status = match &resolution {
            Resolution::Pending { .. } => match candidate.match_kind {
                ResolutionCandidateMatch::Exact => ResolutionCandidateStatus::PendingExact,
                ResolutionCandidateMatch::Continuation => {
                    ResolutionCandidateStatus::PendingContinuation
                }
                ResolutionCandidateMatch::None => unreachable!(),
            },
            Resolution::Ambiguous { binding_ids } => {
                if binding_ids.contains(&candidate.binding.id) {
                    ResolutionCandidateStatus::AmbiguousWinner
                } else {
                    ResolutionCandidateStatus::LowerRank
                }
            }
            Resolution::Resolved {
                binding_id,
                action: _,
            } => {
                if candidate.binding.id == *binding_id {
                    ResolutionCandidateStatus::Winner
                } else {
                    let winner = working
                        .iter()
                        .find(|entry| entry.binding.id == *binding_id)
                        .map(|entry| entry.binding);
                    if winner.is_some_and(|winner| {
                        candidate.binding.rank() == winner.rank()
                            && candidate.binding.action == winner.action
                    }) {
                        ResolutionCandidateStatus::EquivalentWinner
                    } else {
                        ResolutionCandidateStatus::LowerRank
                    }
                }
            }
            Resolution::None => ResolutionCandidateStatus::LowerRank,
        };
        candidates[candidate.trace_index].status = status;
    }

    ResolutionTrace {
        resolution,
        active_contexts: contexts.into_iter().collect(),
        context_stack: context_stack.to_vec(),
        barrier,
        candidates,
    }
}

fn prepare_context_stack_state<'a>(
    active_contexts: &BTreeSet<String>,
    context_stack: &'a [ContextLayer],
) -> (
    BTreeSet<String>,
    BTreeMap<&'a str, isize>,
    Option<ResolutionBarrierTrace>,
) {
    let mut contexts = active_contexts.clone();
    let mut depth_by_context = BTreeMap::<&str, isize>::new();
    let mut barrier = None;

    for (index, layer) in context_stack.iter().enumerate() {
        contexts.insert(layer.id.clone());
        depth_by_context.insert(layer.id.as_str(), index as isize);
        if layer.blocks_lower {
            barrier = Some(ResolutionBarrierTrace {
                id: layer.id.clone(),
                depth: index as isize,
            });
        }
    }

    (contexts, depth_by_context, barrier)
}

fn owner_depth(
    expression: &WhenExpr,
    depth_by_context: &BTreeMap<&str, isize>,
    positive: bool,
) -> isize {
    match expression {
        WhenExpr::Always => -1,
        WhenExpr::Context { id } if positive => {
            depth_by_context.get(id.as_str()).copied().unwrap_or(-1)
        }
        WhenExpr::Context { .. } => -1,
        WhenExpr::Not { expr } => owner_depth(expr, depth_by_context, !positive),
        WhenExpr::All { exprs } | WhenExpr::Any { exprs } => exprs
            .iter()
            .map(|expr| owner_depth(expr, depth_by_context, positive))
            .max()
            .unwrap_or(-1),
    }
}
