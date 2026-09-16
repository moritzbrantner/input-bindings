import { performance } from "node:perf_hooks";

import {
  analyzeConflicts,
  applyProfile,
  resolve,
  type Binding,
  type Profile,
} from "../packages/input-bindings/src/public.ts";

const resolveIterations = Number.parseInt(process.env.BENCH_RESOLVE_ITERATIONS ?? "100000", 10);
const catalogSize = Number.parseInt(process.env.BENCH_CATALOG_SIZE ?? "512", 10);

const bindings: Binding[] = Array.from({ length: catalogSize }, (_, index) => ({
  id: `benchmark-${index.toString().padStart(4, "0")}`,
  action: `action-${index % 137}`,
  sequence: [
    {
      key: { kind: "logical", value: String.fromCharCode(97 + (index % 26)) },
      modifiers: {
        ctrl: Boolean(index & 1),
        alt: Boolean(index & 2),
        shift: Boolean(index & 4),
        meta: false,
        altGraph: false,
      },
    },
  ],
  when: index % 3 === 0 ? { op: "context", id: `context-${index % 7}` } : { op: "always" },
  priority: (index % 5) - 2,
}));

const activeContexts = new Set(["context-0", "context-3", "context-6"]);
const query = bindings[Math.floor(catalogSize / 3)].sequence;
let resolutionChecksum = 0;

const resolveStart = performance.now();
for (let iteration = 0; iteration < resolveIterations; iteration += 1) {
  const result = resolve(bindings, query, activeContexts);
  if (result.kind === "resolved") resolutionChecksum += result.bindingId.length;
  else if (result.kind === "ambiguous") resolutionChecksum += result.bindingIds.length;
  else if (result.kind === "pending") resolutionChecksum += result.continuationBindingIds.length;
}
const resolveMs = performance.now() - resolveStart;

const conflictsStart = performance.now();
const conflicts = analyzeConflicts(bindings);
const conflictsMs = performance.now() - conflictsStart;

const base = bindings.slice(0, 128);
const profile: Profile = {
  id: "benchmark-profile",
  patches: base.flatMap((binding, index) => {
    if (index % 8 === 0) return [{ op: "remove" as const, bindingId: binding.id }];
    if (index % 8 === 1) {
      return [
        {
          op: "replace" as const,
          bindingId: binding.id,
          binding: { ...structuredClone(binding), priority: binding.priority! + 1 },
        },
      ];
    }
    return [];
  }),
};

const profileIterations = Math.max(1, Math.floor(resolveIterations / 50));
let profileChecksum = 0;
const profileStart = performance.now();
for (let iteration = 0; iteration < profileIterations; iteration += 1) {
  const result = applyProfile(base, profile);
  profileChecksum += result.bindings.length + result.diagnostics.length;
}
const profileMs = performance.now() - profileStart;

const evidence = {
  schemaVersion: 1,
  runtime: `node-${process.versions.node}`,
  catalogSize,
  workloads: {
    resolve: {
      iterations: resolveIterations,
      totalMs: Number(resolveMs.toFixed(3)),
      operationsPerSecond: Math.round((resolveIterations / resolveMs) * 1000),
      checksum: resolutionChecksum,
    },
    conflictScan: {
      pairs: (catalogSize * (catalogSize - 1)) / 2,
      totalMs: Number(conflictsMs.toFixed(3)),
      conflicts: conflicts.length,
    },
    profileApplication: {
      iterations: profileIterations,
      totalMs: Number(profileMs.toFixed(3)),
      operationsPerSecond: Math.round((profileIterations / profileMs) * 1000),
      checksum: profileChecksum,
    },
  },
};

console.log(JSON.stringify(evidence, null, 2));
