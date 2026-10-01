import type { RuntimeDispatch } from "./index.ts";

export type SemanticControlSnapshot = {
  /** Semantic actions held by at least one activation, sorted. */
  held: string[];
  /** Binding ids currently holding each held action, sorted. */
  holders: Record<string, string[]>;
};

/**
 * Consumer-side held state for games and other fixed-cadence consumers. Feed it every runtime
 * dispatch; it tracks which semantic actions are held by which bindings and queues presses so a
 * simulation tick can sample both continuous held state and one-shot actions without missing a
 * press and release that happened between ticks.
 *
 * It never interprets actions. Releases come from the runtime, which pairs them with the
 * activation that pressed, so a held action is retired even when contexts or profiles changed in
 * between; `reset` dispatches (blur, hidden, configuration change, explicit retirement) release
 * every holder.
 */
export class SemanticControlState {
  private readonly holders = new Map<string, Map<string, number>>();
  private presses: string[] = [];

  apply(dispatch: RuntimeDispatch): void {
    switch (dispatch.phase) {
      case "press": {
        this.presses.push(dispatch.action);
        // Event-like gestures press and release immediately; they only ever count as presses.
        if (dispatch.reason !== "gesture") {
          const bindings = this.holders.get(dispatch.action) ?? new Map<string, number>();
          bindings.set(dispatch.bindingId, (bindings.get(dispatch.bindingId) ?? 0) + 1);
          this.holders.set(dispatch.action, bindings);
        }
        return;
      }
      case "release": {
        const bindings = this.holders.get(dispatch.action);
        const count = bindings?.get(dispatch.bindingId) ?? 0;
        if (!bindings || count === 0) {
          return;
        }
        if (count > 1) {
          bindings.set(dispatch.bindingId, count - 1);
        } else {
          bindings.delete(dispatch.bindingId);
        }
        if (bindings.size === 0) {
          this.holders.delete(dispatch.action);
        }
        return;
      }
      case "repeat":
        return;
    }
  }

  isHeld(action: string): boolean {
    return this.holders.has(action);
  }

  /** -1, 0, or 1 from two opposing held actions; both or neither held is 0. */
  axis(negative: string, positive: string): -1 | 0 | 1 {
    const value = Number(this.isHeld(positive)) - Number(this.isHeld(negative));
    return value as -1 | 0 | 1;
  }

  /** Actions pressed since the previous call, in dispatch order. */
  drainPresses(): string[] {
    const presses = this.presses;
    this.presses = [];
    return presses;
  }

  snapshot(): SemanticControlSnapshot {
    const held = [...this.holders.keys()].sort();
    return {
      held,
      holders: Object.fromEntries(
        held.map((action) => [action, [...(this.holders.get(action)?.keys() ?? [])].sort()]),
      ),
    };
  }

  /** Forgets all held state and queued presses without dispatching anything. */
  clear(): void {
    this.holders.clear();
    this.presses = [];
  }
}
