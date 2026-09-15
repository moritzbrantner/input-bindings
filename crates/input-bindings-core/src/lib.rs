mod conflict;
mod model;
mod profile;
mod registry;
mod resolve;

pub use conflict::{Conflict, ConflictKind, ContextOverlap, analyze_conflicts};
pub use model::{
    AxisDirection, Binding, DeviceStroke, InputStroke, KeyMatch, KeyStroke, Modifiers,
    WheelDirection, WhenExpr,
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
