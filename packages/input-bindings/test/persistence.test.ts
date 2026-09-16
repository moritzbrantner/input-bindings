import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import type { ActionRegistry } from "../src/registry.ts";
import {
  canonicalizePortableConfiguration,
  portableConfigurationFromProfile,
  profileFromPortableConfiguration,
  resolvePortableConfiguration,
  serializePortableConfiguration,
  type MigrationStep,
  type PortableConfigurationV1,
  type PresetDefinition,
} from "../src/persistence.ts";

interface FixtureCase {
  name: string;
  configuration: PortableConfigurationV1;
  expected: {
    valid: boolean;
    migratedRegistryVersion: number;
    migratedPatchTargets: string[];
    diagnosticKinds: string[];
    effectiveBindingIds: string[];
    bindingSources: Array<{ bindingId: string; layer: string; sourceId: string }>;
  };
}

const fixture = JSON.parse(
  readFileSync(new URL("../../../fixtures/persistence.json", import.meta.url), "utf8"),
) as {
  currentRegistryVersion: number;
  registry: ActionRegistry;
  presets: PresetDefinition[];
  migrations: MigrationStep[];
  cases: FixtureCase[];
};

test("portable persistence fixture matches migration, presets, stale diagnostics, and provenance", () => {
  for (const entry of fixture.cases) {
    const report = resolvePortableConfiguration(entry.configuration, {
      registry: fixture.registry,
      currentRegistryVersion: fixture.currentRegistryVersion,
      presets: fixture.presets,
      migrations: fixture.migrations,
    });
    assert.equal(report.valid, entry.expected.valid, entry.name);
    assert.equal(
      report.configuration?.registryVersion,
      entry.expected.migratedRegistryVersion,
      entry.name,
    );
    assert.deepEqual(
      report.configuration?.patches.map((patch) =>
        patch.op === "add" ? patch.binding.id : patch.bindingId,
      ) ?? [],
      entry.expected.migratedPatchTargets,
      entry.name,
    );
    assert.deepEqual(
      report.diagnostics.map((diagnostic) => diagnostic.kind),
      entry.expected.diagnosticKinds,
      entry.name,
    );
    assert.deepEqual(
      report.effectiveBindings.map((item) => item.binding.id),
      entry.expected.effectiveBindingIds,
      entry.name,
    );
    assert.deepEqual(
      report.effectiveBindings.map((item) => ({
        bindingId: item.binding.id,
        layer: item.provenance.layer,
        sourceId: item.provenance.sourceId,
      })),
      entry.expected.bindingSources,
      entry.name,
    );
  }
});

test("portable export is deterministic and round-trips a profile", () => {
  const profile = {
    id: "user",
    patches: [
      { op: "remove" as const, bindingId: "search.default" },
      {
        op: "replace" as const,
        bindingId: "save.default",
        binding: {
          id: "save.default",
          action: "editor.save",
          sequence: [
            { key: { kind: "logical" as const, value: "s" }, modifiers: { meta: true } },
          ],
        },
      },
    ],
  };
  const base = fixture.registry.actions.flatMap((action) => action.defaults ?? []);
  const exported = portableConfigurationFromProfile(profile, base, 3);
  assert.deepEqual(exported.diagnostics, []);
  assert.deepEqual(profileFromPortableConfiguration(exported.configuration), {
    id: "user",
    patches: [
      {
        op: "replace",
        bindingId: "save.default",
        binding: profile.patches[1].binding,
      },
      { op: "remove", bindingId: "search.default" },
    ],
  });

  const shuffled = {
    ...exported.configuration,
    patches: [...exported.configuration.patches].reverse(),
  };
  assert.equal(
    serializePortableConfiguration(shuffled),
    serializePortableConfiguration(canonicalizePortableConfiguration(exported.configuration)),
  );
});
