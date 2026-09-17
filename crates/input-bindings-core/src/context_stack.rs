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

pub fn resolve_with_context_stack(
    bindings: &[Binding],
    sequence: &[InputStroke],
    active_contexts: &BTreeSet<String>,
    context_stack: &[ContextLayer],
) -> Resolution {
    if sequence.is_empty() {
        return Resolution::None;
    }

    let mut contexts = active_contexts.clone();
    let mut depth_by_context = BTreeMap::<&str, isize>::new();
    let mut barrier_depth = -1;

    for (index, layer) in context_stack.iter().enumerate() {
        contexts.insert(layer.id.clone());
        depth_by_context.insert(layer.id.as_str(), index as isize);
        if layer.blocks_lower {
            barrier_depth = index as isize;
        }
    }

    let mut top_depth = None;
    let mut exact = Vec::new();
    let mut continuations = Vec::new();

    for binding in bindings {
        if !binding.when.evaluate(&contexts) || sequence.len() > binding.sequence.len() {
            continue;
        }

        if !sequence
            .iter()
            .zip(binding.sequence.iter())
            .all(|(left, right)| left == right)
        {
            continue;
        }

        let depth = owner_depth(&binding.when, &depth_by_context, true);
        if depth < barrier_depth {
            continue;
        }

        if top_depth.is_none_or(|current| depth > current) {
            top_depth = Some(depth);
            exact.clear();
            continuations.clear();
        } else if top_depth != Some(depth) {
            continue;
        }

        if sequence.len() == binding.sequence.len() {
            exact.push(binding);
        } else {
            continuations.push(binding);
        }
    }

    finish_resolution(exact, continuations)
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
