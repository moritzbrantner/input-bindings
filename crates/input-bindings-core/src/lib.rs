mod conflict;
mod model;
mod profile;
mod resolve;

pub use conflict::{Conflict, ConflictKind, ContextOverlap, analyze_conflicts};
pub use model::{Binding, KeyMatch, KeyStroke, Modifiers, WhenExpr};
pub use profile::{
    BindingPatch, Profile, ProfileApplication, ProfileDiagnostic, ProfileDiagnosticKind,
    apply_profile,
};
pub use resolve::{Resolution, resolve};
