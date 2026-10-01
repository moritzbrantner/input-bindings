// Publishes the verified npm tarballs from `bun run pack:packages` as installable Git
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
// Usage: bun scripts/publish-git-dist.ts [--push] [--remote origin]
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const REPOSITORY = "moritzbrantner/input-bindings";
const DEPENDENCY_FIELDS = ["dependencies", "optionalDependencies", "peerDependencies"] as const;

type PackageManifest = {
  name: string;
  version: string;
  dependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
};

type PackedArtifact = { name: string; file: string };

export function distBranch(packageName: string) {
  return `dist/${packageName.replace(/^@[^/]+\//u, "")}`;
}

export function gitDependencySpecifier(commit: string, repository = REPOSITORY) {
  if (!/^[0-9a-f]{40}$/u.test(commit)) {
    throw new Error(`Distribution dependency must be an exact commit, got ${commit}`);
  }
  return `github:${repository}#${commit}`;
}

// Orders packages so that every internal dependency is published before its dependents.
export function publicationOrder(manifests: PackageManifest[]) {
  const byName = new Map(manifests.map((manifest) => [manifest.name, manifest]));
  const ordered: PackageManifest[] = [];
  const state = new Map<string, "visiting" | "done">();

  const visit = (name: string, path: string[]) => {
    if (state.get(name) === "done") {
      return;
    }
    if (state.get(name) === "visiting") {
      throw new Error(`Internal package dependency cycle: ${[...path, name].join(" -> ")}`);
    }
    const manifest = byName.get(name);
    if (!manifest) {
      throw new Error(`Unknown internal package: ${name}`);
    }
    state.set(name, "visiting");
    for (const dependency of internalDependencies(manifest, byName).sort()) {
      visit(dependency, [...path, name]);
    }
    state.set(name, "done");
    ordered.push(manifest);
  };

  for (const name of [...byName.keys()].sort()) {
    visit(name, []);
  }
  return ordered;
}

// Returns a copy of the manifest whose internal dependencies point at distribution commits.
export function rewriteInternalDependencies<T extends PackageManifest>(
  manifest: T,
  commits: ReadonlyMap<string, string>,
  repository = REPOSITORY,
) {
  const rewritten = structuredClone(manifest);
  for (const field of DEPENDENCY_FIELDS) {
    for (const name of Object.keys(rewritten[field] ?? {})) {
      if (!name.startsWith("@moritzbrantner/input-bindings")) {
        continue;
      }
      const commit = commits.get(name);
      if (!commit) {
        throw new Error(
          `${manifest.name} depends on ${name}, which has no distribution commit yet`,
        );
      }
      const dependencies = rewritten[field];
      if (dependencies) {
        dependencies[name] = gitDependencySpecifier(commit, repository);
      }
    }
  }
  return rewritten;
}

function internalDependencies(
  manifest: PackageManifest,
  byName: ReadonlyMap<string, PackageManifest>,
) {
  const names = new Set<string>();
  for (const field of DEPENDENCY_FIELDS) {
    for (const name of Object.keys(manifest[field] ?? {})) {
      if (byName.has(name)) {
        names.add(name);
      }
    }
  }
  return [...names];
}

function main(argv: string[]) {
  const push = argv.includes("--push");
  const remoteIndex = argv.indexOf("--remote");
  const remote = remoteIndex === -1 ? "origin" : argv[remoteIndex + 1];
  if (!remote) {
    throw new Error("--remote requires a value.");
  }
  const root = fileURLToPath(new URL("../", import.meta.url));
  const packDirectory = resolve(root, "target/npm");
  const packManifest: { artifacts: PackedArtifact[] } = JSON.parse(
    readFileSync(resolve(packDirectory, "manifest.json"), "utf8"),
  );
  const gitDir = git(root, ["rev-parse", "--absolute-git-dir"]);
  const sourceCommit = git(root, ["rev-parse", "HEAD"]);
  const scratch = mkdtempSync(join(tmpdir(), "input-bindings-git-dist-"));

  try {
    const packages = packManifest.artifacts.map((artifact: PackedArtifact) => {
      const directory = resolve(scratch, artifact.name.replace(/[@/]/gu, "_"));
      run("mkdir", ["-p", directory], root);
      run("tar", ["-xzf", resolve(packDirectory, artifact.file), "-C", directory], root);
      const packageRoot = resolve(directory, "package");
      const manifest: PackageManifest = JSON.parse(
        readFileSync(resolve(packageRoot, "package.json"), "utf8"),
      );
      return { artifact, manifest, packageRoot };
    });
    const byName = new Map(packages.map((entry) => [entry.manifest.name, entry]));

    const commits = new Map<string, string>();
    const summary = [];
    for (const manifest of publicationOrder(packages.map((entry) => entry.manifest))) {
      const entry = byName.get(manifest.name);
      if (!entry) {
        throw new Error(`Missing packed package: ${manifest.name}`);
      }
      const { packageRoot } = entry;
      const rewritten = rewriteInternalDependencies(manifest, commits);
      writeFileSync(
        resolve(packageRoot, "package.json"),
        `${JSON.stringify(rewritten, null, 2)}\n`,
      );

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
        commit = git(
          root,
          ["commit-tree", tree, ...(parent ? ["-p", parent] : []), "-m", message],
          {
            GIT_AUTHOR_NAME: "github-actions[bot]",
            GIT_AUTHOR_EMAIL: "41898282+github-actions[bot]@users.noreply.github.com",
            GIT_COMMITTER_NAME: "github-actions[bot]",
            GIT_COMMITTER_EMAIL: "41898282+github-actions[bot]@users.noreply.github.com",
          },
        );
        if (push) {
          git(root, ["push", remote, `${commit}:refs/heads/${branch}`]);
        }
      }

      if (!commit) {
        throw new Error(`No distribution commit for ${manifest.name}`);
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
      let state = "unchanged";
      if (entry.changed) {
        state = entry.pushed ? "published" : "prepared";
      }
      console.log(`${state.padEnd(10)} ${entry.name} -> ${entry.dependency}`);
    }
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

function fetchBranchTip(root: string, remote: string, branch: string) {
  const listing = git(root, ["ls-remote", "--heads", remote, `refs/heads/${branch}`]);
  if (!listing) {
    return null;
  }
  const [tip] = listing.split(/\s+/u);
  if (!tip) {
    throw new Error(`Missing remote tip for ${branch}`);
  }
  git(root, ["fetch", "--no-tags", "--quiet", remote, `refs/heads/${branch}`]);
  if (git(root, ["rev-parse", "FETCH_HEAD"]) !== tip) {
    throw new Error(`${branch} moved while it was being fetched`);
  }
  return tip;
}

function git(cwd: string, args: string[], env: NodeJS.ProcessEnv = {}) {
  return run("git", args, cwd, env).trim();
}

function run(command: string, args: string[], cwd: string, env: NodeJS.ProcessEnv = {}) {
  const result = spawnSync(command, args, {
    cwd,
    timeout: 120_000,
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed:\n${result.stderr}`);
  }
  return result.stdout;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2));
}
