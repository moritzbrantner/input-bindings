mod conflict;
mod model;
mod persistence;
mod platform;
mod profile;
mod registry;
mod resolve;

pub use conflict::{Conflict, ConflictKind, ContextOverlap, analyze_conflicts};
pub use model::{
    AxisDirection, Binding, DeviceStroke, InputStroke, KeyMatch, KeyStroke, Modifiers,
    WheelDirection, WhenExpr,
};
pub use persistence::{
    ConfigurationDiagnostic, ConfigurationDiagnosticKind, ConfigurationDiagnosticSeverity,
    EffectiveBindingLayer, EffectiveBindingProvenance, EffectiveBindingWithProvenance,
    MigrationRule, MigrationStep, PORTABLE_CONFIGURATION_SCHEMA_VERSION, PortableBindingPatch,
    PortableConfigurationReport, PortableConfigurationV1, PresetDefinition,
    canonicalize_portable_configuration, portable_configuration_from_profile,
    profile_from_portable_configuration, resolve_portable_configuration,
};
pub use platform::{
    BrowserFamily, PlatformConflictDiagnostic, PlatformConflictEnvironment, PlatformConflictKind,
    PlatformConflictRule, PlatformConflictSeverity, PlatformConflictSource, PlatformFamily,
    analyze_platform_conflicts,
};
pub use profile::{
    BindingPatch, Profile, ProfileApplication, ProfileDiagnostic, ProfileDiagnosticKind,
    apply_profile,
};
pub use registry::{
    ActionDefinition, ActionRegistry, DeviceClass, Provenance, RegistryValidationReport,
    RepeatPolicy, ValidationDiagnostic, ValidationDiagnosticKind, validate_registry,
};
pub use resolve::{Resolution, resolve};
