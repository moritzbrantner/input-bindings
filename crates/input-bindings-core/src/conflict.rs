use std::collections::BTreeSet;

use serde::{Deserialize, Serialize};

use crate::{Binding, WhenExpr};

const MAX_EXHAUSTIVE_CONTEXTS: usize = 16;

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum ContextOverlap {
    Disjoint,
    Overlap {
        #[serde(rename = "witnessContexts")]
        witness_contexts: Vec<String>,
    },
    Unknown {
        #[serde(rename = "contextCount")]
        context_count: usize,
    },
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ConflictKind {
    Duplicate,
    AmbiguousExact,
    OverrideExact,
    ChordPrefix,
    PotentialExact,
    PotentialPrefix,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Conflict {
    pub left_binding_id: String,
    pub right_binding_id: String,
    pub kind: ConflictKind,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub witness_contexts: Vec<String>,
}

pub fn analyze_conflicts(bindings: &[Binding]) -> Vec<Conflict> {
    let mut conflicts = Vec::new();

    for (left_index, left) in bindings.iter().enumerate() {
        for right in &bindings[left_index + 1..] {
            let relation = sequence_relation(left, right);
            if relation == SequenceRelation::Separate {
                continue;
            }

            let overlap = context_overlap(&left.when, &right.when);
            let (known_overlap, witness_contexts) = match overlap {
                ContextOverlap::Disjoint => continue,
                ContextOverlap::Overlap { witness_contexts } => (true, witness_contexts),
                ContextOverlap::Unknown { .. } => (false, Vec::new()),
            };

            let kind = match (relation, known_overlap) {
                (SequenceRelation::Exact, false) => ConflictKind::PotentialExact,
                (SequenceRelation::Prefix, false) => ConflictKind::PotentialPrefix,
                (SequenceRelation::Prefix, true) => ConflictKind::ChordPrefix,
                (SequenceRelation::Exact, true)
                    if left.action == right.action
                        && left.when == right.when
                        && left.priority == right.priority =>
                {
                    ConflictKind::Duplicate
                }
                (SequenceRelation::Exact, true) if left.rank() == right.rank() => {
                    ConflictKind::AmbiguousExact
                }
                (SequenceRelation::Exact, true) => ConflictKind::OverrideExact,
                (SequenceRelation::Separate, _) => unreachable!(),
            };

            conflicts.push(Conflict {
                left_binding_id: left.id.clone(),
                right_binding_id: right.id.clone(),
                kind,
                witness_contexts,
            });
        }
    }

    conflicts
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum SequenceRelation {
    Separate,
    Exact,
    Prefix,
}

fn sequence_relation(left: &Binding, right: &Binding) -> SequenceRelation {
    if left.sequence == right.sequence {
        return SequenceRelation::Exact;
    }

    let common_length = left.sequence.len().min(right.sequence.len());
    let common_prefix = left.sequence[..common_length] == right.sequence[..common_length];

    if common_prefix {
        SequenceRelation::Prefix
    } else {
        SequenceRelation::Separate
    }
}

fn context_overlap(left: &WhenExpr, right: &WhenExpr) -> ContextOverlap {
    let mut context_names = BTreeSet::new();
    left.collect_contexts(&mut context_names);
    right.collect_contexts(&mut context_names);

    if context_names.len() > MAX_EXHAUSTIVE_CONTEXTS {
        return ContextOverlap::Unknown {
            context_count: context_names.len(),
        };
    }

    let context_names = context_names.into_iter().collect::<Vec<_>>();
    let assignment_count = 1_u64 << context_names.len();

    for mask in 0..assignment_count {
        let active_contexts = context_names
            .iter()
            .enumerate()
            .filter(|(index, _)| mask & (1_u64 << index) != 0)
            .map(|(_, name)| name.clone())
            .collect::<BTreeSet<_>>();

        if left.evaluate(&active_contexts) && right.evaluate(&active_contexts) {
            return ContextOverlap::Overlap {
                witness_contexts: active_contexts.into_iter().collect(),
            };
        }
    }

    ContextOverlap::Disjoint
}
