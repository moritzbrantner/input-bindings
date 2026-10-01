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
    holders = new Map();
    presses = [];
    apply(dispatch) {
        switch (dispatch.phase) {
            case "press": {
                this.presses.push(dispatch.action);
                // Event-like gestures press and release immediately; they only ever count as presses.
                if (dispatch.reason !== "gesture") {
                    const bindings = this.holders.get(dispatch.action) ?? new Map();
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
                }
                else {
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
    isHeld(action) {
        return this.holders.has(action);
    }
    /** -1, 0, or 1 from two opposing held actions; both or neither held is 0. */
    axis(negative, positive) {
        const value = Number(this.isHeld(positive)) - Number(this.isHeld(negative));
        return value;
    }
    /** Actions pressed since the previous call, in dispatch order. */
    drainPresses() {
        const presses = this.presses;
        this.presses = [];
        return presses;
    }
    snapshot() {
        const held = [...this.holders.keys()].sort();
        return {
            held,
            holders: Object.fromEntries(held.map((action) => [action, [...(this.holders.get(action)?.keys() ?? [])].sort()])),
        };
    }
    /** Forgets all held state and queued presses without dispatching anything. */
    clear() {
        this.holders.clear();
        this.presses = [];
    }
}
