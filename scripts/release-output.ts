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

export function releaseOutput(root: string, requested: string): string {
  const repository = canonicalPath(root);
  const output = canonicalPath(resolve(root, requested));
  const temporary = canonicalPath(tmpdir());
  const releases = join(repository, "release");
  if (
    contains(output, repository) ||
    output === temporary ||
    (!contains(releases, output) && !contains(temporary, output))
  ) {
    throw new Error("Release output must be inside release/ or OS temporary storage, outside source roots.");
  }
  return output;
}
