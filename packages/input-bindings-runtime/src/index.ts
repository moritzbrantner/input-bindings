import {
  resolve,
  validateRegistry,
  type ActionRegistry,
  type Binding,
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
  sequence: KeyStroke[];
  activeContexts: string[];
}

export interface RuntimeExplanation {
  reason: RuntimeDecisionReason;
  bindingIds?: string[];
  continuationBindingIds?: string[];
  cancelledSequence?: KeyStroke[];
  resetReason?: string;
}

export interface RuntimeDecision {
  kind: RuntimeDecisionKind;
  sequence: KeyStroke[];
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
  chordTimeoutMs?: number;
  consumePolicy?: RuntimeConsumePolicy;
  retryOnChordMismatch?: boolean;
  scheduler?: RuntimeScheduler;
  onDispatch?: (dispatch: RuntimeDispatch) => void;
  onDecision?: (decision: RuntimeDecision) => void;
}

export interface KeyDownOptions {
  repeat?: boolean;
}

interface ActiveActivation {
  action: string;
  bindingId: string;
  sequence: KeyStroke[];
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
  private readonly chordTimeoutMs: number;
  private readonly consumePolicy: RuntimeConsumePolicy;
  private readonly retryOnChordMismatch: boolean;
  private readonly scheduler: RuntimeScheduler;
  private readonly onDispatch?: (dispatch: RuntimeDispatch) => void;
  private readonly onDecision?: (decision: RuntimeDecision) => void;
  private pending: KeyStroke[] = [];
  private timer: unknown;
  private readonly active = new Map<string, ActiveActivation[]>();
  private readonly pressedKeys = new Set<string>();

  constructor(options: RuntimeControllerOptions) {
    this.registry = structuredClone(options.registry);
    this.profile = options.profile ? structuredClone(options.profile) : undefined;
    this.getActiveContexts = options.getActiveContexts;
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

  get pendingSequence(): KeyStroke[] {
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
    const repeat = options.repeat ?? false;
    const triggerKey = keyIdentity(stroke);
    this.pressedKeys.add(triggerKey);
    const contexts = this.contexts();

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
    const resolution = resolve(this.report.effectiveBindings, sequence, new Set(contexts));

    if (resolution.kind === "none" && this.pending.length > 0) {
      const cancelledSequence = structuredClone(this.pending);
      this.clearPending();
      if (this.retryOnChordMismatch) {
        return this.processFreshStroke(stroke, repeat, contexts, cancelledSequence);
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

    return this.finishKeyDown(sequence, stroke, repeat, contexts, resolution);
  }

  handleKeyUp(stroke: KeyStroke): RuntimeDecision {
    const contexts = this.contexts();
    const triggerKey = keyIdentity(stroke);
    this.pressedKeys.delete(triggerKey);

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
    const contexts = this.contexts();
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
    const contexts = this.contexts();
    const sequence = structuredClone(this.pending);
    this.clearPending();
    this.pressedKeys.clear();

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
    stroke: KeyStroke,
    repeat: boolean,
    contexts: string[],
    cancelledSequence: KeyStroke[],
  ): RuntimeDecision {
    const sequence = [structuredClone(stroke)];
    const resolution = resolve(this.report.effectiveBindings, sequence, new Set(contexts));
    return this.finishKeyDown(sequence, stroke, repeat, contexts, resolution, cancelledSequence);
  }

  private finishKeyDown(
    sequence: KeyStroke[],
    triggerStroke: KeyStroke,
    repeat: boolean,
    contexts: string[],
    resolution: Resolution,
    cancelledSequence?: KeyStroke[],
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
    if (!repeat) {
      this.activate(dispatch, triggerStroke);
    }

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
    if (this.timer !== undefined) {
      this.scheduler.clearTimeout(this.timer);
    }
    this.timer = this.scheduler.setTimeout(() => {
      this.timer = undefined;
      this.flushPendingTimeout();
    }, this.chordTimeoutMs);
  }

  private flushPendingTimeout(): void {
    if (this.pending.length === 0 || !this.report.valid) {
      return;
    }

    const sequence = structuredClone(this.pending);
    this.pending = [];
    const contexts = this.contexts();
    const exactBindings = this.report.effectiveBindings.filter(
      (binding) => binding.sequence.length === sequence.length,
    );
    const resolution = resolve(exactBindings, sequence, new Set(contexts));

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
      if (finalStroke && this.pressedKeys.has(keyIdentity(finalStroke))) {
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

  private activate(dispatch: RuntimeDispatch, triggerStroke: KeyStroke): void {
    const triggerKey = keyIdentity(triggerStroke);
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

  private contexts(): string[] {
    return [...this.getActiveContexts()].sort();
  }

  private clearPending(): void {
    this.pending = [];
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
    sequence: KeyStroke[],
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
    for (const dispatch of decision.dispatches) {
      this.onDispatch?.(structuredClone(dispatch));
    }
    this.onDecision?.(structuredClone(decision));
    return decision;
  }
}

function keyIdentity(stroke: KeyStroke): string {
  return `${stroke.key.kind}:${stroke.key.value}`;
}
