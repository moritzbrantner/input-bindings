import assert from "node:assert/strict";
import { test } from "node:test";

import {
  analyzeConflicts,
  applyProfile,
  portableConfigurationFromProfile,
  profileFromPortableConfiguration,
  resolve,
  type Binding,
  type Profile,
} from "../src/public.ts";

function generator(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state;
  };
}

function shuffled<T>(values: readonly T[], next: () => number): T[] {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = next() % (index + 1);
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

function normalizedConflicts(bindings: readonly Binding[]) {
  return analyzeConflicts(bindings)
    .map((conflict) => ({
      pair: [conflict.leftBindingId, conflict.rightBindingId].sort().join("|"),
      kind: conflict.kind,
      witnessContexts: [...(conflict.witnessContexts ?? [])].sort(),
    }))
    .sort((left, right) =>
      left.pair.localeCompare(right.pair) ||
      left.kind.localeCompare(right.kind) ||
      left.witnessContexts.join("|").localeCompare(right.witnessContexts.join("|")),
    );
}

function generatedBindings(next: () => number, count: number): Binding[] {
  const keys = ["a", "b", "c", "d", "e", "f", "g", "h"];
  return Array.from({ length: count }, (_, index) => {
    const contextIndex = next() % 4;
    return {
      id: `binding-${index.toString().padStart(2, "0")}`,
      action: `action-${next() % 9}`,
      sequence: [
        {
          key: { kind: "logical", value: keys[next() % keys.length] },
          modifiers: {
            ctrl: Boolean(next() & 1),
            alt: Boolean(next() & 1),
            shift: Boolean(next() & 1),
            meta: false,
            altGraph: false,
          },
        },
      ],
      when:
        contextIndex === 0
          ? { op: "always" }
          : { op: "context", id: `context-${contextIndex}` },
      priority: Number(next() % 3) - 1,
    } satisfies Binding;
  });
}

test("resolver and conflict semantics do not depend on registration order", () => {
  const next = generator(0x51f15eed);
  for (let iteration = 0; iteration < 128; iteration += 1) {
    const bindings = generatedBindings(next, 18);
    const candidate = bindings[next() % bindings.length];
    const contexts = new Set<string>();
    if (candidate.when?.op === "context") contexts.add(candidate.when.id);
    if (next() & 1) contexts.add(`context-${1 + (next() % 3)}`);

    const expectedResolution = resolve(bindings, candidate.sequence, contexts);
    const expectedConflicts = normalizedConflicts(bindings);

    for (let permutation = 0; permutation < 5; permutation += 1) {
      const reordered = shuffled(bindings, next);
      assert.deepEqual(
        resolve(reordered, candidate.sequence, contexts),
        expectedResolution,
        `resolution iteration=${iteration} permutation=${permutation}`,
      );
      assert.deepEqual(
        normalizedConflicts(reordered),
        expectedConflicts,
        `conflicts iteration=${iteration} permutation=${permutation}`,
      );
    }
  }
});

test("profile portable round trips preserve generated effective bindings", () => {
  const next = generator(0xc0ffee42);
  for (let iteration = 0; iteration < 128; iteration += 1) {
    const base = generatedBindings(next, 12).map((binding, index) => ({
      ...binding,
      id: `base-${index}`,
      action: `action-${index}`,
    }));
    const patches: Profile["patches"] = [];

    for (const [index, binding] of base.entries()) {
      const operation = next() % 4;
      if (operation === 0) {
        patches.push({ op: "remove", bindingId: binding.id });
      } else if (operation === 1) {
        patches.push({
          op: "replace",
          bindingId: binding.id,
          binding: {
            ...structuredClone(binding),
            priority: (binding.priority ?? 0) + 1,
          },
        });
      }
      if (index === 0 && (next() & 1)) {
        patches.push({
          op: "add",
          binding: {
            ...structuredClone(binding),
            id: `user-added-${iteration}`,
          },
        });
      }
    }

    const profile: Profile = { id: `generated-${iteration}`, patches };
    const expected = applyProfile(base, profile);
    assert.equal(expected.diagnostics.length, 0);

    const portable = portableConfigurationFromProfile(profile, base, 1);
    assert.equal(portable.diagnostics.length, 0);
    const roundTrip = profileFromPortableConfiguration(portable.configuration);
    const actual = applyProfile(base, roundTrip);

    assert.deepEqual(actual.diagnostics, []);
    assert.deepEqual(actual.bindings, expected.bindings, `iteration=${iteration}`);
  }
});
