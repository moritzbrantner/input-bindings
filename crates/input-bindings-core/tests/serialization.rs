use std::{fs, path::PathBuf};

use input_bindings_core::{
    PortableConfigurationV1, canonicalize_portable_configuration, serialize_portable_configuration,
};

fn fixture_path(name: &str) -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../fixtures")
        .join(name)
}

#[test]
fn portable_v1_serialization_is_stable_and_compatibility_locked() {
    let input: PortableConfigurationV1 = serde_json::from_str(
        &fs::read_to_string(fixture_path("serialization_v1_input.json"))
            .expect("serialization input fixture should be readable"),
    )
    .expect("serialization input fixture should deserialize");
    let expected = fs::read_to_string(fixture_path("serialization_v1_expected.json"))
        .expect("serialization expected fixture should be readable");

    assert_eq!(
        serialize_portable_configuration(&input).expect("configuration should serialize"),
        expected.trim_end()
    );
}

#[test]
fn portable_canonicalization_is_idempotent() {
    let input: PortableConfigurationV1 = serde_json::from_str(
        &fs::read_to_string(fixture_path("serialization_v1_input.json"))
            .expect("serialization input fixture should be readable"),
    )
    .expect("serialization input fixture should deserialize");

    let once = canonicalize_portable_configuration(&input);
    let twice = canonicalize_portable_configuration(&once);
    assert_eq!(twice, once);
}
