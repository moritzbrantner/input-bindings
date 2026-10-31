export function conflictLabel(kind) {
    const labels = {
        duplicate: "Duplicate binding",
        ambiguousExact: "Ambiguous binding",
        overrideExact: "Contextual/priority override",
        chordPrefix: "Chord prefix overlap",
        potentialExact: "Potential exact conflict",
        potentialPrefix: "Potential chord-prefix conflict",
    };
    return labels[kind];
}
