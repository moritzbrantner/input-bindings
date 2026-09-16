import { readFileSync, writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";

import {
  analyzeConflicts,
  applyProfile,
  resolve,
  type Binding,
  type BindingPatch,
  type InputStroke,
  type Modifiers,
  type Profile,
  type Resolution,
  type WhenExpr,
} from "../src/index.ts";

type ScenarioKind =
  | "resolveDirect"
  | "resolveChordPrefix"
  | "analyzeConflicts"
  | "applyProfile";

interface Scenario {
  id: string;
  kind: ScenarioKind;
  seed: number;
  bindingCount: number;
  iterations: number;
  patchCount?: number;
}

interface BenchmarkManifest {
  schemaVersion: number;
  generatorVersion: number;
  scenarios: Scenario[];
}

interface ScenarioResult {
  id: string;
  kind: ScenarioKind;
  operations: number;
  elapsedMs: number;
  nsPerOperation: number;
  checksum: number;
}

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

const manifest = JSON.parse(
  readFileSync(new URL("../../../benchmarks/scenarios.json", import.meta.url), "utf8"),
) as BenchmarkManifest;

function modifiers(rng: DeterministicRng): Modifiers | undefined {
  const mask = rng.range(8);
  if (mask === 0) return undefined;
  return {
    ctrl: (mask & 1) !== 0,
    shift: (mask & 2) !== 0,
    alt: (mask & 4) !== 0,
  };
}

function stroke(index: number, step: number, rng: DeterministicRng): InputStroke {
  return {
    key: {
      kind: step % 2 === 0 ? "physical" : "logical",
      value: step % 2 === 0 ? `Code${index}` : `key.${index}.${step}`,
    },
    modifiers: modifiers(rng),
  };
}

function generatedWhen(index: number): WhenExpr | undefined {
  switch (index % 5) {
    case 0:
      return undefined;
    case 1:
      return { op: "context", id: "editing" };
    case 2:
      return { op: "context", id: "game" };
    case 3:
      return {
        op: "all",
        exprs: [
          { op: "context", id: "editing" },
          { op: "not", expr: { op: "context", id: "modal" } },
        ],
      };
    default:
      return {
        op: "any",
        exprs: [
          { op: "context", id: "editing" },
          { op: "context", id: "game" },
        ],
      };
  }
}

function generateBindings(
  count: number,
  seed: number,
  kind: ScenarioKind,
): Binding[] {
  const rng = new DeterministicRng(seed);
  return Array.from({ length: count }, (_, index) => {
    const conflictKey = index % Math.max(1, Math.floor(count / 4));
    const keyIndex = kind === "analyzeConflicts" ? conflictKey : index;
    const sequence =
      kind === "resolveChordPrefix"
        ? [stroke(keyIndex, 0, rng), stroke(keyIndex, 1, rng)]
        : [stroke(keyIndex, 0, rng)];
    return {
      id: `binding.${index}`,
      action: `action.${index % 64}`,
      sequence,
      when: kind === "analyzeConflicts" ? generatedWhen(index) : undefined,
      priority: rng.range(5) - 2,
    };
  });
}

function generateProfile(bindings: readonly Binding[], patchCount: number, seed: number): Profile {
  const rng = new DeterministicRng(seed ^ 0xa5a5a5a5);
  const patches: BindingPatch[] = [];
  const third = Math.max(1, Math.floor(bindings.length / 3));

  for (let index = 0; index < patchCount; index += 1) {
    const slot = Math.floor(index / 3);
    switch (index % 3) {
      case 0: {
        const target = bindings[slot % third];
        const replacement = structuredClone(target);
        replacement.action = `profile.replaced.${slot % 16}`;
        replacement.priority = (replacement.priority ?? 0) + 1;
        patches.push({ op: "replace", bindingId: target.id, binding: replacement });
        break;
      }
      case 1: {
        const target = bindings[(third + slot) % bindings.length];
        patches.push({ op: "remove", bindingId: target.id });
        break;
      }
      default: {
        const source = bindings[(2 * third + slot) % bindings.length];
        const added = structuredClone(source);
        added.id = `profile.added.${slot}`;
        added.action = `profile.added-action.${rng.range(16)}`;
        patches.push({ op: "add", binding: added });
        break;
      }
    }
  }

  return { id: `benchmark.${seed}`, patches };
}

function mix(checksum: number, value: number): number {
  return Math.imul(checksum ^ value, 16_777_619) >>> 0;
}

function textFingerprint(value: string): number {
  let fingerprint = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    fingerprint = mix(fingerprint, value.charCodeAt(index));
  }
  return fingerprint;
}

function resolutionFingerprint(resolution: Resolution): number {
  switch (resolution.kind) {
    case "none":
      return 1;
    case "resolved":
      return mix(textFingerprint(resolution.bindingId), textFingerprint(resolution.action));
    case "ambiguous":
      return resolution.bindingIds.reduce(
        (checksum, id) => mix(checksum, textFingerprint(id)),
        3,
      );
    case "pending":
      return [...resolution.exactBindingIds, ...resolution.continuationBindingIds].reduce(
        (checksum, id) => mix(checksum, textFingerprint(id)),
        5,
      );
  }
}

function runResolveScenario(scenario: Scenario): ScenarioResult {
  const bindings = generateBindings(scenario.bindingCount, scenario.seed, scenario.kind);
  const activeContexts = new Set<string>();
  let checksum = 2_166_136_261;
  const started = performance.now();

  for (let iteration = 0; iteration < scenario.iterations; iteration += 1) {
    const binding = bindings[(iteration * 17 + scenario.seed) % bindings.length];
    const sequence =
      scenario.kind === "resolveChordPrefix" ? binding.sequence.slice(0, 1) : binding.sequence;
    checksum = mix(checksum, resolutionFingerprint(resolve(bindings, sequence, activeContexts)));
  }

  return result(scenario, started, checksum);
}

function runConflictScenario(scenario: Scenario): ScenarioResult {
  const bindings = generateBindings(scenario.bindingCount, scenario.seed, scenario.kind);
  let checksum = 2_166_136_261;
  const started = performance.now();

  for (let iteration = 0; iteration < scenario.iterations; iteration += 1) {
    const conflicts = analyzeConflicts(bindings);
    checksum = mix(checksum, conflicts.length);
    for (const conflict of conflicts) {
      checksum = mix(checksum, textFingerprint(conflict.leftBindingId));
      checksum = mix(checksum, textFingerprint(conflict.rightBindingId));
      checksum = mix(checksum, textFingerprint(conflict.kind));
    }
  }

  return result(scenario, started, checksum);
}

function runProfileScenario(scenario: Scenario): ScenarioResult {
  const bindings = generateBindings(scenario.bindingCount, scenario.seed, scenario.kind);
  const profile = generateProfile(bindings, scenario.patchCount ?? 0, scenario.seed);
  let checksum = 2_166_136_261;
  const started = performance.now();

  for (let iteration = 0; iteration < scenario.iterations; iteration += 1) {
    const application = applyProfile(bindings, profile);
    checksum = mix(checksum, application.bindings.length);
    checksum = mix(checksum, application.diagnostics.length);
    checksum = mix(checksum, textFingerprint(application.bindings[0]?.id ?? ""));
    checksum = mix(
      checksum,
      textFingerprint(application.bindings[application.bindings.length - 1]?.id ?? ""),
    );
  }

  return result(scenario, started, checksum);
}

function result(scenario: Scenario, started: number, checksum: number): ScenarioResult {
  const elapsedMs = performance.now() - started;
  return {
    id: scenario.id,
    kind: scenario.kind,
    operations: scenario.iterations,
    elapsedMs,
    nsPerOperation: (elapsedMs * 1_000_000) / scenario.iterations,
    checksum,
  };
}

const results = manifest.scenarios.map((scenario) => {
  switch (scenario.kind) {
    case "resolveDirect":
    case "resolveChordPrefix":
      return runResolveScenario(scenario);
    case "analyzeConflicts":
      return runConflictScenario(scenario);
    case "applyProfile":
      return runProfileScenario(scenario);
  }
});

const output = JSON.stringify(
  {
    benchmarkSchemaVersion: 1,
    manifestSchemaVersion: manifest.schemaVersion,
    generatorVersion: manifest.generatorVersion,
    implementation: "typescript",
    runtime: process.version,
    platform: process.platform,
    architecture: process.arch,
    results,
  },
  null,
  2,
);

const outputPath = process.argv[2];
if (outputPath) {
  writeFileSync(outputPath, `${output}\n`);
} else {
  process.stdout.write(`${output}\n`);
}
