use std::collections::{BTreeSet, HashSet};

use serde::{Deserialize, Serialize};

use crate::{Binding, KeyStroke};

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum Resolution {
    None,
    Resolved {
        #[serde(rename = "bindingId")]
        binding_id: String,
        action: String,
    },
    Ambiguous {
        #[serde(rename = "bindingIds")]
        binding_ids: Vec<String>,
    },
    Pending {
        #[serde(rename = "exactBindingIds")]
        exact_binding_ids: Vec<String>,
        #[serde(rename = "continuationBindingIds")]
        continuation_binding_ids: Vec<String>,
    },
}

pub fn resolve(
    bindings: &[Binding],
    sequence: &[KeyStroke],
    active_contexts: &BTreeSet<String>,
) -> Resolution {
    if sequence.is_empty() {
        return Resolution::None;
    }

    let mut exact = Vec::new();
    let mut continuations = Vec::new();

    for binding in bindings {
        if !binding.when.evaluate(active_contexts) || sequence.len() > binding.sequence.len() {
            continue;
        }

        if !sequence
            .iter()
            .zip(binding.sequence.iter())
            .all(|(left, right)| left == right)
        {
            continue;
        }

        if sequence.len() == binding.sequence.len() {
            exact.push(binding);
        } else {
            continuations.push(binding);
        }
    }

    if !continuations.is_empty() {
        let mut exact_binding_ids = exact.iter().map(|binding| binding.id.clone()).collect::<Vec<_>>();
        exact_binding_ids.sort();
        let mut continuation_binding_ids = continuations
            .iter()
            .map(|binding| binding.id.clone())
            .collect::<Vec<_>>();
        continuation_binding_ids.sort();
        return Resolution::Pending {
            exact_binding_ids,
            continuation_binding_ids,
        };
    }

    let Some(top_rank) = exact.iter().map(|binding| binding.rank()).max() else {
        return Resolution::None;
    };

    let mut top = exact
        .into_iter()
        .filter(|binding| binding.rank() == top_rank)
        .collect::<Vec<_>>();
    top.sort_by(|left, right| left.id.cmp(&right.id));

    let actions = top
        .iter()
        .map(|binding| binding.action.as_str())
        .collect::<HashSet<_>>();

    if actions.len() > 1 {
        return Resolution::Ambiguous {
            binding_ids: top.iter().map(|binding| binding.id.clone()).collect(),
        };
    }

    let binding = top[0];
    Resolution::Resolved {
        binding_id: binding.id.clone(),
        action: binding.action.clone(),
    }
}
