use serde_json::{Map, Value};

use crate::{PortableConfigurationV1, canonicalize_portable_configuration};

pub fn serialize_portable_configuration(
    configuration: &PortableConfigurationV1,
) -> Result<String, serde_json::Error> {
    let value = serde_json::to_value(canonicalize_portable_configuration(configuration))?;
    serde_json::to_string_pretty(&stable_value(value))
}

fn stable_value(value: Value) -> Value {
    match value {
        Value::Array(values) => Value::Array(values.into_iter().map(stable_value).collect()),
        Value::Object(values) => {
            let mut entries = values.into_iter().collect::<Vec<_>>();
            entries.sort_by(|left, right| left.0.cmp(&right.0));
            let mut stable = Map::new();
            for (key, value) in entries {
                stable.insert(key, stable_value(value));
            }
            Value::Object(stable)
        }
        primitive => primitive,
    }
}
