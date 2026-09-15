use std::collections::BTreeSet;

use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Default, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Modifiers {
    #[serde(default)]
    pub ctrl: bool,
    #[serde(default)]
    pub alt: bool,
    #[serde(default)]
    pub shift: bool,
    #[serde(default)]
    pub meta: bool,
    #[serde(default)]
    pub alt_graph: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum KeyMatch {
    Logical { value: String },
    Physical { value: String },
}

#[derive(Clone, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KeyStroke {
    pub key: KeyMatch,
    #[serde(default)]
    pub modifiers: Modifiers,
}

#[derive(Clone, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum WheelDirection {
    Up,
    Down,
    Left,
    Right,
}

#[derive(Clone, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum AxisDirection {
    Positive,
    Negative,
}

#[derive(Clone, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(tag = "device", rename_all = "camelCase")]
pub enum DeviceStroke {
    MouseButton {
        button: u16,
        #[serde(default)]
        modifiers: Modifiers,
    },
    Wheel {
        direction: WheelDirection,
        #[serde(default)]
        modifiers: Modifiers,
    },
    GamepadButton {
        button: u16,
        threshold: u8,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        gamepad: Option<u8>,
    },
    GamepadAxis {
        axis: u8,
        direction: AxisDirection,
        threshold: u8,
        deadzone: u8,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        gamepad: Option<u8>,
    },
}

#[derive(Clone, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(untagged)]
pub enum InputStroke {
    Keyboard(KeyStroke),
    Device(DeviceStroke),
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "op", rename_all = "camelCase")]
pub enum WhenExpr {
    #[default]
    Always,
    Context {
        id: String,
    },
    Not {
        expr: Box<WhenExpr>,
    },
    All {
        exprs: Vec<WhenExpr>,
    },
    Any {
        exprs: Vec<WhenExpr>,
    },
}

impl WhenExpr {
    pub fn evaluate(&self, active_contexts: &BTreeSet<String>) -> bool {
        match self {
            Self::Always => true,
            Self::Context { id } => active_contexts.contains(id),
            Self::Not { expr } => !expr.evaluate(active_contexts),
            Self::All { exprs } => exprs.iter().all(|expr| expr.evaluate(active_contexts)),
            Self::Any { exprs } => exprs.iter().any(|expr| expr.evaluate(active_contexts)),
        }
    }

    pub fn specificity(&self) -> u32 {
        match self {
            Self::Always => 0,
            Self::Context { .. } => 1,
            Self::Not { expr } => expr.specificity(),
            Self::All { exprs } => exprs.iter().map(Self::specificity).sum(),
            Self::Any { exprs } => exprs.iter().map(Self::specificity).min().unwrap_or(0),
        }
    }

    pub(crate) fn collect_contexts(&self, contexts: &mut BTreeSet<String>) {
        match self {
            Self::Always => {}
            Self::Context { id } => {
                contexts.insert(id.clone());
            }
            Self::Not { expr } => expr.collect_contexts(contexts),
            Self::All { exprs } | Self::Any { exprs } => {
                for expr in exprs {
                    expr.collect_contexts(contexts);
                }
            }
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Binding {
    pub id: String,
    pub action: String,
    pub sequence: Vec<InputStroke>,
    #[serde(default)]
    pub when: WhenExpr,
    #[serde(default)]
    pub priority: i32,
}

impl Binding {
    pub(crate) fn rank(&self) -> (i32, u32) {
        (self.priority, self.when.specificity())
    }
}
