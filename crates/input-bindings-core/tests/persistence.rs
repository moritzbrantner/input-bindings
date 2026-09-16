use std::{fs, path::PathBuf};

use input_bindings_core::{
    ActionRegistry, ConfigurationDiagnosticKind, EffectiveBindingLayer, MigrationStep,
    PortableBindingPatch, PortableConfigurationV1, PresetDefinition,
    canonicalize_portable_configuration, resolve_portable_configuration,
};
use serde::Deserialize;
use serde_json::Value;

fn fixture_path() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../fixtures/persistence.json")
}

fn serialization_input_path() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../fixtures/serialization-v1.input.json")
}

fn serialization_expected_path() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../fixtures/serialization-v1.expected.json")
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Fixture {
    current_registry_version: u32,
    registry: ActionRegistry,
    presets: Vec<PresetDefinition>,
    migrations: Vec<MigrationStep>,
    cases: Vec<FixtureCase>,
}

#[derive(Deserialize)]
struct FixtureCase {
    name: String,
    configuration: PortableConfigurationV1,
    expected: Expected,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Expected {
    valid: bool,
    migrated_registry_version: u32,
    migrated_patch_targets: Vec<String>,
    diagnostic_kinds: Vec<String>,
    effective_binding_ids: Vec<String>,
    binding_sources: Vec<BindingSource>,
}

#[derive(Deserialize, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct BindingSource {
    binding_id: String,
    layer: String,
    source_id: String,
}

#[test]
fn portable_persistence_fixture_matches_migration_presets_and_provenance() {
    let fixture: Fixture = serde_json::from_str(
        &fs::read_to_string(fixture_path()).expect("persistence fixture should be readable"),
    )
    .expect("persistence fixture should deserialize");

    for case in fixture.cases {
        let report = resolve_portable_configuration(
            &case.configuration,
            &fixture.registry,
            fixture.current_registry_version,
            &fixture.presets,
            &fixture.migrations,
        );
        assert_eq!(report.valid, case.expected.valid, "case: {}", case.name);
        assert_eq!(
            report
                .configuration
                .as_ref()
                .map(|value| value.registry_version),
            Some(case.expected.migrated_registry_version),
            "case: {}",
            case.name
        );
        let targets = report
            .configuration
            .as_ref()
            .map(|configuration| {
                configuration
                    .patches
                    .iter()
                    .map(|patch| match patch {
                        PortableBindingPatch::Add { binding, .. } => binding.id.clone(),
                        PortableBindingPatch::Remove { binding_id, .. }
                        | PortableBindingPatch::Replace { binding_id, .. } => binding_id.clone(),
                    })
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default();
        assert_eq!(
            targets, case.expected.migrated_patch_targets,
            "case: {}",
            case.name
        );

        let diagnostic_kinds = report
            .diagnostics
            .iter()
            .map(|diagnostic| diagnostic_kind_name(&diagnostic.kind))
            .collect::<Vec<_>>();
        assert_eq!(
            diagnostic_kinds, case.expected.diagnostic_kinds,
            "case: {}",
            case.name
        );
        assert_eq!(
            report
                .effective_bindings
                .iter()
                .map(|entry| entry.binding.id.clone())
                .collect::<Vec<_>>(),
            case.expected.effective_binding_ids,
            "case: {}",
            case.name
        );
        assert_eq!(
            report
                .effective_bindings
                .iter()
                .map(|entry| BindingSource {
                    binding_id: entry.binding.id.clone(),
                    layer: layer_name(&entry.provenance.layer).to_owned(),
                    source_id: entry.provenance.source_id.clone(),
                })
                .collect::<Vec<_>>(),
            case.expected.binding_sources,
            "case: {}",
            case.name
        );
    }
}

#[test]
fn v1_portable_serialization_stays_byte_compatible_with_shared_fixture() {
    let input: PortableConfigurationV1 = serde_json::from_str(
        &fs::read_to_string(serialization_input_path())
            .expect("serialization input fixture should be readable"),
    )
    .expect("serialization input fixture should deserialize");
    let expected_text = fs::read_to_string(serialization_expected_path())
        .expect("serialization expected fixture should be readable");
    let expected_value: Value =
        serde_json::from_str(&expected_text).expect("serialization expected fixture should parse");

    let canonical = canonicalize_portable_configuration(&input);
    let canonical_value =
        serde_json::to_value(&canonical).expect("canonical configuration should serialize");
    assert_eq!(canonical_value, expected_value);

    let stable_text =
        serde_json::to_string_pretty(&canonical_value).expect("canonical value should serialize");
    assert_eq!(stable_text, expected_text.trim_end());
}

fn diagnostic_kind_name(kind: &ConfigurationDiagnosticKind) -> String {
    serde_json::to_value(kind)
        .expect("kind should serialize")
        .as_str()
        .expect("kind should be a string")
        .to_owned()
}

fn layer_name(layer: &EffectiveBindingLayer) -> &'static str {
    match layer {
        EffectiveBindingLayer::Default => "default",
        EffectiveBindingLayer::Preset => "preset",
        EffectiveBindingLayer::User => "user",
    }
}
