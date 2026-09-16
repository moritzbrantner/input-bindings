use std::collections::{BTreeMap, BTreeSet};

use serde::{Deserialize, Serialize};

use crate::{ActionRegistry, Binding, BindingPatch, Profile, Provenance};

pub const PORTABLE_CONFIGURATION_SCHEMA_VERSION: u32 = 1;

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "op", rename_all = "camelCase")]
pub enum PortableBindingPatch {
    Add {
        #[serde(rename = "actionId")]
        action_id: String,
        binding: Binding,
    },
    Remove {
        #[serde(rename = "actionId")]
        action_id: String,
        #[serde(rename = "bindingId")]
        binding_id: String,
    },
    Replace {
        #[serde(rename = "actionId")]
        action_id: String,
        #[serde(rename = "bindingId")]
        binding_id: String,
        binding: Binding,
    },
}

impl PortableBindingPatch {
    fn action_id(&self) -> &str {
        match self {
            Self::Add { action_id, .. }
            | Self::Remove { action_id, .. }
            | Self::Replace { action_id, .. } => action_id,
        }
    }

    fn action_id_mut(&mut self) -> &mut String {
        match self {
            Self::Add { action_id, .. }
            | Self::Remove { action_id, .. }
            | Self::Replace { action_id, .. } => action_id,
        }
    }

    fn target_id(&self) -> &str {
        match self {
            Self::Add { binding, .. } => &binding.id,
            Self::Remove { binding_id, .. } | Self::Replace { binding_id, .. } => binding_id,
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PortableConfigurationV1 {
    pub schema_version: u32,
    pub registry_version: u32,
    pub profile_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub preset_id: Option<String>,
    pub patches: Vec<PortableBindingPatch>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PresetDefinition {
    pub id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub extends: Option<String>,
    pub patches: Vec<PortableBindingPatch>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub provenance: Option<Provenance>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "op", rename_all = "camelCase")]
pub enum MigrationRule {
    RenameAction {
        from: String,
        to: String,
    },
    RemoveAction {
        #[serde(rename = "actionId")]
        action_id: String,
    },
    RenameBinding {
        from: String,
        to: String,
    },
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MigrationStep {
    pub from_version: u32,
    pub to_version: u32,
    pub rules: Vec<MigrationRule>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ConfigurationDiagnosticSeverity {
    Warning,
    Error,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ConfigurationDiagnosticKind {
    UnsupportedSchemaVersion,
    FutureRegistryVersion,
    MissingMigrationStep,
    InvalidMigrationStep,
    RemovedActionOverride,
    UnknownPreset,
    PresetCycle,
    DuplicatePatchTarget,
    UnknownAction,
    PatchActionMismatch,
    AddCollision,
    MissingBinding,
    ReplacementIdMismatch,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfigurationDiagnostic {
    pub severity: ConfigurationDiagnosticSeverity,
    pub kind: ConfigurationDiagnosticKind,
    pub source: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub action_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub binding_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub patch_index: Option<usize>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub from_version: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub to_version: Option<u32>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum EffectiveBindingLayer {
    Default,
    Preset,
    User,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EffectiveBindingProvenance {
    pub layer: EffectiveBindingLayer,
    pub source_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source: Option<Provenance>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub patch_index: Option<usize>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EffectiveBindingWithProvenance {
    pub binding: Binding,
    pub provenance: EffectiveBindingProvenance,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PortableConfigurationReport {
    pub valid: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub configuration: Option<PortableConfigurationV1>,
    pub effective_bindings: Vec<EffectiveBindingWithProvenance>,
    pub diagnostics: Vec<ConfigurationDiagnostic>,
}

pub fn resolve_portable_configuration(
    configuration: &PortableConfigurationV1,
    registry: &ActionRegistry,
    current_registry_version: u32,
    presets: &[PresetDefinition],
    migrations: &[MigrationStep],
) -> PortableConfigurationReport {
    let mut diagnostics = Vec::new();
    if configuration.schema_version != PORTABLE_CONFIGURATION_SCHEMA_VERSION {
        diagnostics.push(diagnostic(
            ConfigurationDiagnosticSeverity::Error,
            ConfigurationDiagnosticKind::UnsupportedSchemaVersion,
            configuration.profile_id.clone(),
        ));
        return report(None, BTreeMap::new(), diagnostics);
    }
    if configuration.registry_version > current_registry_version {
        let mut entry = diagnostic(
            ConfigurationDiagnosticSeverity::Error,
            ConfigurationDiagnosticKind::FutureRegistryVersion,
            configuration.profile_id.clone(),
        );
        entry.from_version = Some(configuration.registry_version);
        entry.to_version = Some(current_registry_version);
        diagnostics.push(entry);
        return report(None, BTreeMap::new(), diagnostics);
    }

    let Some(migrated) = migrate_configuration(
        canonicalize_portable_configuration(configuration),
        current_registry_version,
        migrations,
        &mut diagnostics,
    ) else {
        return report(None, BTreeMap::new(), diagnostics);
    };

    let known_actions = registry
        .actions
        .iter()
        .map(|action| action.id.clone())
        .collect::<BTreeSet<_>>();
    let mut effective = default_bindings_with_provenance(registry);
    let preset_by_id = presets
        .iter()
        .map(|preset| (preset.id.clone(), preset))
        .collect::<BTreeMap<_, _>>();

    if let Some(preset_id) = &migrated.preset_id
        && let Some(chain) = resolve_preset_chain(preset_id, &preset_by_id, &mut diagnostics)
    {
        for preset in chain {
            apply_portable_layer(
                &mut effective,
                &canonicalize_patches(&preset.patches),
                &known_actions,
                EffectiveBindingProvenance {
                    layer: EffectiveBindingLayer::Preset,
                    source_id: preset.id.clone(),
                    source: preset.provenance.clone(),
                    patch_index: None,
                },
                &mut diagnostics,
                true,
            );
        }
    }

    apply_portable_layer(
        &mut effective,
        &migrated.patches,
        &known_actions,
        EffectiveBindingProvenance {
            layer: EffectiveBindingLayer::User,
            source_id: migrated.profile_id.clone(),
            source: None,
            patch_index: None,
        },
        &mut diagnostics,
        false,
    );

    report(Some(migrated), effective, diagnostics)
}

pub fn canonicalize_portable_configuration(
    configuration: &PortableConfigurationV1,
) -> PortableConfigurationV1 {
    PortableConfigurationV1 {
        schema_version: PORTABLE_CONFIGURATION_SCHEMA_VERSION,
        registry_version: configuration.registry_version,
        profile_id: configuration.profile_id.clone(),
        preset_id: configuration.preset_id.clone(),
        patches: canonicalize_patches(&configuration.patches),
    }
}

pub fn portable_configuration_from_profile(
    profile: &Profile,
    base_bindings: &[Binding],
    registry_version: u32,
    preset_id: Option<String>,
) -> (PortableConfigurationV1, Vec<ConfigurationDiagnostic>) {
    let base_by_id = base_bindings
        .iter()
        .map(|binding| (binding.id.clone(), binding))
        .collect::<BTreeMap<_, _>>();
    let mut diagnostics = Vec::new();
    let mut patches = Vec::new();

    for (patch_index, patch) in profile.patches.iter().enumerate() {
        match patch {
            BindingPatch::Add { binding } => patches.push(PortableBindingPatch::Add {
                action_id: binding.action.clone(),
                binding: binding.clone(),
            }),
            BindingPatch::Replace {
                binding_id,
                binding,
            } => patches.push(PortableBindingPatch::Replace {
                action_id: binding.action.clone(),
                binding_id: binding_id.clone(),
                binding: binding.clone(),
            }),
            BindingPatch::Remove { binding_id } => {
                if let Some(base) = base_by_id.get(binding_id) {
                    patches.push(PortableBindingPatch::Remove {
                        action_id: base.action.clone(),
                        binding_id: binding_id.clone(),
                    });
                } else {
                    let mut entry = diagnostic(
                        ConfigurationDiagnosticSeverity::Warning,
                        ConfigurationDiagnosticKind::MissingBinding,
                        profile.id.clone(),
                    );
                    entry.binding_id = Some(binding_id.clone());
                    entry.patch_index = Some(patch_index);
                    diagnostics.push(entry);
                }
            }
        }
    }

    (
        canonicalize_portable_configuration(&PortableConfigurationV1 {
            schema_version: PORTABLE_CONFIGURATION_SCHEMA_VERSION,
            registry_version,
            profile_id: profile.id.clone(),
            preset_id,
            patches,
        }),
        diagnostics,
    )
}

pub fn profile_from_portable_configuration(configuration: &PortableConfigurationV1) -> Profile {
    let patches = configuration
        .patches
        .iter()
        .map(|patch| match patch {
            PortableBindingPatch::Add { binding, .. } => BindingPatch::Add {
                binding: binding.clone(),
            },
            PortableBindingPatch::Remove { binding_id, .. } => BindingPatch::Remove {
                binding_id: binding_id.clone(),
            },
            PortableBindingPatch::Replace {
                binding_id,
                binding,
                ..
            } => BindingPatch::Replace {
                binding_id: binding_id.clone(),
                binding: binding.clone(),
            },
        })
        .collect();
    Profile {
        id: configuration.profile_id.clone(),
        patches,
    }
}

fn migrate_configuration(
    mut configuration: PortableConfigurationV1,
    target_version: u32,
    migrations: &[MigrationStep],
    diagnostics: &mut Vec<ConfigurationDiagnostic>,
) -> Option<PortableConfigurationV1> {
    while configuration.registry_version < target_version {
        let mut candidates = migrations
            .iter()
            .filter(|step| step.from_version == configuration.registry_version)
            .collect::<Vec<_>>();
        candidates.sort_by_key(|step| step.to_version);
        let Some(step) = candidates.first() else {
            let mut entry = diagnostic(
                ConfigurationDiagnosticSeverity::Error,
                ConfigurationDiagnosticKind::MissingMigrationStep,
                configuration.profile_id.clone(),
            );
            entry.from_version = Some(configuration.registry_version);
            entry.to_version = Some(target_version);
            diagnostics.push(entry);
            return None;
        };
        if step.to_version <= step.from_version || step.to_version > target_version {
            let mut entry = diagnostic(
                ConfigurationDiagnosticSeverity::Error,
                ConfigurationDiagnosticKind::InvalidMigrationStep,
                configuration.profile_id.clone(),
            );
            entry.from_version = Some(step.from_version);
            entry.to_version = Some(step.to_version);
            diagnostics.push(entry);
            return None;
        }
        for rule in &step.rules {
            apply_migration_rule(&mut configuration, rule, diagnostics);
        }
        configuration.registry_version = step.to_version;
    }
    configuration.patches = canonicalize_patches(&configuration.patches);
    Some(configuration)
}

fn apply_migration_rule(
    configuration: &mut PortableConfigurationV1,
    rule: &MigrationRule,
    diagnostics: &mut Vec<ConfigurationDiagnostic>,
) {
    match rule {
        MigrationRule::RenameAction { from, to } => {
            for patch in &mut configuration.patches {
                if patch.action_id() == from {
                    *patch.action_id_mut() = to.clone();
                }
                match patch {
                    PortableBindingPatch::Add { binding, .. }
                    | PortableBindingPatch::Replace { binding, .. }
                        if binding.action == *from =>
                    {
                        binding.action = to.clone();
                    }
                    _ => {}
                }
            }
        }
        MigrationRule::RemoveAction { action_id } => {
            let mut retained = Vec::new();
            for (patch_index, patch) in configuration.patches.drain(..).enumerate() {
                if patch.action_id() == action_id {
                    let mut entry = diagnostic(
                        ConfigurationDiagnosticSeverity::Warning,
                        ConfigurationDiagnosticKind::RemovedActionOverride,
                        configuration.profile_id.clone(),
                    );
                    entry.action_id = Some(action_id.clone());
                    entry.binding_id = Some(patch.target_id().to_owned());
                    entry.patch_index = Some(patch_index);
                    diagnostics.push(entry);
                } else {
                    retained.push(patch);
                }
            }
            configuration.patches = retained;
        }
        MigrationRule::RenameBinding { from, to } => {
            for patch in &mut configuration.patches {
                match patch {
                    PortableBindingPatch::Add { binding, .. } => {
                        if binding.id == *from {
                            binding.id = to.clone();
                        }
                    }
                    PortableBindingPatch::Remove { binding_id, .. } => {
                        if binding_id == from {
                            *binding_id = to.clone();
                        }
                    }
                    PortableBindingPatch::Replace {
                        binding_id,
                        binding,
                        ..
                    } => {
                        if binding_id == from {
                            *binding_id = to.clone();
                        }
                        if binding.id == *from {
                            binding.id = to.clone();
                        }
                    }
                }
            }
        }
    }
}

fn default_bindings_with_provenance(
    registry: &ActionRegistry,
) -> BTreeMap<String, EffectiveBindingWithProvenance> {
    let mut actions = registry.actions.iter().collect::<Vec<_>>();
    actions.sort_by(|left, right| left.id.cmp(&right.id));
    let mut result = BTreeMap::new();
    for action in actions {
        let mut bindings = action.defaults.iter().collect::<Vec<_>>();
        bindings.sort_by(|left, right| left.id.cmp(&right.id));
        for binding in bindings {
            result
                .entry(binding.id.clone())
                .or_insert_with(|| EffectiveBindingWithProvenance {
                    binding: binding.clone(),
                    provenance: EffectiveBindingProvenance {
                        layer: EffectiveBindingLayer::Default,
                        source_id: action.id.clone(),
                        source: action.provenance.clone(),
                        patch_index: None,
                    },
                });
        }
    }
    result
}

fn resolve_preset_chain<'a>(
    preset_id: &str,
    presets: &'a BTreeMap<String, &'a PresetDefinition>,
    diagnostics: &mut Vec<ConfigurationDiagnostic>,
) -> Option<Vec<&'a PresetDefinition>> {
    fn visit<'a>(
        id: &str,
        presets: &'a BTreeMap<String, &'a PresetDefinition>,
        visiting: &mut BTreeSet<String>,
        visited: &mut BTreeSet<String>,
        chain: &mut Vec<&'a PresetDefinition>,
        diagnostics: &mut Vec<ConfigurationDiagnostic>,
    ) -> bool {
        if visited.contains(id) {
            return true;
        }
        if !visiting.insert(id.to_owned()) {
            diagnostics.push(diagnostic(
                ConfigurationDiagnosticSeverity::Error,
                ConfigurationDiagnosticKind::PresetCycle,
                id.to_owned(),
            ));
            return false;
        }
        let Some(preset) = presets.get(id).copied() else {
            diagnostics.push(diagnostic(
                ConfigurationDiagnosticSeverity::Error,
                ConfigurationDiagnosticKind::UnknownPreset,
                id.to_owned(),
            ));
            return false;
        };
        if let Some(parent) = &preset.extends
            && !visit(parent, presets, visiting, visited, chain, diagnostics)
        {
            return false;
        }
        visiting.remove(id);
        visited.insert(id.to_owned());
        chain.push(preset);
        true
    }

    let mut visiting = BTreeSet::new();
    let mut visited = BTreeSet::new();
    let mut chain = Vec::new();
    visit(
        preset_id,
        presets,
        &mut visiting,
        &mut visited,
        &mut chain,
        diagnostics,
    )
    .then_some(chain)
}

fn apply_portable_layer(
    effective: &mut BTreeMap<String, EffectiveBindingWithProvenance>,
    patches: &[PortableBindingPatch],
    known_actions: &BTreeSet<String>,
    base_provenance: EffectiveBindingProvenance,
    diagnostics: &mut Vec<ConfigurationDiagnostic>,
    strict: bool,
) {
    let mut seen = BTreeSet::new();
    for (patch_index, patch) in patches.iter().enumerate() {
        let binding_id = patch.target_id().to_owned();
        if !seen.insert(binding_id.clone()) {
            push_patch_diagnostic(
                diagnostics,
                ConfigurationDiagnosticSeverity::Error,
                ConfigurationDiagnosticKind::DuplicatePatchTarget,
                &base_provenance.source_id,
                patch,
                patch_index,
            );
            continue;
        }
        if !known_actions.contains(patch.action_id()) {
            push_patch_diagnostic(
                diagnostics,
                ConfigurationDiagnosticSeverity::Error,
                ConfigurationDiagnosticKind::UnknownAction,
                &base_provenance.source_id,
                patch,
                patch_index,
            );
            continue;
        }
        match patch {
            PortableBindingPatch::Add { action_id, binding }
            | PortableBindingPatch::Replace {
                action_id, binding, ..
            } if binding.action != *action_id => {
                push_patch_diagnostic(
                    diagnostics,
                    ConfigurationDiagnosticSeverity::Error,
                    ConfigurationDiagnosticKind::PatchActionMismatch,
                    &base_provenance.source_id,
                    patch,
                    patch_index,
                );
                continue;
            }
            _ => {}
        }

        let severity = if strict {
            ConfigurationDiagnosticSeverity::Error
        } else {
            ConfigurationDiagnosticSeverity::Warning
        };
        match patch {
            PortableBindingPatch::Add { binding, .. } => {
                if effective.contains_key(&binding_id) {
                    push_patch_diagnostic(
                        diagnostics,
                        severity,
                        ConfigurationDiagnosticKind::AddCollision,
                        &base_provenance.source_id,
                        patch,
                        patch_index,
                    );
                    continue;
                }
                let mut provenance = base_provenance.clone();
                provenance.patch_index = Some(patch_index);
                effective.insert(
                    binding_id,
                    EffectiveBindingWithProvenance {
                        binding: binding.clone(),
                        provenance,
                    },
                );
            }
            PortableBindingPatch::Remove { action_id, .. } => {
                let Some(existing) = effective.get(&binding_id) else {
                    push_patch_diagnostic(
                        diagnostics,
                        severity,
                        ConfigurationDiagnosticKind::MissingBinding,
                        &base_provenance.source_id,
                        patch,
                        patch_index,
                    );
                    continue;
                };
                if existing.binding.action != *action_id {
                    push_patch_diagnostic(
                        diagnostics,
                        ConfigurationDiagnosticSeverity::Error,
                        ConfigurationDiagnosticKind::PatchActionMismatch,
                        &base_provenance.source_id,
                        patch,
                        patch_index,
                    );
                    continue;
                }
                effective.remove(&binding_id);
            }
            PortableBindingPatch::Replace {
                action_id,
                binding_id,
                binding,
            } => {
                let Some(existing) = effective.get(binding_id) else {
                    push_patch_diagnostic(
                        diagnostics,
                        severity,
                        ConfigurationDiagnosticKind::MissingBinding,
                        &base_provenance.source_id,
                        patch,
                        patch_index,
                    );
                    continue;
                };
                if existing.binding.action != *action_id {
                    push_patch_diagnostic(
                        diagnostics,
                        ConfigurationDiagnosticSeverity::Error,
                        ConfigurationDiagnosticKind::PatchActionMismatch,
                        &base_provenance.source_id,
                        patch,
                        patch_index,
                    );
                    continue;
                }
                if binding.id != *binding_id {
                    push_patch_diagnostic(
                        diagnostics,
                        ConfigurationDiagnosticSeverity::Error,
                        ConfigurationDiagnosticKind::ReplacementIdMismatch,
                        &base_provenance.source_id,
                        patch,
                        patch_index,
                    );
                    continue;
                }
                let mut provenance = base_provenance.clone();
                provenance.patch_index = Some(patch_index);
                effective.insert(
                    binding_id.clone(),
                    EffectiveBindingWithProvenance {
                        binding: binding.clone(),
                        provenance,
                    },
                );
            }
        }
    }
}

fn canonicalize_patches(patches: &[PortableBindingPatch]) -> Vec<PortableBindingPatch> {
    let mut result = patches.to_vec();
    result.sort_by(|left, right| {
        left.action_id()
            .cmp(right.action_id())
            .then_with(|| left.target_id().cmp(right.target_id()))
            .then_with(|| patch_op(left).cmp(patch_op(right)))
    });
    result
}

fn patch_op(patch: &PortableBindingPatch) -> &'static str {
    match patch {
        PortableBindingPatch::Add { .. } => "add",
        PortableBindingPatch::Remove { .. } => "remove",
        PortableBindingPatch::Replace { .. } => "replace",
    }
}

fn push_patch_diagnostic(
    diagnostics: &mut Vec<ConfigurationDiagnostic>,
    severity: ConfigurationDiagnosticSeverity,
    kind: ConfigurationDiagnosticKind,
    source: &str,
    patch: &PortableBindingPatch,
    patch_index: usize,
) {
    let mut entry = diagnostic(severity, kind, source.to_owned());
    entry.action_id = Some(patch.action_id().to_owned());
    entry.binding_id = Some(patch.target_id().to_owned());
    entry.patch_index = Some(patch_index);
    diagnostics.push(entry);
}

fn report(
    configuration: Option<PortableConfigurationV1>,
    effective: BTreeMap<String, EffectiveBindingWithProvenance>,
    diagnostics: Vec<ConfigurationDiagnostic>,
) -> PortableConfigurationReport {
    PortableConfigurationReport {
        valid: !diagnostics
            .iter()
            .any(|entry| entry.severity == ConfigurationDiagnosticSeverity::Error),
        configuration,
        effective_bindings: effective.into_values().collect(),
        diagnostics,
    }
}

fn diagnostic(
    severity: ConfigurationDiagnosticSeverity,
    kind: ConfigurationDiagnosticKind,
    source: String,
) -> ConfigurationDiagnostic {
    ConfigurationDiagnostic {
        severity,
        kind,
        source,
        action_id: None,
        binding_id: None,
        patch_index: None,
        from_version: None,
        to_version: None,
    }
}
