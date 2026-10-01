import assert from "node:assert/strict";
import { mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { releaseOutput } from "./release-output.ts";

const root = fileURLToPath(new URL("../", import.meta.url));

await test("release output accepts the declared release directory and CI temporary outputs", () => {
  assert.equal(releaseOutput(root, "release"), resolve(root, "release"));
  assert.equal(releaseOutput(root, join(tmpdir(), "release-a")), join(tmpdir(), "release-a"));
});

await test("release output rejects source roots, parents, and arbitrary repository directories", () => {
  for (const path of [root, dirname(root), "/", tmpdir(), "packages", ".git"]) {
    assert.throws(() => releaseOutput(root, path), /Release output must be/);
  }
});

await test("release output rejects a temporary symlink pointing into repository source", () => {
  const scratch = mkdtempSync(join(tmpdir(), "input-bindings-release-output-"));
  try {
    const link = join(scratch, "source");
    symlinkSync(root, link, "junction");
    assert.throws(() => releaseOutput(root, join(link, "packages")), /Release output must be/);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});

await test("release output accepts a declared runner temporary directory outside OS temporary storage", () => {
  const runnerTemporary = resolve(root, "../_temp");
  assert.equal(
    releaseOutput(root, join(runnerTemporary, "release-a"), runnerTemporary),
    join(runnerTemporary, "release-a"),
  );
  assert.throws(
    () => releaseOutput(root, runnerTemporary, runnerTemporary),
    /Release output must be/,
  );
  assert.throws(() => releaseOutput(root, "packages", root), /Release output must be/);
});
