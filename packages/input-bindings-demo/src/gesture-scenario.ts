import type {
  ActionRegistry,
  Binding,
  ContextLayer,
  GestureMatch,
  Profile,
  WhenExpr,
} from "@moritzbrantner/input-bindings";
import {
  compileGestureTemplates,
  type GesturePrimitiveCandidate,
  type GestureTrace,
} from "@moritzbrantner/input-bindings-runtime";

// Everything in this module is consumer-owned dogfood: actions, runes, contexts, profiles, and the
// hit-testing below. None of it is gesture-core behavior.

const gameplay: WhenExpr = { op: "context", id: "gameplay" };
const casting: WhenExpr = { op: "context", id: "casting" };
const menu: WhenExpr = { op: "context", id: "menu" };

const bind = (id: string, action: string, gesture: GestureMatch, when: WhenExpr): Binding => ({
  id,
  action,
  sequence: [{ device: "gesture", gesture }],
  when,
});

const action = (
  id: string,
  title: string,
  defaults: Binding[],
): ActionRegistry["actions"][number] => ({
  id,
  title,
  allowedDevices: ["pointer"],
  defaults,
  provenance: { source: "gesture-lab", version: "2" },
});

export const gestureLabRegistry: ActionRegistry = {
  actions: [
    action("combat.slash", "Slash", [
      bind("combat.slash", "combat.slash", { kind: "slash" }, gameplay),
    ]),
    action("combat.risingSlash", "Rising slash", [
      bind(
        "combat.risingSlash",
        "combat.risingSlash",
        { kind: "slash", direction: "NE" },
        gameplay,
      ),
    ]),
    action("selection.encircle", "Encircle", [
      bind("selection.encircle", "selection.encircle", { kind: "circle" }, gameplay),
    ]),
    action("spell.fire", "Fire bolt", [
      bind("spell.fire", "spell.fire", { kind: "symbol", id: "lightning" }, casting),
    ]),
    action("spell.ward", "Ward", [
      bind("spell.ward", "spell.ward", { kind: "symbol", id: "triangle" }, casting),
    ]),
    action("view.zoomIn", "Zoom in", [
      bind("view.zoomIn", "view.zoomIn", { kind: "pinch", direction: "out" }, gameplay),
    ]),
    action("view.zoomOut", "Zoom out", [
      bind("view.zoomOut", "view.zoomOut", { kind: "pinch", direction: "in" }, gameplay),
    ]),
    action("view.rotate", "Rotate view", [
      bind("view.rotate", "view.rotate", { kind: "rotate" }, gameplay),
    ]),
    action("view.pan", "Pan view", [
      bind("view.pan", "view.pan", { kind: "twoFingerSwipe" }, gameplay),
    ]),
    action("menu.select", "Select menu item", [
      bind("menu.select", "menu.select", { kind: "tap" }, menu),
    ]),
  ],
};

export const gestureLabProfiles: Readonly<Record<string, Profile>> = {
  default: { id: "default", patches: [] },
  "left-handed": {
    id: "left-handed",
    patches: [
      {
        op: "replace",
        bindingId: "combat.risingSlash",
        binding: bind(
          "combat.risingSlash",
          "combat.risingSlash",
          { kind: "slash", direction: "NW" },
          gameplay,
        ),
      },
    ],
  },
  "no-runes": {
    id: "no-runes",
    patches: [
      { op: "remove", bindingId: "spell.fire" },
      { op: "remove", bindingId: "spell.ward" },
    ],
  },
};

export const gestureLabRunes = compileGestureTemplates([
  {
    id: "lightning",
    points: [
      { x: 60, y: 0 },
      { x: 30, y: 50 },
      { x: 70, y: 50 },
      { x: 40, y: 100 },
    ],
    rotation: "fixed",
    direction: "directed",
    maxDistance: 0.12,
    provenance: { source: "gesture-lab", version: "1" },
  },
  {
    id: "triangle",
    points: [
      { x: 50, y: 0 },
      { x: 100, y: 87 },
      { x: 0, y: 87 },
      { x: 50, y: 0 },
    ],
    rotation: "invariant",
    direction: "either",
    maxDistance: 0.12,
    provenance: { source: "gesture-lab", version: "1" },
  },
]);

export function gestureLabContextStack(options: {
  casting: boolean;
  menuOpen: boolean;
}): ContextLayer[] {
  return [
    { id: "gameplay" },
    ...(options.casting ? [{ id: "casting" }] : []),
    ...(options.menuOpen ? [{ id: "menu", blocksLower: true }] : []),
  ];
}

/** Targets as fractions of the surface, so replays at other sizes hit the same targets. */
export const gestureLabTargets = [
  { id: "A", x: 0.25, y: 0.3 },
  { id: "B", x: 0.6, y: 0.25 },
  { id: "C", x: 0.4, y: 0.65 },
  { id: "D", x: 0.78, y: 0.7 },
] as const;

const TARGET_RADIUS_FRACTION = 0.05;

/** Demo consumer logic: which targets a dispatched gesture affects, using returned path evidence. */
export function gestureLabEffect(
  action: string,
  trace: GestureTrace,
  candidates: readonly GesturePrimitiveCandidate[],
): string {
  const { width, height } = trace.surface;
  const targets = gestureLabTargets.map((target) => ({
    id: target.id,
    x: target.x * width,
    y: target.y * height,
  }));
  const radius = TARGET_RADIUS_FRACTION * Math.min(width, height);
  switch (action) {
    case "combat.slash":
    case "combat.risingSlash": {
      const slash = candidates.find((candidate) => candidate.kind === "slash");
      const hits = targets.filter((target) => distanceToPath(target, trace.samples) <= radius);
      return `${slash?.speedClass ?? "slow"} slash hit ${listTargets(hits)}`;
    }
    case "selection.encircle": {
      const selected = targets.filter((target) => insidePolygon(target, trace.samples));
      return `selected ${listTargets(selected)}`;
    }
    case "spell.fire":
      return "fire bolt cast";
    case "spell.ward":
      return "ward raised";
    default:
      return action;
  }
}

function listTargets(targets: readonly { id: string }[]): string {
  return targets.length === 0 ? "nothing" : targets.map((target) => target.id).join(", ");
}

function distanceToPath(
  point: { x: number; y: number },
  path: readonly { x: number; y: number }[],
): number {
  let best = Number.POSITIVE_INFINITY;
  for (let index = 1; index < path.length; index += 1) {
    const from = path[index - 1];
    const to = path[index];
    if (!from || !to) {
      continue;
    }
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const lengthSquared = dx * dx + dy * dy;
    const ratio =
      lengthSquared === 0
        ? 0
        : Math.min(
            1,
            Math.max(0, ((point.x - from.x) * dx + (point.y - from.y) * dy) / lengthSquared),
          );
    best = Math.min(
      best,
      Math.hypot(point.x - (from.x + dx * ratio), point.y - (from.y + dy * ratio)),
    );
  }
  return best;
}

function insidePolygon(
  point: { x: number; y: number },
  polygon: readonly { x: number; y: number }[],
) {
  // Even-odd ray casting over the closed stroke path.
  let inside = false;
  polygon.forEach((a, index) => {
    const b = polygon[(index === 0 ? polygon.length : index) - 1];
    if (!b || a.y > point.y === b.y > point.y) {
      return;
    }
    if (point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  });
  return inside;
}
