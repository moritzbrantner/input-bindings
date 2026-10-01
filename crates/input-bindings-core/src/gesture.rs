use std::collections::BTreeSet;

use serde::{Deserialize, Serialize};

use crate::{Binding, DeviceStroke, GestureMatch, InputStroke, Resolution, resolve};

/// The outcome of resolving one recognized gesture against single-stroke gesture bindings.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GestureResolution {
    pub resolution: Resolution,
    /// The binding pattern that produced `resolution`, when one matched.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub matched: Option<GestureMatch>,
    /// Every binding pattern tried, in order.
    pub candidates: Vec<GestureMatch>,
}

/// Expands recognized gestures into the binding patterns they satisfy, most specific first.
///
/// Recognized gestures arrive ordered by the recognizer (most specific primitive, or best-ranked
/// symbol, first). Each one is followed by its generalization without direction or orientation,
/// so `slash NE` is tried before `slash`, and `slash` before a less specific `swipe`. Duplicates
/// keep their first position.
pub fn gesture_match_candidates(recognized: &[GestureMatch]) -> Vec<GestureMatch> {
    let mut candidates: Vec<GestureMatch> = Vec::new();
    for gesture in recognized {
        for candidate in std::iter::once(gesture.clone()).chain(gesture.generalized()) {
            if !candidates.contains(&candidate) {
                candidates.push(candidate);
            }
        }
    }
    candidates
}

/// Resolves a recognized gesture: the first candidate pattern whose single-stroke resolution is
/// not `none` decides the result, so a more specific bound gesture always wins over a less
/// specific one and ambiguity is reported rather than skipped.
pub fn resolve_gesture(
    bindings: &[Binding],
    recognized: &[GestureMatch],
    active_contexts: &BTreeSet<String>,
) -> GestureResolution {
    let candidates = gesture_match_candidates(recognized);
    for candidate in &candidates {
        let stroke = gesture_stroke(candidate.clone());
        let resolution = resolve(bindings, std::slice::from_ref(&stroke), active_contexts);
        if resolution != Resolution::None {
            return GestureResolution {
                resolution,
                matched: Some(candidate.clone()),
                candidates,
            };
        }
    }
    GestureResolution {
        resolution: Resolution::None,
        matched: None,
        candidates,
    }
}

fn gesture_stroke(gesture: GestureMatch) -> InputStroke {
    InputStroke::Device(DeviceStroke::Gesture { gesture })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{CompassDirection, GestureOrientation};

    #[test]
    fn candidates_generalize_each_recognized_gesture_in_order() {
        let candidates = gesture_match_candidates(&[
            GestureMatch::Slash {
                direction: Some(CompassDirection::NorthEast),
            },
            GestureMatch::Drag {
                direction: Some(CompassDirection::NorthEast),
            },
            GestureMatch::Circle {
                orientation: Some(GestureOrientation::Clockwise),
            },
            GestureMatch::Slash {
                direction: Some(CompassDirection::NorthEast),
            },
            GestureMatch::Tap,
        ]);
        assert_eq!(
            candidates,
            vec![
                GestureMatch::Slash {
                    direction: Some(CompassDirection::NorthEast)
                },
                GestureMatch::Slash { direction: None },
                GestureMatch::Drag {
                    direction: Some(CompassDirection::NorthEast)
                },
                GestureMatch::Drag { direction: None },
                GestureMatch::Circle {
                    orientation: Some(GestureOrientation::Clockwise)
                },
                GestureMatch::Circle { orientation: None },
                GestureMatch::Tap,
            ]
        );
    }
}
