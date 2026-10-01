import { type Binding, type Conflict, type WhenExpr } from "./index.js";
export type ConflictDisposition = "redundant" | "ambiguous" | "orderedOverride" | "chordPrefix" | "potential";
export type ConflictRepairKeepReason = "existingPrecedence" | "potentialConflict" | "redundantSameAction";
export type ConflictRepair = {
    kind: "keep";
    reason: ConflictRepairKeepReason;
} | {
    kind: "unbind";
    bindingId: string;
} | {
    kind: "prefer";
    bindingId: string;
    overBindingId: string;
    priority: number;
} | {
    kind: "narrowContext";
    bindingId: string;
    againstBindingId: string;
    when: WhenExpr;
};
export type ConflictRepairPlan = {
    conflict: Conflict;
    disposition: ConflictDisposition;
    repairs: ConflictRepair[];
};
/**
 * Returns deterministic repair alternatives without applying any of them.
 * The caller remains responsible for choosing a repair and persisting the resulting profile delta.
 */
export declare function planConflictRepairs(bindings: readonly Binding[], conflict: Conflict): ConflictRepairPlan;
/** Applies one explicit repair to a binding collection. No repair is selected implicitly. */
export declare function applyConflictRepair(bindings: readonly Binding[], repair: ConflictRepair): Binding[];
