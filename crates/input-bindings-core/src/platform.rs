use serde::{Deserialize, Serialize};

use crate::{Binding, InputStroke, KeyMatch, WhenExpr};

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum PlatformFamily {
    Windows,
    Macos,
    Linux,
    Android,
    Ios,
    Unknown,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum BrowserFamily {
    Chromium,
    Firefox,
    Safari,
    Unknown,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum PlatformConflictSeverity {
    Info,
    Warning,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum PlatformConflictKind {
    BrowserShortcut,
    OsShortcut,
    AccessibilityShortcut,
    LayoutSensitive,
    AltGraphSensitive,
    ImeSensitive,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlatformConflictSource {
    pub id: String,
    pub title: String,
    pub url: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub verified_on: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlatformConflictRule {
    pub id: String,
    pub title: String,
    pub kind: PlatformConflictKind,
    pub severity: PlatformConflictSeverity,
    pub sequence: Vec<InputStroke>,
    #[serde(default)]
    pub platforms: Vec<PlatformFamily>,
    #[serde(default)]
    pub browsers: Vec<BrowserFamily>,
    pub source: PlatformConflictSource,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub note: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlatformConflictEnvironment {
    pub platform: PlatformFamily,
    pub browser: BrowserFamily,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub layout_map_available: Option<bool>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlatformConflictDiagnostic {
    pub binding_id: String,
    pub action: String,
    pub kind: PlatformConflictKind,
    pub severity: PlatformConflictSeverity,
    pub title: String,
    pub source: PlatformConflictSource,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub rule_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub note: Option<String>,
}

pub fn analyze_platform_conflicts(
    bindings: &[Binding],
    catalog: &[PlatformConflictRule],
    environment: &PlatformConflictEnvironment,
) -> Vec<PlatformConflictDiagnostic> {
    let mut diagnostics = Vec::new();

    for binding in bindings {
        for rule in catalog {
            if rule_applies(rule, environment) && binding.sequence == rule.sequence {
                diagnostics.push(PlatformConflictDiagnostic {
                    binding_id: binding.id.clone(),
                    action: binding.action.clone(),
                    kind: rule.kind.clone(),
                    severity: rule.severity.clone(),
                    title: rule.title.clone(),
                    source: rule.source.clone(),
                    rule_id: Some(rule.id.clone()),
                    note: rule.note.clone(),
                });
            }
        }

        if is_alt_graph_sensitive(binding, environment) {
            diagnostics.push(PlatformConflictDiagnostic {
                binding_id: binding.id.clone(),
                action: binding.action.clone(),
                kind: PlatformConflictKind::AltGraphSensitive,
                severity: PlatformConflictSeverity::Warning,
                title: "Ctrl+Alt may overlap AltGr input".to_owned(),
                source: alt_graph_source(),
                rule_id: None,
                note: Some("AltGr can surface as Control/Alt state on some browser and operating-system combinations. Prefer an AltGraph-aware or different shortcut when text entry matters.".to_owned()),
            });
        }

        if is_ime_sensitive(binding) {
            diagnostics.push(PlatformConflictDiagnostic {
                binding_id: binding.id.clone(),
                action: binding.action.clone(),
                kind: PlatformConflictKind::ImeSensitive,
                severity: PlatformConflictSeverity::Info,
                title: "Unmodified printable key is sensitive to text composition".to_owned(),
                source: ime_source(),
                rule_id: None,
                note: Some("This binding is globally active and uses an unmodified printable logical key. Keep text-entry/IME contexts excluded and continue ignoring composing keyboard events.".to_owned()),
            });
        }

        if is_layout_sensitive(binding, environment) {
            diagnostics.push(PlatformConflictDiagnostic {
                binding_id: binding.id.clone(),
                action: binding.action.clone(),
                kind: PlatformConflictKind::LayoutSensitive,
                severity: PlatformConflictSeverity::Info,
                title: "Physical binding cannot be labeled from the active keyboard layout".to_owned(),
                source: layout_source(),
                rule_id: None,
                note: Some("The binding remains positionally correct, but Keyboard.getLayoutMap() is unavailable, so displayed key labels may not match the user's layout.".to_owned()),
            });
        }
    }

    diagnostics.sort_by(|left, right| {
        left.binding_id
            .cmp(&right.binding_id)
            .then_with(|| kind_name(&left.kind).cmp(kind_name(&right.kind)))
            .then_with(|| left.rule_id.cmp(&right.rule_id))
            .then_with(|| left.title.cmp(&right.title))
    });
    diagnostics
}

fn rule_applies(rule: &PlatformConflictRule, environment: &PlatformConflictEnvironment) -> bool {
    (rule.platforms.is_empty() || rule.platforms.contains(&environment.platform))
        && (rule.browsers.is_empty() || rule.browsers.contains(&environment.browser))
}

fn is_alt_graph_sensitive(binding: &Binding, environment: &PlatformConflictEnvironment) -> bool {
    if environment.platform != PlatformFamily::Windows
        && environment.platform != PlatformFamily::Linux
    {
        return false;
    }
    binding.sequence.iter().any(|stroke| match stroke {
        InputStroke::Keyboard(key) => {
            key.modifiers.ctrl && key.modifiers.alt && !key.modifiers.alt_graph
        }
        InputStroke::Device(_) => false,
    })
}

fn is_ime_sensitive(binding: &Binding) -> bool {
    if binding.when != WhenExpr::Always {
        return false;
    }
    binding.sequence.iter().any(|stroke| match stroke {
        InputStroke::Keyboard(key) => match &key.key {
            KeyMatch::Logical { value }
                if !key.modifiers.ctrl
                    && !key.modifiers.alt
                    && !key.modifiers.meta
                    && !key.modifiers.alt_graph =>
            {
                value == "Space" || value == " " || value.chars().count() == 1
            }
            _ => false,
        },
        InputStroke::Device(_) => false,
    })
}

fn is_layout_sensitive(binding: &Binding, environment: &PlatformConflictEnvironment) -> bool {
    if environment.layout_map_available != Some(false) {
        return false;
    }
    binding.sequence.iter().any(|stroke| match stroke {
        InputStroke::Keyboard(key) => matches!(key.key, KeyMatch::Physical { .. }),
        InputStroke::Device(_) => false,
    })
}

fn alt_graph_source() -> PlatformConflictSource {
    PlatformConflictSource {
        id: "mdn.keyboard-event.get-modifier-state".to_owned(),
        title: "MDN KeyboardEvent.getModifierState()".to_owned(),
        url: "https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/getModifierState"
            .to_owned(),
        verified_on: Some("2026-09-16".to_owned()),
    }
}

fn layout_source() -> PlatformConflictSource {
    PlatformConflictSource {
        id: "mdn.keyboard.get-layout-map".to_owned(),
        title: "MDN Keyboard.getLayoutMap()".to_owned(),
        url: "https://developer.mozilla.org/en-US/docs/Web/API/Keyboard/getLayoutMap".to_owned(),
        verified_on: Some("2026-09-16".to_owned()),
    }
}

fn ime_source() -> PlatformConflictSource {
    PlatformConflictSource {
        id: "mdn.keydown-ime".to_owned(),
        title: "MDN keydown events with IME".to_owned(),
        url: "https://developer.mozilla.org/en-US/docs/Web/API/Element/keydown_event".to_owned(),
        verified_on: Some("2026-09-16".to_owned()),
    }
}

fn kind_name(kind: &PlatformConflictKind) -> &'static str {
    match kind {
        PlatformConflictKind::BrowserShortcut => "browserShortcut",
        PlatformConflictKind::OsShortcut => "osShortcut",
        PlatformConflictKind::AccessibilityShortcut => "accessibilityShortcut",
        PlatformConflictKind::LayoutSensitive => "layoutSensitive",
        PlatformConflictKind::AltGraphSensitive => "altGraphSensitive",
        PlatformConflictKind::ImeSensitive => "imeSensitive",
    }
}
