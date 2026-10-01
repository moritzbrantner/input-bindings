export * from "./analog.js";
export * from "./gesture-features.js";
export * from "./gesture-primitives.js";
export * from "./gesture-templates.js";
export * from "./gesture-trace.js";
export * from "./pointer-stroke.js";
import { type ActionRegistry, type Binding, type ContextLayer, type GestureMatch, type InputStroke, type KeyStroke, type Profile, type RegistryValidationReport, type Resolution } from "@moritzbrantner/input-bindings";
export type RuntimeActionPhase = "press" | "repeat" | "release";
export type RuntimeConsumePolicy = "never" | "matched" | "dispatched";
export type RuntimeDispatchReason = "direct" | "chord" | "timeout" | "keyUp" | "reset" | "gesture";
export type RuntimeDecisionKind = "none" | "pending" | "dispatched" | "released" | "ambiguous" | "repeatSuppressed" | "cancelled" | "reset" | "invalidConfiguration";
export type RuntimeDecisionReason = "unmatched" | "pendingChord" | "resolved" | "ambiguous" | "repeatSuppressed" | "keyReleased" | "chordMismatch" | "chordCancelled" | "timeoutResolved" | "timeoutAmbiguous" | "timeoutExpired" | "reset" | "invalidConfiguration";
export type RuntimeScheduler = {
    setTimeout(callback: () => void, delayMs: number): unknown;
    clearTimeout(handle: unknown): void;
};
export type RuntimeDispatch = {
    action: string;
    bindingId: string;
    phase: RuntimeActionPhase;
    repeat: boolean;
    reason: RuntimeDispatchReason;
    sequence: InputStroke[];
    activeContexts: string[];
    /** Present on gesture dispatches: the bound pattern that matched and the recognizer evidence. */
    gesture?: RuntimeGestureEvidence;
};
export type RuntimeGestureEvidence = {
    match: GestureMatch;
    evidence?: unknown;
};
/** A completed, recognized gesture. Gestures are event-like: a match dispatches press then release. */
export type RuntimeGestureInput = {
    /** Recognized gestures, most specific primitive or best-ranked symbol first. */
    matches: readonly GestureMatch[];
    /** Structured-cloneable recognition evidence passed through to dispatches unchanged. */
    evidence?: unknown;
};
export type RuntimeExplanation = {
    reason: RuntimeDecisionReason;
    bindingIds?: string[];
    continuationBindingIds?: string[];
    cancelledSequence?: InputStroke[];
    resetReason?: string;
    /** Gesture binding patterns tried, most specific first. */
    gestureCandidates?: GestureMatch[];
};
export type RuntimeDecision = {
    kind: RuntimeDecisionKind;
    sequence: InputStroke[];
    activeContexts: string[];
    resolution?: Resolution;
    dispatches: RuntimeDispatch[];
    consumed: boolean;
    explanation: RuntimeExplanation;
};
export type RuntimeControllerOptions = {
    registry: ActionRegistry;
    profile?: Profile;
    getActiveContexts: () => ReadonlySet<string>;
    getContextStack?: () => readonly ContextLayer[];
    chordTimeoutMs?: number;
    consumePolicy?: RuntimeConsumePolicy;
    retryOnChordMismatch?: boolean;
    scheduler?: RuntimeScheduler;
    onDispatch?: (dispatch: RuntimeDispatch) => void;
    onDecision?: (decision: RuntimeDecision) => void;
};
export type InputDownOptions = {
    repeat?: boolean;
};
export type KeyDownOptions = InputDownOptions;
export declare class InputRuntimeController {
    private registry;
    private compiledRegistry;
    private profile;
    private report;
    private readonly getActiveContexts;
    private readonly getContextStack;
    private readonly chordTimeoutMs;
    private readonly consumePolicy;
    private readonly retryOnChordMismatch;
    private readonly scheduler;
    private readonly onDispatch;
    private readonly onDecision;
    private pending;
    private pendingExactBindingIds;
    private timer;
    private readonly active;
    private readonly pressedInputs;
    constructor(options: RuntimeControllerOptions);
    get validationReport(): RegistryValidationReport;
    get effectiveBindings(): Binding[];
    get pendingSequence(): InputStroke[];
    get hasPendingChord(): boolean;
    updateConfiguration(registry: ActionRegistry, profile?: Profile): RuntimeDecision;
    updateProfile(profile?: Profile): RuntimeDecision;
    handleKeyDown(stroke: KeyStroke, options?: KeyDownOptions): RuntimeDecision;
    handleInputDown(stroke: InputStroke, options?: InputDownOptions): RuntimeDecision;
    handleKeyUp(stroke: KeyStroke): RuntimeDecision;
    handleInputUp(stroke: InputStroke): RuntimeDecision;
    /**
     * Resolves a completed gesture through the normal context/profile path. The most specific
     * candidate pattern with a non-`none` resolution decides; a match dispatches press and then
     * release immediately, so gestures never hold an action. A pending keyboard chord is cancelled.
     */
    handleGesture(input: RuntimeGestureInput): RuntimeDecision;
    cancelChord(reason?: string): RuntimeDecision;
    reset(reason?: string): RuntimeDecision;
    private processFreshStroke;
    private finishInputDown;
    private scheduleTimeout;
    private flushPendingTimeout;
    private resolve;
    private activate;
    private contextStack;
    private contexts;
    private clearPending;
    private shouldConsume;
    private decision;
    private emit;
}
