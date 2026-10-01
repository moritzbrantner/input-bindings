import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = resolve(root, "target/npm");
const packageRoots = [
  "packages/input-bindings",
  "packages/input-bindings-runtime",
  "packages/input-bindings-web",
  "packages/input-bindings-react",
];
const sharedFiles = ["README.md", "LICENSE-MIT", "LICENSE-APACHE"];

rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });

const artifacts = [];
for (const packagePath of packageRoots) {
  const packageRoot = resolve(root, packagePath);
  const manifest = JSON.parse(readFileSync(resolve(packageRoot, "package.json"), "utf8"));
  const temporaryFiles: string[] = [];

  try {
    for (const filename of sharedFiles) {
      const destination = resolve(packageRoot, filename);
      if (!existsSync(destination)) {
        copyFileSync(resolve(root, filename), destination);
        temporaryFiles.push(destination);
      }
    }

    const result = spawnSync(
      "bun",
      ["pm", "pack", "--quiet", "--ignore-scripts", "--destination", output],
      {
        cwd: packageRoot,
        timeout: 120_000,
        encoding: "utf8",
        shell: process.platform === "win32",
      },
    );
    if (result.error) {
      throw result.error;
    }
    if (result.status !== 0) {
      throw new Error(
        `bun pm pack failed for ${manifest.name}:\n${result.stdout ?? ""}\n${result.stderr ?? ""}`,
      );
    }

    const filename = basename(result.stdout.trim());
    if (!filename) {
      throw new Error(`No tarball filename for ${manifest.name}.`);
    }
    const tarball = resolve(output, filename);
    const listing = spawnSync("tar", ["-tzf", tarball], { encoding: "utf8", timeout: 120_000 });
    if (listing.error) {
      throw listing.error;
    }
    if (listing.status !== 0) {
      throw new Error(`Cannot inspect ${filename}: ${listing.stderr}`);
    }
    const packedFiles = new Set(
      listing.stdout
        .trim()
        .split("\n")
        .filter((path) => !path.endsWith("/"))
        .map((path) => path.replace(/^package\//u, "")),
    );
    for (const required of ["package.json", ...sharedFiles]) {
      if (!packedFiles.has(required)) {
        throw new Error(`${manifest.name} package is missing ${required}.`);
      }
    }
    if ([...packedFiles].some((path) => path === "src" || path.startsWith("src/"))) {
      throw new Error(`${manifest.name} package leaked source files.`);
    }
    if (![...packedFiles].some((path) => path.startsWith("dist/") && path.endsWith(".js"))) {
      throw new Error(`${manifest.name} package has no compiled JavaScript.`);
    }
    if (![...packedFiles].some((path) => path.startsWith("dist/") && path.endsWith(".d.ts"))) {
      throw new Error(`${manifest.name} package has no declarations.`);
    }

    artifacts.push({
      name: manifest.name,
      version: manifest.version,
      file: filename,
      bytes: statSync(tarball).size,
      sha256: sha256(tarball),
      files: [...packedFiles].sort((left, right) => left.localeCompare(right, "en")),
    });
  } finally {
    for (const path of temporaryFiles) {
      rmSync(path, { force: true });
    }
  }
}

artifacts.sort((left, right) => left.name.localeCompare(right.name, "en"));
writeFileSync(
  resolve(output, "manifest.json"),
  `${JSON.stringify({ schemaVersion: 1, artifacts }, null, 2)}\n`,
);
console.log(`Packed and verified ${artifacts.length} private npm workspaces in ${output}`);

function sha256(path: string) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}
