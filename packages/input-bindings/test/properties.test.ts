import assert from "node:assert/strict";
import { test } from "node:test";

import {
  analyzeConflicts,
  applyProfile,
  resolve,
  type Binding,
  type BindingPatch,
  type Conflict,
  type InputStroke,
  type Modifiers,
  type Profile,
  type WhenExpr,
} from "../src/index.ts";
import {
  canonicalizePortableConfiguration,
  portableConfigurationFromProfile,
  profileFromPortableConfiguration,
} from "../src/persistence.ts";

class DeterministicRng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0 || 0x9e3779b9;
  }

  next(): number {
    let value = this.state;
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    this.state = value >>> 0;
    return this.state;
  }

  range(upperExclusive: number): number {
    return this.next() % upperExclusive;
  }
}

const KEYS = ["a", "b", "c", "x", "y", "z"] as const;
const CONTEXTS = ["editing", "game", "modal"] as const;

function generatedModifiers(rng: DeterministicRng): Modifiers | undefined {
  const mask = rng.range(8);
  if (mask === 0) return undefined;
  return {
    ctrl: (mask & 1) !== 0,
    shift: (mask & 2) !== 0,
    alt: (mask & 4) !== 0,
  };
}

function generatedStroke(rng: DeterministicRng): InputStroke {
  return {
    key: {
      kind: rng.range(2) === 0 ? "logical" : "physical",
      value: rng.range(2) === 0 ? KEYS[rng.range(KEYS.length)] : `Key${KEYS[rng.range(KEYS.length)].toUpperCase()}`,
    },
    modifiers: generatedModifiers(rng),
  };
}

function context(id: string): WhenExpr {
  return { op: "context", id };
}

function generatedWhen(rng: DeterministicRng): WhenExpr | undefined {
  switch (rng.range(6)) {
    case 0:
      return undefined;
    case 1:
      return context(CONTEXTS[rng.range(CONTEXTS.length)]);
    case 2:
      return { op: "not", expr: context(CONTEXTS[rng.range(CONTEXTS.length)]) };
    case 3:
      return { op: "all", exprs: [context("editing"), { op: "not", expr: context("modal") }] };
    case 4:
      return { op: "any", exprs: [context("editing"), context("game")] };
    default:
      return { op: "always" };
  }
}

function generatedBinding(rng: DeterministicRng, index: number): Binding {
  const sequenceLength = 1 + rng.range(2);
  return {
    id: `b${index}`,
    action: `action.${rng.range(4)}`,
    sequence: Array.from({ length: sequenceLength }, () => generatedStroke(rng)),
    when: generatedWhen(rng),
    priority: rng.range(5) - 2,
  };
}

function normalizedConflicts(conflicts: readonly Conflict[]): string[] {
  return conflicts
    .map((conflict) => {
      const [left, right] = [conflict.leftBindingId, conflict.rightBindingId].sort();
      return JSON.stringify([
        left,
        right,
        conflict.kind,
        [...(conflict.witnessContexts ?? [])].sort(),
      ]);
    })
    .sort();
}

function generatedContexts(rng: DeterministicRng): Set<string> {
  const result = new Set<string>();
  CONTEXTS.forEach((name, index) => {
    if ((rng.next() & (1 << index)) !== 0) result.add(name);
  });
  return result;
}

function profileFor(seed: number, bindings: readonly Binding[]): Profile {
  const replacement = structuredClone(bindings[0]);
  replacement.action = `profile.replace.${seed % 3}`;
  replacement.priority = (replacement.priority ?? 0) + 1;

  const added = structuredClone(bindings[2]);
  added.id = `added-${seed}`;
  added.action = `profile.add.${seed % 2}`;

  const patches: BindingPatch[] = [
    { op: "replace", bindingId: bindings[0].id, binding: replacement },
    { op: "remove", bindingId: bindings[1].id },
    { op: "add", binding: added },
  ];
  return { id: `generated-${seed}`, patches };
}

test("generated resolver and conflict cases are invariant to registry order", () => {
  for (let seed = 1; seed <= 128; seed += 1) {
    const rng = new DeterministicRng(seed);
    const bindings = Array.from({ length: 8 }, (_, index) => generatedBinding(rng, index));
    const reversed = [...bindings].reverse();
    const selected = bindings[rng.range(bindings.length)];
    const prefixLength = selected.sequence.length === 1 ? 1 : 1 + rng.range(selected.sequence.length);
    const sequence = selected.sequence.slice(0, prefixLength);
    const activeContexts = generatedContexts(rng);

    assert.deepEqual(
      resolve(bindings, sequence, activeContexts),
      resolve(reversed, sequence, activeContexts),
      `resolver order dependence for seed ${seed}`,
    );
    assert.deepEqual(
      normalizedConflicts(analyzeConflicts(bindings)),
      normalizedConflicts(analyzeConflicts(reversed)),
      `conflict order dependence for seed ${seed}`,
    );
  }
});

test("generated profiles are deterministic and canonical persistence is idempotent", () => {
  for (let seed = 1; seed <= 128; seed += 1) {
    const rng = new DeterministicRng(seed);
    const bindings = Array.from({ length: 8 }, (_, index) => generatedBinding(rng, index));
    const profile = profileFor(seed, bindings);

    const first = applyProfile(bindings, profile);
    const repeated = applyProfile(bindings, profile);
    const reorderedBase = applyProfile([...bindings].reverse(), profile);
    assert.deepEqual(repeated, first, `profile application was nondeterministic for seed ${seed}`);
    assert.deepEqual(reorderedBase, first, `profile depended on base order for seed ${seed}`);

    const portable = portableConfigurationFromProfile(profile, bindings, 1);
    assert.deepEqual(portable.diagnostics, [], `unexpected conversion diagnostic for seed ${seed}`);
    const canonical = canonicalizePortableConfiguration(portable.configuration);
    assert.deepEqual(
      canonicalizePortableConfiguration(canonical),
      canonical,
      `portable canonicalization was not idempotent for seed ${seed}`,
    );

    const roundTrippedProfile = profileFromPortableConfiguration(canonical);
    const roundTripped = portableConfigurationFromProfile(roundTrippedProfile, bindings, 1);
    assert.deepEqual(roundTripped.diagnostics, [], `unexpected round-trip diagnostic for seed ${seed}`);
    assert.deepEqual(
      roundTripped.configuration,
      canonical,
      `profile/portable round trip changed canonical state for seed ${seed}`,
    );
  }
});
