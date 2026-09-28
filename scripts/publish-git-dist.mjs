// Publishes the verified npm tarballs from `npm run pack:packages` as installable Git
// distribution commits, one branch per package (`dist/<package>`).
//
// Package managers can install a Git dependency only from a repository root, so a
// consumer cannot depend on `packages/input-bindings-web` at a source commit. Each
// distribution commit instead holds exactly the packed package contents at its root.
// Internal dependencies are rewritten to the exact distribution commits produced in
// the same run, so a consumer pins one commit and gets a fully pinned graph.
//
// Distribution branches only fast-forward: every new commit has the previous tip as
// its parent, and an unchanged package keeps its previous commit. Commits a consumer
// has pinned therefore stay reachable.
//
// Usage: node scripts/publish-git-dist.mjs [--push] [--remote origin]
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const REPOSITORY = "moritzbrantner/input-bindings";
const DEPENDENCY_FIELDS = ["dependencies", "optionalDependencies", "peerDependencies"];

export function distBranch(packageName) {
  return `dist/${packageName.replace(/^@[^/]+\//u, "")}`;
}

export function gitDependencySpecifier(commit, repository = REPOSITORY) {
  if (!/^[0-9a-f]{40}$/u.test(commit)) {
    throw new Error(`Distribution dependency must be an exact commit, got ${commit}`);
  }
  return `github:${repository}#${commit}`;
}

// Orders packages so that every internal dependency is published before its dependents.
export function publicationOrder(manifests) {
  const byName = new Map(manifests.map((manifest) => [manifest.name, manifest]));
  const ordered = [];
  const state = new Map();

  const visit = (name, path) => {
    if (state.get(name) === "done") return;
    if (state.get(name) === "visiting") {
      throw new Error(`Internal package dependency cycle: ${[...path, name].join(" -> ")}`);
    }
    state.set(name, "visiting");
    for (const dependency of internalDependencies(byName.get(name), byName).sort()) {
      visit(dependency, [...path, name]);
    }
    state.set(name, "done");
    ordered.push(byName.get(name));
  };

  for (const name of [...byName.keys()].sort()) visit(name, []);
  return ordered;
}

// Returns a copy of the manifest whose internal dependencies point at distribution commits.
export function rewriteInternalDependencies(manifest, commits, repository = REPOSITORY) {
  const rewritten = structuredClone(manifest);
  for (const field of DEPENDENCY_FIELDS) {
    for (const name of Object.keys(rewritten[field] ?? {})) {
      if (!name.startsWith("@moritzbrantner/input-bindings")) continue;
      const commit = commits.get(name);
      if (!commit) {
        throw new Error(`${manifest.name} depends on ${name}, which has no distribution commit yet`);
      }
      rewritten[field][name] = gitDependencySpecifier(commit, repository);
    }
  }
  return rewritten;
}

function internalDependencies(manifest, byName) {
  const names = new Set();
  for (const field of DEPENDENCY_FIELDS) {
    for (const name of Object.keys(manifest[field] ?? {})) {
      if (byName.has(name)) names.add(name);
    }
  }
  return [...names];
}

function main(argv) {
  const push = argv.includes("--push");
  const remoteIndex = argv.indexOf("--remote");
  const remote = remoteIndex === -1 ? "origin" : argv[remoteIndex + 1];
  const root = fileURLToPath(new URL("../", import.meta.url));
  const packDirectory = resolve(root, "target/npm");
  const packManifest = JSON.parse(readFileSync(resolve(packDirectory, "manifest.json"), "utf8"));
  const gitDir = git(root, ["rev-parse", "--absolute-git-dir"]);
  const sourceCommit = git(root, ["rev-parse", "HEAD"]);
  const scratch = mkdtempSync(join(tmpdir(), "input-bindings-git-dist-"));

  try {
    const packages = packManifest.artifacts.map((artifact) => {
      const directory = resolve(scratch, artifact.name.replace(/[@/]/gu, "_"));
      run("mkdir", ["-p", directory], root);
      run("tar", ["-xzf", resolve(packDirectory, artifact.file), "-C", directory], root);
      const packageRoot = resolve(directory, "package");
      const manifest = JSON.parse(readFileSync(resolve(packageRoot, "package.json"), "utf8"));
      return { artifact, manifest, packageRoot };
    });
    const byName = new Map(packages.map((entry) => [entry.manifest.name, entry]));

    const commits = new Map();
    const summary = [];
    for (const manifest of publicationOrder(packages.map((entry) => entry.manifest))) {
      const { packageRoot } = byName.get(manifest.name);
      const rewritten = rewriteInternalDependencies(manifest, commits);
      writeFileSync(resolve(packageRoot, "package.json"), `${JSON.stringify(rewritten, null, 2)}\n`);

      const branch = distBranch(manifest.name);
      const parent = fetchBranchTip(root, remote, branch);
      const index = resolve(scratch, `${branch.replace(/\//gu, "_")}.index`);
      const env = { GIT_DIR: gitDir, GIT_INDEX_FILE: index, GIT_WORK_TREE: packageRoot };
      git(packageRoot, ["add", "--all", "--force", "."], env);
      const tree = git(packageRoot, ["write-tree"], env);

      let commit = parent;
      const changed = !parent || git(root, ["rev-parse", `${parent}^{tree}`]) !== tree;
      if (changed) {
        const message = [
          `Publish ${manifest.name} ${manifest.version} from ${sourceCommit}`,
          "",
          `Source: https://github.com/${REPOSITORY}/commit/${sourceCommit}`,
        ].join("\n");
        commit = git(root, ["commit-tree", tree, ...(parent ? ["-p", parent] : []), "-m", message], {
          GIT_AUTHOR_NAME: "github-actions[bot]",
          GIT_AUTHOR_EMAIL: "41898282+github-actions[bot]@users.noreply.github.com",
          GIT_COMMITTER_NAME: "github-actions[bot]",
          GIT_COMMITTER_EMAIL: "41898282+github-actions[bot]@users.noreply.github.com",
        });
        if (push) git(root, ["push", remote, `${commit}:refs/heads/${branch}`]);
      }

      commits.set(manifest.name, commit);
      summary.push({
        name: manifest.name,
        branch,
        commit,
        changed,
        pushed: changed && push,
        dependency: gitDependencySpecifier(commit),
      });
    }

    const report = { schemaVersion: 1, source: sourceCommit, packages: summary };
    writeFileSync(resolve(packDirectory, "git-dist.json"), `${JSON.stringify(report, null, 2)}\n`);
    for (const entry of summary) {
      const state = entry.changed ? (entry.pushed ? "published" : "prepared") : "unchanged";
      console.log(`${state.padEnd(10)} ${entry.name} -> ${entry.dependency}`);
    }
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

function fetchBranchTip(root, remote, branch) {
  const listing = git(root, ["ls-remote", "--heads", remote, `refs/heads/${branch}`]);
  if (!listing) return null;
  const [tip] = listing.split(/\s+/u);
  git(root, ["fetch", "--no-tags", "--quiet", remote, `refs/heads/${branch}`]);
  if (git(root, ["rev-parse", "FETCH_HEAD"]) !== tip) {
    throw new Error(`${branch} moved while it was being fetched`);
  }
  return tip;
}

function git(cwd, args, env = {}) {
  return run("git", args, cwd, env).trim();
}

function run(command, args, cwd, env = {}) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed:\n${result.stderr}`);
  }
  return result.stdout;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2));
}
