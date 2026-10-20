/** Renderer-independent editor operations, shared by React and native adapters. */
import { type Binding, type Profile } from "./index.js";
import type { ActionRegistry } from "./registry.js";
export declare function flattenDefaults(registry: ActionRegistry): Binding[];
export declare function profileFromBindings(registry: ActionRegistry, effectiveBindings: readonly Binding[], profileId: string): Profile;
export declare function bindingEquals(left: Binding, right: Binding): boolean;
