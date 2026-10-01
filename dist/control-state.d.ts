import type { RuntimeDispatch } from "./index.js";
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
export declare class SemanticControlState {
    private readonly holders;
    private presses;
    apply(dispatch: RuntimeDispatch): void;
    isHeld(action: string): boolean;
    /** -1, 0, or 1 from two opposing held actions; both or neither held is 0. */
    axis(negative: string, positive: string): -1 | 0 | 1;
    /** Actions pressed since the previous call, in dispatch order. */
    drainPresses(): string[];
    snapshot(): SemanticControlSnapshot;
    /** Forgets all held state and queued presses without dispatching anything. */
    clear(): void;
}
