import type { ConflictKind } from "@moritzbrantner/input-bindings";

export function conflictLabel(kind: ConflictKind): string {
  const labels: Record<ConflictKind, string> = {
    duplicate: "Duplicate binding",
    ambiguousExact: "Ambiguous binding",
    overrideExact: "Contextual/priority override",
    chordPrefix: "Chord prefix overlap",
    potentialExact: "Potential exact conflict",
    potentialPrefix: "Potential chord-prefix conflict",
  };
  return labels[kind];
}
