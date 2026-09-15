use std::collections::{BTreeMap, BTreeSet};

use serde::{Deserialize, Serialize};

use crate::{
    Binding, BindingPatch, Conflict, KeyMatch, Profile, ProfileDiagnosticKind, analyze_conflicts,
    apply_profile,
};

#[derive(Clone, Debug, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum DeviceClass {
    Keyboard,
    Mouse,
    Gamepad,
    Pointer,
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum RepeatPolicy {
    #[default]
    Never,
    Allow,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Provenance {
    pub source: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub version: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActionDefinition {
    pub id: String,
    pub title: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(default)]
    pub category_path: Vec<String>,
    #[serde(default)]
    pub repeat_policy: RepeatPolicy,
    #[serde(default)]
    pub allowed_devices: Vec<DeviceClass>,
    #[serde(default)]
    pub defaults: Vec<Binding>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub provenance: Option<Provenance>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActionRegistry {
    pub actions: Vec<ActionDefinition>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ValidationDiagnosticKind {
    DuplicateActionId,
    DuplicateBindingId,
    EmptyActionId,
    EmptyBindingId,
    DefaultDeviceNotAllowed,
    DefaultActionMismatch,
    UnknownAction,
    EmptySequence,
    InvalidLogicalKey,
    InvalidPhysicalKey,
    ProfileAddCollision,
    ProfileMissingBinding,
    ProfileReplacementIdMismatch,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ValidationDiagnostic {
    pub kind: ValidationDiagnosticKind,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub action_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub binding_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub patch_index: Option<usize>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub stroke_index: Option<usize>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegistryValidationReport {
    pub valid: bool,
    pub effective_bindings: Vec<Binding>,
    pub diagnostics: Vec<ValidationDiagnostic>,
    pub conflicts: Vec<Conflict>,
}

pub fn validate_registry(
    registry: &ActionRegistry,
    profile: Option<&Profile>,
) -> RegistryValidationReport {
    let mut actions = registry.actions.clone();
    actions.sort_by(|left, right| {
        left.id
            .cmp(&right.id)
            .then_with(|| left.title.cmp(&right.title))
    });

    let known_actions = actions
        .iter()
        .map(|action| action.id.clone())
        .collect::<BTreeSet<_>>();
    let mut diagnostics = Vec::new();

    let mut action_counts = BTreeMap::<String, usize>::new();
    for action in &actions {
        *action_counts.entry(action.id.clone()).or_default() += 1;
    }
    for (action_id, count) in action_counts {
        if count > 1 {
            diagnostics.push(diagnostic(
                ValidationDiagnosticKind::DuplicateActionId,
                Some(action_id),
                None,
                None,
                None,
            ));
        }
    }

    let flattened_defaults = actions
        .iter()
        .flat_map(|action| {
            let mut defaults = action.defaults.clone();
            defaults.sort_by(|left, right| left.id.cmp(&right.id));
            defaults
        })
        .collect::<Vec<_>>();

    let mut binding_counts = BTreeMap::<String, usize>::new();
    for binding in &flattened_defaults {
        *binding_counts.entry(binding.id.clone()).or_default() += 1;
    }
    for (binding_id, count) in binding_counts {
        if count > 1 {
            diagnostics.push(diagnostic(
                ValidationDiagnosticKind::DuplicateBindingId,
                None,
                Some(binding_id),
                None,
                None,
            ));
        }
    }

    for action in &actions {
        let mut defaults = action.defaults.clone();
        defaults.sort_by(|left, right| left.id.cmp(&right.id));

        if action.id.is_empty() {
            diagnostics.push(diagnostic(
                ValidationDiagnosticKind::EmptyActionId,
                Some(action.id.clone()),
                None,
                None,
                None,
            ));
        }

        if !defaults.is_empty() && !action.allowed_devices.contains(&DeviceClass::Keyboard) {
            diagnostics.push(diagnostic(
                ValidationDiagnosticKind::DefaultDeviceNotAllowed,
                Some(action.id.clone()),
                None,
                None,
                None,
            ));
        }

        for binding in &defaults {
            if binding.action != action.id {
                diagnostics.push(diagnostic(
                    ValidationDiagnosticKind::DefaultActionMismatch,
                    Some(action.id.clone()),
                    Some(binding.id.clone()),
                    None,
                    None,
                ));
            }
            validate_binding(binding, &known_actions, None, &mut diagnostics);
        }
    }

    let mut base = BTreeMap::<String, Binding>::new();
    for binding in flattened_defaults {
        base.entry(binding.id.clone()).or_insert(binding);
    }
    let base = base.into_values().collect::<Vec<_>>();

    let mut effective_bindings = base.clone();
    if let Some(profile) = profile {
        let application = apply_profile(&base, profile);
        effective_bindings = application.bindings;

        let mut profile_diagnostics = application
            .diagnostics
            .into_iter()
            .map(|entry| {
                let kind = match entry.kind {
                    ProfileDiagnosticKind::AddCollision => {
                        ValidationDiagnosticKind::ProfileAddCollision
                    }
                    ProfileDiagnosticKind::MissingBinding => {
                        ValidationDiagnosticKind::ProfileMissingBinding
                    }
                    ProfileDiagnosticKind::ReplacementIdMismatch => {
                        ValidationDiagnosticKind::ProfileReplacementIdMismatch
                    }
                };
                diagnostic(
                    kind,
                    None,
                    Some(entry.binding_id),
                    Some(entry.patch_index),
                    None,
                )
            })
            .collect::<Vec<_>>();

        for (patch_index, patch) in profile.patches.iter().enumerate() {
            match patch {
                BindingPatch::Add { binding } | BindingPatch::Replace { binding, .. } => {
                    validate_binding(
                        binding,
                        &known_actions,
                        Some(patch_index),
                        &mut profile_diagnostics,
                    );
                }
                BindingPatch::Remove { .. } => {}
            }
        }
        profile_diagnostics.sort_by_key(|entry| entry.patch_index.unwrap_or(usize::MAX));
        diagnostics.extend(profile_diagnostics);
    }

    let resolvable = effective_bindings
        .iter()
        .filter(|binding| binding_is_resolvable(binding, &known_actions))
        .cloned()
        .collect::<Vec<_>>();
    let conflicts = analyze_conflicts(&resolvable);

    RegistryValidationReport {
        valid: diagnostics.is_empty(),
        effective_bindings,
        diagnostics,
        conflicts,
    }
}

fn validate_binding(
    binding: &Binding,
    known_actions: &BTreeSet<String>,
    patch_index: Option<usize>,
    diagnostics: &mut Vec<ValidationDiagnostic>,
) {
    if binding.id.is_empty() {
        diagnostics.push(diagnostic(
            ValidationDiagnosticKind::EmptyBindingId,
            Some(binding.action.clone()),
            Some(binding.id.clone()),
            patch_index,
            None,
        ));
    }

    if !known_actions.contains(&binding.action) {
        diagnostics.push(diagnostic(
            ValidationDiagnosticKind::UnknownAction,
            Some(binding.action.clone()),
            Some(binding.id.clone()),
            patch_index,
            None,
        ));
    }

    if binding.sequence.is_empty() {
        diagnostics.push(diagnostic(
            ValidationDiagnosticKind::EmptySequence,
            Some(binding.action.clone()),
            Some(binding.id.clone()),
            patch_index,
            None,
        ));
    }

    for (stroke_index, stroke) in binding.sequence.iter().enumerate() {
        let invalid_kind = match &stroke.key {
            KeyMatch::Logical { value } if !valid_logical_key(value) => {
                Some(ValidationDiagnosticKind::InvalidLogicalKey)
            }
            KeyMatch::Physical { value } if !valid_physical_key(value) => {
                Some(ValidationDiagnosticKind::InvalidPhysicalKey)
            }
            _ => None,
        };

        if let Some(kind) = invalid_kind {
            diagnostics.push(diagnostic(
                kind,
                Some(binding.action.clone()),
                Some(binding.id.clone()),
                patch_index,
                Some(stroke_index),
            ));
        }
    }
}

fn binding_is_resolvable(binding: &Binding, known_actions: &BTreeSet<String>) -> bool {
    !binding.id.is_empty()
        && known_actions.contains(&binding.action)
        && !binding.sequence.is_empty()
        && binding.sequence.iter().all(|stroke| match &stroke.key {
            KeyMatch::Logical { value } => valid_logical_key(value),
            KeyMatch::Physical { value } => valid_physical_key(value),
        })
}

fn valid_logical_key(value: &str) -> bool {
    !value.is_empty() && value != "Unidentified" && !value.chars().any(char::is_control)
}

fn valid_physical_key(value: &str) -> bool {
    if value.is_empty() || value == "Unidentified" {
        return false;
    }
    let mut chars = value.chars();
    chars.next().is_some_and(|ch| ch.is_ascii_alphabetic())
        && chars.all(|ch| ch.is_ascii_alphanumeric())
}

fn diagnostic(
    kind: ValidationDiagnosticKind,
    action_id: Option<String>,
    binding_id: Option<String>,
    patch_index: Option<usize>,
    stroke_index: Option<usize>,
) -> ValidationDiagnostic {
    ValidationDiagnostic {
        kind,
        action_id,
        binding_id,
        patch_index,
        stroke_index,
    }
}
