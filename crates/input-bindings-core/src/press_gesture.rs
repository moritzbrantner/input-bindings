//! Platform-neutral press-gesture lifecycle: the Rust counterpart of the TypeScript
//! `PressGestureTracker`, sharing `fixtures/press-gestures.json`.
//!
//! One tracker owns one button and at most one gesture at a time. A press is pending until
//! travel from the press position exceeds the drag threshold, which latches a drag with
//! continuous deltas. A release below the threshold clicks at the press position (or holds, when
//! `hold_min_duration_ms` is set and reached). Cancellation ends the gesture without a command.
//! Callers feed surface-local coordinates with their own clock; the tracker owns no timers.

use serde::{Deserialize, Serialize};

/// The `drag` gesture primitive's stationary travel threshold, identical to the browser runtime.
pub const DEFAULT_PRESS_DRAG_THRESHOLD_PX: f64 = 10.0;

#[derive(Clone, Copy, Debug, Default, PartialEq, Serialize, Deserialize)]
pub struct PressPoint {
    pub x: f64,
    pub y: f64,
}

/// One surface-local pointer observation with a caller-owned timestamp in milliseconds.
#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
pub struct PressSample {
    pub x: f64,
    pub y: f64,
    #[serde(rename = "t")]
    pub t_ms: f64,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum PressGesturePhase {
    Pending,
    Drag,
}

/// Mirrors the browser `PointerStrokeCancelReason` names.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum PressGestureCancelReason {
    PointerCancel,
    LostPointerCapture,
    Blur,
    Hidden,
    Detach,
    Superseded,
    MultiPointer,
    ContextChange,
    Reset,
}

#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PressGestureSnapshot {
    /// Monotonic per-tracker start order.
    pub sequence: u64,
    pub pointer_id: i32,
    pub button: u16,
    pub phase: PressGesturePhase,
    /// Surface-local press position.
    pub origin: PressPoint,
}

/// Every gesture starts with `Pending` and ends with exactly one of `Click`, `Hold`, `DragEnd`,
/// or `Cancel`. A drag never ends in a click or hold.
#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum PressGestureEvent {
    Pending {
        gesture: PressGestureSnapshot,
    },
    /// `delta` measures from the press origin.
    DragStart {
        gesture: PressGestureSnapshot,
        position: PressPoint,
        delta: PressPoint,
        total: PressPoint,
    },
    /// `delta` measures from the previous drag event.
    DragMove {
        gesture: PressGestureSnapshot,
        position: PressPoint,
        delta: PressPoint,
        total: PressPoint,
    },
    DragEnd {
        gesture: PressGestureSnapshot,
        position: PressPoint,
        total: PressPoint,
    },
    /// `position` is the press position, not the release position.
    Click {
        gesture: PressGestureSnapshot,
        position: PressPoint,
    },
    Hold {
        gesture: PressGestureSnapshot,
        position: PressPoint,
        duration_ms: f64,
    },
    Cancel {
        gesture: PressGestureSnapshot,
        reason: PressGestureCancelReason,
    },
}

impl PressGestureEvent {
    pub fn gesture(&self) -> &PressGestureSnapshot {
        match self {
            Self::Pending { gesture }
            | Self::DragStart { gesture, .. }
            | Self::DragMove { gesture, .. }
            | Self::DragEnd { gesture, .. }
            | Self::Click { gesture, .. }
            | Self::Hold { gesture, .. }
            | Self::Cancel { gesture, .. } => gesture,
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct PressGestureOptions {
    pub button: u16,
    /// Travel beyond this distance from the press position turns the press into a drag.
    pub drag_threshold_px: f64,
    /// Opt-in: a stationary release at or after this duration ends in `Hold` instead of `Click`.
    pub hold_min_duration_ms: Option<f64>,
}

impl Default for PressGestureOptions {
    fn default() -> Self {
        Self {
            button: 0,
            drag_threshold_px: DEFAULT_PRESS_DRAG_THRESHOLD_PX,
            hold_min_duration_ms: None,
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PressGestureOptionsError {
    InvalidDragThreshold,
    InvalidHoldDuration,
}

#[derive(Clone, Copy, Debug)]
struct ActiveGesture {
    gesture: PressGestureSnapshot,
    last: PressPoint,
    first_stamp: f64,
    /// Latest timestamp seen; stroke time never runs backwards.
    latest_stamp: f64,
}

#[derive(Clone, Debug)]
pub struct PressGestureTracker {
    options: PressGestureOptions,
    active: Option<ActiveGesture>,
    next_sequence: u64,
}

impl PressGestureTracker {
    pub fn new(options: PressGestureOptions) -> Result<Self, PressGestureOptionsError> {
        if !options.drag_threshold_px.is_finite() || options.drag_threshold_px < 0.0 {
            return Err(PressGestureOptionsError::InvalidDragThreshold);
        }
        if options
            .hold_min_duration_ms
            .is_some_and(|duration| !duration.is_finite() || duration < 0.0)
        {
            return Err(PressGestureOptionsError::InvalidHoldDuration);
        }
        Ok(Self {
            options,
            active: None,
            next_sequence: 1,
        })
    }

    pub fn options(&self) -> PressGestureOptions {
        self.options
    }

    /// Starts a gesture. While another pointer owns the gesture the press is ignored; a repeated
    /// press by the owning pointer first cancels the stale gesture as `Superseded`.
    pub fn press(&mut self, pointer_id: i32, sample: PressSample) -> Vec<PressGestureEvent> {
        let mut events = Vec::new();
        if let Some(active) = self.active {
            if active.gesture.pointer_id != pointer_id {
                return events;
            }
            events.extend(self.cancel(PressGestureCancelReason::Superseded));
        }
        let stamp = finite_or(sample.t_ms, 0.0);
        let origin = PressPoint {
            x: sample.x,
            y: sample.y,
        };
        let gesture = PressGestureSnapshot {
            sequence: self.next_sequence,
            pointer_id,
            button: self.options.button,
            phase: PressGesturePhase::Pending,
            origin,
        };
        self.next_sequence += 1;
        self.active = Some(ActiveGesture {
            gesture,
            last: origin,
            first_stamp: stamp,
            latest_stamp: stamp,
        });
        events.push(PressGestureEvent::Pending { gesture });
        events
    }

    /// Feeds movement for the owning pointer. Other pointers are ignored.
    pub fn move_to(&mut self, pointer_id: i32, samples: &[PressSample]) -> Vec<PressGestureEvent> {
        match self.active {
            Some(active) if active.gesture.pointer_id == pointer_id && !samples.is_empty() => {
                self.advance(samples)
            }
            _ => Vec::new(),
        }
    }

    /// Ends the owning pointer's gesture with its release sample.
    pub fn release(&mut self, pointer_id: i32, sample: PressSample) -> Vec<PressGestureEvent> {
        if !self.owns(pointer_id) {
            return Vec::new();
        }
        // The release sample may itself cross the threshold or move the drag.
        let mut events = self.advance(&[sample]);
        let Some(active) = self.active.take() else {
            return events;
        };
        let gesture = active.gesture;
        let duration_ms = active.latest_stamp - active.first_stamp;
        events.push(match gesture.phase {
            PressGesturePhase::Drag => PressGestureEvent::DragEnd {
                gesture,
                position: active.last,
                total: offset(active.last, gesture.origin),
            },
            PressGesturePhase::Pending
                if self
                    .options
                    .hold_min_duration_ms
                    .is_some_and(|hold| duration_ms >= hold) =>
            {
                PressGestureEvent::Hold {
                    gesture,
                    position: gesture.origin,
                    duration_ms,
                }
            }
            PressGesturePhase::Pending => PressGestureEvent::Click {
                gesture,
                position: gesture.origin,
            },
        });
        events
    }

    /// Cancels the owned gesture for one pointer; other pointers are unaffected.
    pub fn cancel_pointer(
        &mut self,
        pointer_id: i32,
        reason: PressGestureCancelReason,
    ) -> Vec<PressGestureEvent> {
        if !self.owns(pointer_id) {
            return Vec::new();
        }
        self.cancel(reason)
    }

    /// Cancels the owned gesture, if any. A cancelled gesture never clicks, holds, or ends a drag.
    pub fn cancel(&mut self, reason: PressGestureCancelReason) -> Vec<PressGestureEvent> {
        self.active
            .take()
            .map(|active| PressGestureEvent::Cancel {
                gesture: active.gesture,
                reason,
            })
            .into_iter()
            .collect()
    }

    pub fn current(&self) -> Option<PressGestureSnapshot> {
        self.active.map(|active| active.gesture)
    }

    pub fn owns(&self, pointer_id: i32) -> bool {
        self.active
            .is_some_and(|active| active.gesture.pointer_id == pointer_id)
    }

    fn advance(&mut self, samples: &[PressSample]) -> Vec<PressGestureEvent> {
        let threshold = self.options.drag_threshold_px;
        let Some(active) = self.active.as_mut() else {
            return Vec::new();
        };
        for sample in samples {
            active.latest_stamp = active
                .latest_stamp
                .max(finite_or(sample.t_ms, active.latest_stamp));
        }
        let Some(last) = samples.last() else {
            return Vec::new();
        };
        let position = PressPoint {
            x: last.x,
            y: last.y,
        };
        let origin = active.gesture.origin;
        let kind = match active.gesture.phase {
            PressGesturePhase::Pending => {
                // Any sample past the threshold latches the drag, so jitter cannot click.
                if !samples
                    .iter()
                    .any(|sample| (sample.x - origin.x).hypot(sample.y - origin.y) > threshold)
                {
                    return Vec::new();
                }
                active.gesture.phase = PressGesturePhase::Drag;
                DragKind::Start
            }
            PressGesturePhase::Drag => {
                if position == active.last {
                    return Vec::new();
                }
                DragKind::Move
            }
        };
        let delta = offset(position, active.last);
        active.last = position;
        let gesture = active.gesture;
        let total = offset(position, origin);
        vec![match kind {
            DragKind::Start => PressGestureEvent::DragStart {
                gesture,
                position,
                delta,
                total,
            },
            DragKind::Move => PressGestureEvent::DragMove {
                gesture,
                position,
                delta,
                total,
            },
        }]
    }
}

enum DragKind {
    Start,
    Move,
}

fn offset(to: PressPoint, from: PressPoint) -> PressPoint {
    PressPoint {
        x: to.x - from.x,
        y: to.y - from.y,
    }
}

fn finite_or(value: f64, fallback: f64) -> f64 {
    if value.is_finite() { value } else { fallback }
}
