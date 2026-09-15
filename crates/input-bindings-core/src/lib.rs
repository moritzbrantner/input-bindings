mod conflict;
mod model;
mod profile;
mod resolve;

pub use conflict::{analyze_conflicts, Conflict, ConflictKind, ContextOverlap};
pub use model::{Binding, KeyMatch, KeyStroke, Modifiers, WhenExpr};
pub use profile::{apply_profile, BindingPatch, Profile, ProfileApplication, ProfileDiagnostic, ProfileDiagnosticKind};
pub use resolve::{resolve, Resolution};
