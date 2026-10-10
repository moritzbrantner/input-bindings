import type { ActionRegistry, ContextLayer, InputStroke } from "@moritzbrantner/input-bindings";

import {
  InputRuntimeController,
  SemanticControlState,
  type RuntimeDecision,
  type RuntimeScheduler,
} from "../src/index.ts";

/** One step of `fixtures/runtime-lifecycle.json`, shared with the Rust `InputRuntime`. */
export type LifecycleStep =
  | { op: "down"; stroke: InputStroke; repeat: boolean; atMs: number }
  | { op: "up"; stroke: InputStroke; atMs: number }
  | { op: "advance"; atMs: number }
  | { op: "reset"; reason: string }
  | { op: "setActiveContexts"; contexts: string[] }
  | { op: "pushContext"; layer: ContextLayer }
  | { op: "popContext" };

export type LifecycleCase = {
  name: string;
  chordTimeoutMs?: number;
  activeContexts: string[];
  contextStack?: ContextLayer[];
  steps: LifecycleStep[];
  expected?: LifecycleObservation[];
};

/** What one step produced: decisions, dispatches, then the held state and queued presses. */
export type LifecycleObservation = {
  decisions: string[];
  dispatches: string[];
  held: string[];
  presses: string[];
};

class AbsoluteScheduler implements RuntimeScheduler {
  private now = 0;
  private nextId = 1;
  private readonly tasks = new Map<number, { at: number; callback: () => void }>();

  setTimeout(callback: () => void, delayMs: number): unknown {
    const id = this.nextId++;
    this.tasks.set(id, { at: this.now + delayMs, callback });
    return id;
  }

  clearTimeout(handle: unknown): void {
    this.tasks.delete(handle as number);
  }

  advanceTo(target: number): void {
    for (;;) {
      const next = [...this.tasks.entries()]
        .filter(([, task]) => task.at <= target)
        .sort((left, right) => left[1].at - right[1].at || left[0] - right[0])[0];
      if (!next) {
        break;
      }
      this.now = next[1].at;
      this.tasks.delete(next[0]);
      next[1].callback();
    }
    this.now = Math.max(this.now, target);
  }
}

/**
 * Runs a lifecycle case on the browser runtime. Context changes are the consumer's explicit
 * retirement (`reset("contextChanged")`), which the Rust runtime performs itself.
 */
export function runLifecycleCase(
  registry: ActionRegistry,
  testCase: LifecycleCase,
): LifecycleObservation[] {
  const scheduler = new AbsoluteScheduler();
  let activeContexts = new Set(testCase.activeContexts);
  const stack = testCase.contextStack ? [...testCase.contextStack] : undefined;
  const decisions: RuntimeDecision[] = [];
  const state = new SemanticControlState();
  const controller = new InputRuntimeController({
    registry,
    getActiveContexts: () => activeContexts,
    ...(stack ? { getContextStack: () => stack } : {}),
    ...(testCase.chordTimeoutMs === undefined ? {} : { chordTimeoutMs: testCase.chordTimeoutMs }),
    scheduler,
    onDecision: (decision) => decisions.push(decision),
    onDispatch: (dispatch) => state.apply(dispatch),
  });
  const requireStack = (): ContextLayer[] => {
    if (!stack) {
      throw new Error(`${testCase.name}: context stack operations need an initial contextStack`);
    }
    return stack;
  };

  return testCase.steps.map((step) => {
    decisions.length = 0;
    switch (step.op) {
      case "down":
        scheduler.advanceTo(step.atMs);
        controller.handleInputDown(step.stroke, { repeat: step.repeat });
        break;
      case "up":
        scheduler.advanceTo(step.atMs);
        controller.handleInputUp(step.stroke);
        break;
      case "advance":
        scheduler.advanceTo(step.atMs);
        break;
      case "reset":
        controller.reset(step.reason);
        break;
      case "setActiveContexts":
        activeContexts = new Set(step.contexts);
        controller.reset("contextChanged");
        break;
      case "pushContext":
        requireStack().push(step.layer);
        controller.reset("contextChanged");
        break;
      case "popContext":
        requireStack().pop();
        controller.reset("contextChanged");
        break;
    }
    return {
      decisions: decisions.map(
        (decision) =>
          `${decision.kind}:${decision.explanation.reason}${decision.consumed ? ":consumed" : ""}`,
      ),
      dispatches: decisions.flatMap((decision) =>
        decision.dispatches.map(
          (dispatch) =>
            `${dispatch.phase} ${dispatch.action} ${dispatch.bindingId} ${dispatch.reason}`,
        ),
      ),
      held: state.snapshot().held,
      presses: state.drainPresses(),
    };
  });
}
