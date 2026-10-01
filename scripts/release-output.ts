import { existsSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";

function canonicalPath(path: string): string {
  const absolute = resolve(path);
  if (existsSync(absolute)) {
    return realpathSync(absolute);
  }
  return join(canonicalPath(dirname(absolute)), basename(absolute));
}

function contains(parent: string, child: string): boolean {
  const difference = relative(parent, child);
  return difference === "" || (!difference.startsWith("..") && !isAbsolute(difference));
}

export function releaseOutput(root: string, requested: string, runnerTemporary?: string): string {
  const repository = canonicalPath(root);
  const output = canonicalPath(resolve(root, requested));
  const temporaryRoots = [canonicalPath(tmpdir())];
  if (runnerTemporary !== undefined) {
    const runnerRoot = canonicalPath(runnerTemporary);
    if (!contains(repository, runnerRoot) && !contains(runnerRoot, repository)) {
      temporaryRoots.push(runnerRoot);
    }
  }
  const releases = join(repository, "release");
  if (
    contains(output, repository) ||
    temporaryRoots.includes(output) ||
    (!contains(releases, output) &&
      !temporaryRoots.some((temporary) => contains(temporary, output)))
  ) {
    throw new Error(
      "Release output must be inside release/ or declared temporary storage, outside source roots.",
    );
  }
  return output;
}
