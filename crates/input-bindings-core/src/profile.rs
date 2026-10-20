use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

use crate::Binding;

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Profile {
    pub id: String,
    pub patches: Vec<BindingPatch>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "op", rename_all = "camelCase")]
pub enum BindingPatch {
    Add {
        binding: Binding,
    },
    Remove {
        #[serde(rename = "bindingId")]
        binding_id: String,
    },
    Replace {
        #[serde(rename = "bindingId")]
        binding_id: String,
        binding: Binding,
    },
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ProfileDiagnosticKind {
    AddCollision,
    MissingBinding,
    ReplacementIdMismatch,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileDiagnostic {
    pub patch_index: usize,
    pub kind: ProfileDiagnosticKind,
    pub binding_id: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileApplication {
    pub bindings: Vec<Binding>,
    pub diagnostics: Vec<ProfileDiagnostic>,
}

pub fn apply_profile(base: &[Binding], profile: &Profile) -> ProfileApplication {
    let mut bindings = base
        .iter()
        .cloned()
        .map(|binding| (binding.id.clone(), binding))
        .collect::<BTreeMap<_, _>>();
    let mut diagnostics = Vec::new();

    for (patch_index, patch) in profile.patches.iter().enumerate() {
        match patch {
            BindingPatch::Add { binding } => {
                if bindings.contains_key(&binding.id) {
                    diagnostics.push(ProfileDiagnostic {
                        patch_index,
                        kind: ProfileDiagnosticKind::AddCollision,
                        binding_id: binding.id.clone(),
                    });
                } else {
                    bindings.insert(binding.id.clone(), binding.clone());
                }
            }
            BindingPatch::Remove { binding_id } => {
                if bindings.remove(binding_id).is_none() {
                    diagnostics.push(ProfileDiagnostic {
                        patch_index,
                        kind: ProfileDiagnosticKind::MissingBinding,
                        binding_id: binding_id.clone(),
                    });
                }
            }
            BindingPatch::Replace {
                binding_id,
                binding,
            } => {
                if binding.id != *binding_id {
                    diagnostics.push(ProfileDiagnostic {
                        patch_index,
                        kind: ProfileDiagnosticKind::ReplacementIdMismatch,
                        binding_id: binding_id.clone(),
                    });
                } else if !bindings.contains_key(binding_id) {
                    diagnostics.push(ProfileDiagnostic {
                        patch_index,
                        kind: ProfileDiagnosticKind::MissingBinding,
                        binding_id: binding_id.clone(),
                    });
                } else {
                    bindings.insert(binding_id.clone(), binding.clone());
                }
            }
        }
    }

    ProfileApplication {
        bindings: bindings.into_values().collect(),
        diagnostics,
    }
}

/// Derive the minimal profile delta represented by an editor's effective bindings.
///
/// The registry remains the source of defaults. This does not validate edits or
/// choose conflict repairs: callers retain the existing explicit validation and
/// repair APIs. Last occurrences of duplicate IDs match profile application.
pub fn profile_from_bindings(
    registry: &crate::ActionRegistry,
    effective_bindings: &[Binding],
    profile_id: impl Into<String>,
) -> Profile {
    let defaults = registry
        .actions
        .iter()
        .flat_map(|action| &action.defaults)
        .map(|binding| (binding.id.clone(), binding))
        .collect::<BTreeMap<_, _>>();
    let effective = effective_bindings
        .iter()
        .map(|binding| (binding.id.clone(), binding))
        .collect::<BTreeMap<_, _>>();
    let mut default_ids = defaults.keys().collect::<Vec<_>>();
    default_ids.sort_by(|left, right| left.encode_utf16().cmp(right.encode_utf16()));
    let mut patches = Vec::new();
    for id in default_ids {
        match effective.get(id) {
            None => patches.push(BindingPatch::Remove {
                binding_id: id.clone(),
            }),
            Some(binding) if **binding != *defaults[id] => patches.push(BindingPatch::Replace {
                binding_id: id.clone(),
                binding: (*binding).clone(),
            }),
            Some(_) => {}
        }
    }
    let mut added_ids = effective
        .keys()
        .filter(|id| !defaults.contains_key(*id))
        .collect::<Vec<_>>();
    added_ids.sort_by(|left, right| left.encode_utf16().cmp(right.encode_utf16()));
    for id in added_ids {
        patches.push(BindingPatch::Add {
            binding: effective[id].clone(),
        });
    }
    Profile {
        id: profile_id.into(),
        patches,
    }
}
