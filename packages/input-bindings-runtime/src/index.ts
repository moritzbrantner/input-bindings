import {
  inputStrokeIdentity,
  resolve,
  resolveWithContextStack,
  validateRegistry,
  type ActionRegistry,
  type Binding,
  type ContextLayer,
  type InputStroke,
  type KeyStroke,
  type Profile,
  type RegistryValidationReport,
  type Resolution,
} from "@moritzbrantner/input-bindings";

export type RuntimeActionPhase = "press" | "repeat" | "release";
export type RuntimeConsumePolicy = "never" | "matched" | "dispatched";
export type RuntimeDispatchReason = "direct" | "chord" | "timeout" | "keyUp" | "reset";
export type RuntimeDecisionKind =
  | "none"
  | "pending"
  | "dispatched"
  | "released"
  | "ambiguous"
  | "repeatSuppressed"
  | "cancelled"
  | "reset"
  | "invalidConfiguration";
export type RuntimeDecisionReason =
  | "unmatched"
  | "pendingChord"
  | "resolved"
  | "ambiguous"
  | "repeatSuppressed"
  | "keyReleased"
  | "chordMismatch"
  | "chordCancelled"
  | "timeoutResolved"
  | "timeoutAmbiguous"
  | "timeoutExpired"
  | "reset"
  | "invalidConfiguration";

export interface RuntimeScheduler {
  setTimeout(callback: () => void, delayMs: number): unknown;
  clearTimeout(handle: unknown): void;
}

export interface RuntimeDispatch {
  action: string;
  bindingId: string;
  phase: RuntimeActionPhase;
  repeat: boolean;
  reason: RuntimeDispatchReason;
  sequence: InputStroke[];
  activeContexts: string[];
}

export interface RuntimeExplanation {
  reason: RuntimeDecisionReason;
  bindingIds?: string[];
  continuationBindingIds?: string[];
  cancelledSequence?: InputStroke[];
  resetReason?: string;
}

export interface RuntimeDecision {
  kind: RuntimeDecisionKind;
  sequence: InputStroke[];
  activeContexts: string[];
  resolution?: Resolution;
  dispatches: RuntimeDispatch[];
  consumed: boolean;
  explanation: RuntimeExplanation;
}

export interface RuntimeControllerOptions {
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
}

export interface InputDownOptions {
  repeat?: boolean;
}

export type KeyDownOptions = InputDownOptions;

interface ActiveActivation {
  action: string;
  bindingId: string;
  sequence: InputStroke[];
  triggerKey: string;
  activeContexts: string[];
}

const defaultScheduler: RuntimeScheduler = {
  setTimeout(callback, delayMs) {
    return globalThis.setTimeout(callback, delayMs);
  },
  clearTimeout(handle) {
    globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>);
  },
};

export class InputRuntimeController {
  private registry: ActionRegistry;
  private profile: Profile | undefined;
  private report: RegistryValidationReport;
  private readonly getActiveContexts: () => ReadonlySet<string>;
  private readonly getContextStack?: () => readonly ContextLayer[];
  private readonly chordTimeoutMs: number;
  private readonly consumePolicy: RuntimeConsumePolicy;
  private readonly retryOnChordMismatch: boolean;
  private readonly scheduler: RuntimeScheduler;
  private readonly onDispatch?: (dispatch: RuntimeDispatch) => void;
  private readonly onDecision?: (decision: RuntimeDecision) => void;
  private pending: InputStroke[] = [];
  private pendingExactBindingIds: string[] = [];
  private timer: unknown;
  private readonly active = new Map<string, ActiveActivation[]>();
  private readonly pressedInputs = new Set<string>();

  constructor(options: RuntimeControllerOptions) {
    this.registry = structuredClone(options.registry);
    this.profile = options.profile ? structuredClone(options.profile) : undefined;
    this.getActiveContexts = options.getActiveContexts;
    this.getContextStack = options.getContextStack;
    this.chordTimeoutMs = options.chordTimeoutMs ?? 1000;
    this.consumePolicy = options.consumePolicy ?? "matched";
    this.retryOnChordMismatch = options.retryOnChordMismatch ?? true;
    this.scheduler = options.scheduler ?? defaultScheduler;
    this.onDispatch = options.onDispatch;
    this.onDecision = options.onDecision;
    this.report = validateRegistry(this.registry, this.profile);
  }

  get validationReport(): RegistryValidationReport {
    return structuredClone(this.report);
  }

  get effectiveBindings(): Binding[] {
    return structuredClone(this.report.effectiveBindings);
  }

  get pendingSequence(): InputStroke[] {
    return structuredClone(this.pending);
  }

  get hasPendingChord(): boolean {
    return this.pending.length > 0;
  }

  updateConfiguration(registry: ActionRegistry, profile?: Profile): RuntimeDecision {
    const decision = this.reset("configurationChanged");
    this.registry = structuredClone(registry);
    this.profile = profile ? structuredClone(profile) : undefined;
    this.report = validateRegistry(this.registry, this.profile);
    return decision;
  }

  handleKeyDown(stroke: KeyStroke, options: KeyDownOptions = {}): RuntimeDecision {
    return this.handleInputDown(stroke, options);
  }

  handleInputDown(stroke: InputStroke, options: InputDownOptions = {}): RuntimeDecision {
    const repeat = options.repeat ?? false;
    const triggerKey = inputStrokeIdentity(stroke);
    this.pressedInputs.add(triggerKey);
    const contextStack = this.contextStack();
    const contexts = this.contexts(contextStack);

    if (!this.report.valid) {
      return this.emit(
        this.decision(
          "invalidConfiguration",
          [stroke],
          contexts,
          [],
          false,
          { reason: "invalidConfiguration" },
        ),
      );
    }

    if (repeat && this.pending.length > 0) {
      return this.emit(
        this.decision(
          "repeatSuppressed",
          structuredClone(this.pending),
          contexts,
          [],
          this.shouldConsume(true, false),
          { reason: "repeatSuppressed" },
        ),
      );
    }

    const sequence = [...this.pending, structuredClone(stroke)];
    const resolution = this.resolve(sequence, contexts, contextStack);

    if (resolution.kind === "none" && this.pending.length > 0) {
      const cancelledSequence = structuredClone(this.pending);
      this.clearPending();
      if (this.retryOnChordMismatch) {
        return this.processFreshStroke(stroke, repeat, contexts, contextStack, cancelledSequence);
      }
      return this.emit(
        this.decision(
          "cancelled",
          sequence,
          contexts,
          [],
          this.shouldConsume(true, false),
          { reason: "chordMismatch", cancelledSequence },
          resolution,
        ),
      );
    }

    return this.finishInputDown(sequence, stroke, repeat, contexts, resolution);
  }

  handleKeyUp(stroke: KeyStroke): RuntimeDecision {
    return this.handleInputUp(stroke);
  }

  handleInputUp(stroke: InputStroke): RuntimeDecision {
    const contexts = this.contexts(this.contextStack());
    const triggerKey = inputStrokeIdentity(stroke);
    this.pressedInputs.delete(triggerKey);

    if (!this.report.valid) {
      return this.emit(
        this.decision(
          "invalidConfiguration",
          [stroke],
          contexts,
          [],
          false,
          { reason: "invalidConfiguration" },
        ),
      );
    }

    const activations = this.active.get(triggerKey) ?? [];
    this.active.delete(triggerKey);
    if (activations.length === 0) {
      return this.emit(
        this.decision("none", [stroke], contexts, [], false, { reason: "unmatched" }),
      );
    }

    const dispatches = activations
      .slice()
      .sort((left, right) => left.bindingId.localeCompare(right.bindingId))
      .map<RuntimeDispatch>((activation) => ({
        action: activation.action,
        bindingId: activation.bindingId,
        phase: "release",
        repeat: false,
        reason: "keyUp",
        sequence: structuredClone(activation.sequence),
        activeContexts: contexts,
      }));

    return this.emit(
      this.decision(
        "released",
        [stroke],
        contexts,
        dispatches,
        this.shouldConsume(true, true),
        {
          reason: "keyReleased",
          bindingIds: dispatches.map((dispatch) => dispatch.bindingId),
        },
      ),
    );
  }

  cancelChord(reason = "explicit"): RuntimeDecision {
    const contexts = this.contexts(this.contextStack());
    const cancelledSequence = structuredClone(this.pending);
    this.clearPending();
    return this.emit(
      this.decision(
        "cancelled",
        cancelledSequence,
        contexts,
        [],
        false,
        { reason: "chordCancelled", cancelledSequence, resetReason: reason },
      ),
    );
  }

  reset(reason = "explicit"): RuntimeDecision {
    const contexts = this.contexts(this.contextStack());
    const sequence = structuredClone(this.pending);
    this.clearPending();
    this.pressedInputs.clear();

    const dispatches = [...this.active.values()]
      .flat()
      .sort((left, right) => left.bindingId.localeCompare(right.bindingId))
      .map<RuntimeDispatch>((activation) => ({
        action: activation.action,
        bindingId: activation.bindingId,
        phase: "release",
        repeat: false,
        reason: "reset",
        sequence: structuredClone(activation.sequence),
        activeContexts: contexts,
      }));
    this.active.clear();

    return this.emit(
      this.decision(
        "reset",
        sequence,
        contexts,
        dispatches,
        false,
        { reason: "reset", resetReason: reason },
      ),
    );
  }

  private processFreshStroke(
    stroke: InputStroke,
    repeat: boolean,
    contexts: string[],
    contextStack: readonly ContextLayer[] | undefined,
    cancelledSequence: InputStroke[],
  ): RuntimeDecision {
    const sequence = [structuredClone(stroke)];
    const resolution = this.resolve(sequence, contexts, contextStack);
    return this.finishInputDown(sequence, stroke, repeat, contexts, resolution, cancelledSequence);
  }

  private finishInputDown(
    sequence: InputStroke[],
    triggerStroke: InputStroke,
    repeat: boolean,
    contexts: string[],
    resolution: Resolution,
    cancelledSequence?: InputStroke[],
  ): RuntimeDecision {
    if (resolution.kind === "none") {
      this.clearPending();
      return this.emit(
        this.decision(
          "none",
          sequence,
          contexts,
          [],
          false,
          {
            reason: cancelledSequence ? "chordMismatch" : "unmatched",
            ...(cancelledSequence ? { cancelledSequence } : {}),
          },
          resolution,
        ),
      );
    }

    if (resolution.kind === "pending") {
      this.pending = structuredClone(sequence);
      this.pendingExactBindingIds = [...resolution.exactBindingIds];
      this.scheduleTimeout();
      return this.emit(
        this.decision(
          "pending",
          sequence,
          contexts,
          [],
          this.shouldConsume(true, false),
          {
            reason: "pendingChord",
            bindingIds: resolution.exactBindingIds,
            continuationBindingIds: resolution.continuationBindingIds,
            ...(cancelledSequence ? { cancelledSequence } : {}),
          },
          resolution,
        ),
      );
    }

    this.clearPending();

    if (resolution.kind === "ambiguous") {
      return this.emit(
        this.decision(
          "ambiguous",
          sequence,
          contexts,
          [],
          this.shouldConsume(true, false),
          {
            reason: "ambiguous",
            bindingIds: resolution.bindingIds,
            ...(cancelledSequence ? { cancelledSequence } : {}),
          },
          resolution,
        ),
      );
    }

    const repeatPolicy =
      this.registry.actions.find((action) => action.id === resolution.action)?.repeatPolicy ?? "never";
    if (repeat && repeatPolicy !== "allow") {
      return this.emit(
        this.decision(
          "repeatSuppressed",
          sequence,
          contexts,
          [],
          this.shouldConsume(true, false),
          {
            reason: "repeatSuppressed",
            bindingIds: [resolution.bindingId],
            ...(cancelledSequence ? { cancelledSequence } : {}),
          },
          resolution,
        ),
      );
    }

    const dispatch: RuntimeDispatch = {
      action: resolution.action,
      bindingId: resolution.bindingId,
      phase: repeat ? "repeat" : "press",
      repeat,
      reason: sequence.length > 1 ? "chord" : "direct",
      sequence: structuredClone(sequence),
      activeContexts: contexts,
    };
    if (!repeat) this.activate(dispatch, triggerStroke);

    return this.emit(
      this.decision(
        "dispatched",
        sequence,
        contexts,
        [dispatch],
        this.shouldConsume(true, true),
        {
          reason: "resolved",
          bindingIds: [resolution.bindingId],
          ...(cancelledSequence ? { cancelledSequence } : {}),
        },
        resolution,
      ),
    );
  }

  private scheduleTimeout(): void {
    if (this.timer !== undefined) this.scheduler.clearTimeout(this.timer);
    this.timer = this.scheduler.setTimeout(() => {
      this.timer = undefined;
      this.flushPendingTimeout();
    }, this.chordTimeoutMs);
  }

  private flushPendingTimeout(): void {
    if (this.pending.length === 0 || !this.report.valid) return;

    const sequence = structuredClone(this.pending);
    const pendingExactBindingIds = new Set(this.pendingExactBindingIds);
    this.pending = [];
    this.pendingExactBindingIds = [];
    const contextStack = this.contextStack();
    const contexts = this.contexts(contextStack);
    const exactBindings = this.report.effectiveBindings.filter(
      (binding) =>
        pendingExactBindingIds.has(binding.id) && binding.sequence.length === sequence.length,
    );
    const resolution = this.resolve(sequence, contexts, contextStack, exactBindings);

    if (resolution.kind === "resolved") {
      const dispatch: RuntimeDispatch = {
        action: resolution.action,
        bindingId: resolution.bindingId,
        phase: "press",
        repeat: false,
        reason: "timeout",
        sequence,
        activeContexts: contexts,
      };
      const finalStroke = sequence.at(-1);
      if (finalStroke && this.pressedInputs.has(inputStrokeIdentity(finalStroke))) {
        this.activate(dispatch, finalStroke);
      }
      this.emit(
        this.decision(
          "dispatched",
          sequence,
          contexts,
          [dispatch],
          false,
          { reason: "timeoutResolved", bindingIds: [resolution.bindingId] },
          resolution,
        ),
      );
      return;
    }

    if (resolution.kind === "ambiguous") {
      this.emit(
        this.decision(
          "ambiguous",
          sequence,
          contexts,
          [],
          false,
          { reason: "timeoutAmbiguous", bindingIds: resolution.bindingIds },
          resolution,
        ),
      );
      return;
    }

    this.emit(
      this.decision(
        "cancelled",
        sequence,
        contexts,
        [],
        false,
        { reason: "timeoutExpired", cancelledSequence: sequence },
        resolution,
      ),
    );
  }

  private resolve(
    sequence: readonly InputStroke[],
    contexts: readonly string[],
    contextStack: readonly ContextLayer[] | undefined,
    bindings: readonly Binding[] = this.report.effectiveBindings,
  ): Resolution {
    const activeContexts = new Set(contexts);
    return contextStack
      ? resolveWithContextStack(bindings, sequence, activeContexts, contextStack)
      : resolve(bindings, sequence, activeContexts);
  }

  private activate(dispatch: RuntimeDispatch, triggerStroke: InputStroke): void {
    const triggerKey = inputStrokeIdentity(triggerStroke);
    const existing = this.active.get(triggerKey) ?? [];
    if (!existing.some((activation) => activation.bindingId === dispatch.bindingId)) {
      existing.push({
        action: dispatch.action,
        bindingId: dispatch.bindingId,
        sequence: structuredClone(dispatch.sequence),
        triggerKey,
        activeContexts: [...dispatch.activeContexts],
      });
      this.active.set(triggerKey, existing);
    }
  }

  private contextStack(): ContextLayer[] | undefined {
    return this.getContextStack?.().map((layer) =>
      layer.blocksLower ? { id: layer.id, blocksLower: true } : { id: layer.id },
    );
  }

  private contexts(contextStack: readonly ContextLayer[] | undefined): string[] {
    const contexts = new Set(this.getActiveContexts());
    for (const layer of contextStack ?? []) contexts.add(layer.id);
    return [...contexts].sort();
  }

  private clearPending(): void {
    this.pending = [];
    this.pendingExactBindingIds = [];
    if (this.timer !== undefined) {
      this.scheduler.clearTimeout(this.timer);
      this.timer = undefined;
    }
  }

  private shouldConsume(matched: boolean, dispatched: boolean): boolean {
    switch (this.consumePolicy) {
      case "never":
        return false;
      case "matched":
        return matched;
      case "dispatched":
        return dispatched;
    }
  }

  private decision(
    kind: RuntimeDecisionKind,
    sequence: InputStroke[],
    activeContexts: string[],
    dispatches: RuntimeDispatch[],
    consumed: boolean,
    explanation: RuntimeExplanation,
    resolution?: Resolution,
  ): RuntimeDecision {
    return {
      kind,
      sequence: structuredClone(sequence),
      activeContexts: [...activeContexts],
      ...(resolution ? { resolution: structuredClone(resolution) } : {}),
      dispatches: structuredClone(dispatches),
      consumed,
      explanation: structuredClone(explanation),
    };
  }

  private emit(decision: RuntimeDecision): RuntimeDecision {
    for (const dispatch of decision.dispatches) this.onDispatch?.(structuredClone(dispatch));
    this.onDecision?.(structuredClone(decision));
    return decision;
  }
}
