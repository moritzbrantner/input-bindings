use std::{fs, path::PathBuf};

use input_bindings_core::{
    DEFAULT_PRESS_DRAG_THRESHOLD_PX, PressGestureCancelReason, PressGestureEvent,
    PressGestureOptions, PressGestureOptionsError, PressGestureTracker, PressPoint, PressSample,
};
use serde::Deserialize;

#[derive(Deserialize)]
struct Fixture {
    cases: Vec<FixtureCase>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct FixtureCase {
    name: String,
    drag_threshold_px: Option<f64>,
    hold_min_duration_ms: Option<f64>,
    steps: Vec<Step>,
    expected: Vec<String>,
}

#[derive(Deserialize)]
#[serde(tag = "op", rename_all = "camelCase", rename_all_fields = "camelCase")]
enum Step {
    Press {
        pointer_id: i32,
        #[serde(flatten)]
        sample: PressSample,
    },
    Move {
        pointer_id: i32,
        samples: Vec<PressSample>,
    },
    Release {
        pointer_id: i32,
        #[serde(flatten)]
        sample: PressSample,
    },
    Cancel {
        reason: PressGestureCancelReason,
    },
    CancelPointer {
        pointer_id: i32,
        reason: PressGestureCancelReason,
    },
}

fn point(point: PressPoint) -> String {
    format!("({},{})", point.x, point.y)
}

fn reason(reason: PressGestureCancelReason) -> String {
    serde_json::to_value(reason)
        .ok()
        .and_then(|value| value.as_str().map(str::to_owned))
        .unwrap_or_default()
}

/// Mirrors the observation format of `packages/input-bindings-runtime/test/press-gesture-fixtures.test.ts`.
fn observe(event: &PressGestureEvent) -> String {
    let pointer = format!("p{}", event.gesture().pointer_id);
    match event {
        PressGestureEvent::Pending { gesture } => {
            format!("pending {pointer} at{}", point(gesture.origin))
        }
        PressGestureEvent::DragStart {
            position,
            delta,
            total,
            ..
        } => format!(
            "dragStart {pointer} at{} delta{} total{}",
            point(*position),
            point(*delta),
            point(*total)
        ),
        PressGestureEvent::DragMove {
            position,
            delta,
            total,
            ..
        } => format!(
            "dragMove {pointer} at{} delta{} total{}",
            point(*position),
            point(*delta),
            point(*total)
        ),
        PressGestureEvent::DragEnd {
            position, total, ..
        } => format!(
            "dragEnd {pointer} at{} total{}",
            point(*position),
            point(*total)
        ),
        PressGestureEvent::Click { position, .. } => {
            format!("click {pointer} at{}", point(*position))
        }
        PressGestureEvent::Hold {
            position,
            duration_ms,
            ..
        } => format!("hold {pointer} at{} {duration_ms}ms", point(*position)),
        PressGestureEvent::Cancel {
            gesture,
            reason: cancel,
        } => {
            let phase = serde_json::to_value(gesture.phase)
                .ok()
                .and_then(|value| value.as_str().map(str::to_owned))
                .unwrap_or_default();
            format!("cancel {pointer} {phase} {}", reason(*cancel))
        }
    }
}

#[test]
fn press_gesture_fixture_matches_typescript() {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../fixtures/press-gestures.json");
    let fixture: Fixture =
        serde_json::from_str(&fs::read_to_string(path).expect("fixture is readable"))
            .expect("fixture parses");

    for case in fixture.cases {
        let mut tracker = PressGestureTracker::new(PressGestureOptions {
            drag_threshold_px: case
                .drag_threshold_px
                .unwrap_or(DEFAULT_PRESS_DRAG_THRESHOLD_PX),
            hold_min_duration_ms: case.hold_min_duration_ms,
            ..PressGestureOptions::default()
        })
        .expect("fixture options are valid");
        let mut events = Vec::new();
        for step in &case.steps {
            events.extend(match step {
                Step::Press { pointer_id, sample } => tracker.press(*pointer_id, *sample),
                Step::Move {
                    pointer_id,
                    samples,
                } => tracker.move_to(*pointer_id, samples),
                Step::Release { pointer_id, sample } => tracker.release(*pointer_id, *sample),
                Step::Cancel { reason } => tracker.cancel(*reason),
                Step::CancelPointer { pointer_id, reason } => {
                    tracker.cancel_pointer(*pointer_id, *reason)
                }
            });
        }
        let observed: Vec<String> = events.iter().map(observe).collect();
        assert_eq!(observed, case.expected, "{}", case.name);
        assert_eq!(tracker.current(), None, "{}", case.name);
    }
}

#[test]
fn invalid_options_fail_closed() {
    assert_eq!(
        PressGestureTracker::new(PressGestureOptions {
            drag_threshold_px: -1.0,
            ..PressGestureOptions::default()
        })
        .err(),
        Some(PressGestureOptionsError::InvalidDragThreshold)
    );
    assert_eq!(
        PressGestureTracker::new(PressGestureOptions {
            hold_min_duration_ms: Some(f64::NAN),
            ..PressGestureOptions::default()
        })
        .err(),
        Some(PressGestureOptionsError::InvalidHoldDuration)
    );
}

#[test]
fn sequences_increase_and_buttons_are_reported() {
    let mut tracker = PressGestureTracker::new(PressGestureOptions {
        button: 2,
        ..PressGestureOptions::default()
    })
    .expect("valid options");
    let sample = PressSample {
        x: 0.0,
        y: 0.0,
        t_ms: 0.0,
    };
    let first = tracker.press(1, sample);
    tracker.release(1, sample);
    let second = tracker.press(1, sample);
    assert_eq!(first[0].gesture().sequence, 1);
    assert_eq!(second[0].gesture().sequence, 2);
    assert_eq!(second[0].gesture().button, 2);
}
