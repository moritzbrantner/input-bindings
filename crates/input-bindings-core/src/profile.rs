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
