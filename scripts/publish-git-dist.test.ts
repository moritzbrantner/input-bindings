import assert from "node:assert/strict";
import test from "node:test";

import {
  distBranch,
  gitDependencySpecifier,
  publicationOrder,
  rewriteInternalDependencies,
} from "./publish-git-dist.ts";

const core = { name: "@moritzbrantner/input-bindings", version: "0.1.0" };
const runtime = {
  name: "@moritzbrantner/input-bindings-runtime",
  version: "0.1.0",
  dependencies: { "@moritzbrantner/input-bindings": "0.1.0" },
};
const web = {
  name: "@moritzbrantner/input-bindings-web",
  version: "0.1.0",
  dependencies: {
    "@moritzbrantner/input-bindings": "0.1.0",
    "@moritzbrantner/input-bindings-runtime": "0.1.0",
  },
};
const react = {
  name: "@moritzbrantner/input-bindings-react",
  version: "0.1.0",
  dependencies: {
    "@moritzbrantner/input-bindings": "0.1.0",
    "@moritzbrantner/input-bindings-web": "0.1.0",
  },
  peerDependencies: { react: ">=19" },
};
const coreCommit = "1".repeat(40);
const runtimeCommit = "2".repeat(40);

await test("publishes every internal dependency before its dependents", () => {
  const order = publicationOrder([react, web, runtime, core]).map((manifest) => manifest.name);
  for (const manifest of [runtime, web, react]) {
    for (const dependency of Object.keys(manifest.dependencies)) {
      assert.ok(order.indexOf(dependency) < order.indexOf(manifest.name), `${dependency} first`);
    }
  }
});

await test("rejects internal dependency cycles", () => {
  const cyclicCore = { ...core, dependencies: { "@moritzbrantner/input-bindings-web": "0.1.0" } };
  assert.throws(() => publicationOrder([cyclicCore, runtime, web]), /cycle/u);
});

await test("pins internal dependencies to exact distribution commits", () => {
  const commits = new Map([
    [core.name, coreCommit],
    [runtime.name, runtimeCommit],
  ]);
  const rewritten = rewriteInternalDependencies(web, commits);
  assert.deepEqual(rewritten.dependencies, {
    "@moritzbrantner/input-bindings": `github:moritzbrantner/input-bindings#${coreCommit}`,
    "@moritzbrantner/input-bindings-runtime": `github:moritzbrantner/input-bindings#${runtimeCommit}`,
  });
  assert.equal(web.dependencies["@moritzbrantner/input-bindings"], "0.1.0", "input unchanged");
});

await test("leaves external dependencies untouched", () => {
  const commits = new Map([
    [core.name, coreCommit],
    [web.name, runtimeCommit],
  ]);
  assert.deepEqual(rewriteInternalDependencies(react, commits).peerDependencies, { react: ">=19" });
});

await test("fails closed when an internal dependency has no distribution commit", () => {
  assert.throws(
    () => rewriteInternalDependencies(web, new Map([[core.name, coreCommit]])),
    /no distribution commit/u,
  );
});

await test("accepts only exact commits and derives one branch per package", () => {
  assert.throws(() => gitDependencySpecifier("main"), /exact commit/u);
  assert.equal(distBranch("@moritzbrantner/input-bindings-web"), "dist/input-bindings-web");
});
