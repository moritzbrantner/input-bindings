use serde::{Deserialize, Serialize};

use crate::{Binding, Conflict, ConflictKind, WhenExpr};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ConflictDisposition {
    Redundant,
    Ambiguous,
    OrderedOverride,
    ChordPrefix,
    Potential,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ConflictRepairKeepReason {
    ExistingPrecedence,
    PotentialConflict,
    RedundantSameAction,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum ConflictRepair {
    Keep {
        reason: ConflictRepairKeepReason,
    },
    Unbind {
        #[serde(rename = "bindingId")]
        binding_id: String,
    },
    Prefer {
        #[serde(rename = "bindingId")]
        binding_id: String,
        #[serde(rename = "overBindingId")]
        over_binding_id: String,
        priority: i32,
    },
    NarrowContext {
        #[serde(rename = "bindingId")]
        binding_id: String,
        #[serde(rename = "againstBindingId")]
        against_binding_id: String,
        when: WhenExpr,
    },
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConflictRepairPlan {
    pub conflict: Conflict,
    pub disposition: ConflictDisposition,
    pub repairs: Vec<ConflictRepair>,
}

pub fn plan_conflict_repairs(bindings: &[Binding], conflict: &Conflict) -> ConflictRepairPlan {
    let disposition = disposition_for_kind(&conflict.kind);
    let Some(left) = bindings
        .iter()
        .find(|binding| binding.id == conflict.left_binding_id)
    else {
        return ConflictRepairPlan {
            conflict: conflict.clone(),
            disposition,
            repairs: Vec::new(),
        };
    };
    let Some(right) = bindings
        .iter()
        .find(|binding| binding.id == conflict.right_binding_id)
    else {
        return ConflictRepairPlan {
            conflict: conflict.clone(),
            disposition,
            repairs: Vec::new(),
        };
    };

    let mut repairs = Vec::new();
    match conflict.kind {
        ConflictKind::Duplicate => repairs.push(ConflictRepair::Keep {
            reason: ConflictRepairKeepReason::RedundantSameAction,
        }),
        ConflictKind::OverrideExact => repairs.push(ConflictRepair::Keep {
            reason: ConflictRepairKeepReason::ExistingPrecedence,
        }),
        ConflictKind::PotentialExact | ConflictKind::PotentialPrefix => {
            repairs.push(ConflictRepair::Keep {
                reason: ConflictRepairKeepReason::PotentialConflict,
            });
        }
        ConflictKind::AmbiguousExact | ConflictKind::ChordPrefix => {}
    }

    if conflict.kind == ConflictKind::AmbiguousExact {
        add_prefer_repair(&mut repairs, left, right);
        add_prefer_repair(&mut repairs, right, left);
    }

    add_narrow_repair(&mut repairs, left, right);
    add_narrow_repair(&mut repairs, right, left);
    repairs.push(ConflictRepair::Unbind {
        binding_id: left.id.clone(),
    });
    repairs.push(ConflictRepair::Unbind {
        binding_id: right.id.clone(),
    });

    ConflictRepairPlan {
        conflict: conflict.clone(),
        disposition,
        repairs,
    }
}

pub fn apply_conflict_repair(bindings: &[Binding], repair: &ConflictRepair) -> Vec<Binding> {
    match repair {
        ConflictRepair::Keep { .. } => bindings.to_vec(),
        ConflictRepair::Unbind { binding_id } => bindings
            .iter()
            .filter(|binding| binding.id != *binding_id)
            .cloned()
            .collect(),
        ConflictRepair::Prefer {
            binding_id,
            priority,
            ..
        } => bindings
            .iter()
            .cloned()
            .map(|mut binding| {
                if binding.id == *binding_id {
                    binding.priority = *priority;
                }
                binding
            })
            .collect(),
        ConflictRepair::NarrowContext {
            binding_id, when, ..
        } => bindings
            .iter()
            .cloned()
            .map(|mut binding| {
                if binding.id == *binding_id {
                    binding.when = when.clone();
                }
                binding
            })
            .collect(),
    }
}

fn disposition_for_kind(kind: &ConflictKind) -> ConflictDisposition {
    match kind {
        ConflictKind::Duplicate => ConflictDisposition::Redundant,
        ConflictKind::AmbiguousExact => ConflictDisposition::Ambiguous,
        ConflictKind::OverrideExact => ConflictDisposition::OrderedOverride,
        ConflictKind::ChordPrefix => ConflictDisposition::ChordPrefix,
        ConflictKind::PotentialExact | ConflictKind::PotentialPrefix => {
            ConflictDisposition::Potential
        }
    }
}

fn add_prefer_repair(repairs: &mut Vec<ConflictRepair>, target: &Binding, other: &Binding) {
    let Some(priority) = other.priority.checked_add(1) else {
        return;
    };
    repairs.push(ConflictRepair::Prefer {
        binding_id: target.id.clone(),
        over_binding_id: other.id.clone(),
        priority,
    });
}

fn add_narrow_repair(repairs: &mut Vec<ConflictRepair>, target: &Binding, other: &Binding) {
    if other.when == WhenExpr::Always || target.when == other.when {
        return;
    }
    let exclusion = WhenExpr::Not {
        expr: Box::new(other.when.clone()),
    };
    let when = if target.when == WhenExpr::Always {
        exclusion
    } else {
        WhenExpr::All {
            exprs: vec![target.when.clone(), exclusion],
        }
    };
    repairs.push(ConflictRepair::NarrowContext {
        binding_id: target.id.clone(),
        against_binding_id: other.id.clone(),
        when,
    });
}
