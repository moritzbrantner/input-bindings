import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const paths = execFileSync(
  "git",
  ["diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z"],
  { cwd: root, encoding: "utf8", timeout: 10_000 },
)
  .split("\0")
  .filter(Boolean);

if (paths.length > 0) {
  const scratch = mkdtempSync(join(tmpdir(), "input-bindings-staged-secrets-"));
  try {
    const stagedFiles = paths.map((path, index) => {
      const destination = join(scratch, `${index}${extname(path)}`);
      writeFileSync(
        destination,
        execFileSync("git", ["show", `:${path}`], {
          cwd: root,
          timeout: 10_000,
          maxBuffer: 16 * 1024 * 1024,
        }),
        { mode: 0o600 },
      );
      return destination;
    });
    const result = spawnSync(
      "bunx",
      ["--no-install", "secretlint", "--no-glob", "--no-gitignore", ...stagedFiles],
      { cwd: root, stdio: "inherit", timeout: 60_000 },
    );
    if (result.error) {
      throw result.error;
    }
    process.exitCode = result.status ?? 1;
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}
