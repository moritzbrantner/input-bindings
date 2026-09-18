import {
  copyFileSync,
  existsSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = fileURLToPath(new URL("../", import.meta.url));
const tsc = resolve(root, "node_modules/typescript/bin/tsc");
const packages = [
  "packages/input-bindings",
  "packages/input-bindings-runtime",
  "packages/input-bindings-web",
  "packages/input-bindings-react",
];

if (!existsSync(tsc)) {
  throw new Error("TypeScript is not installed. Run npm ci first.");
}

for (const packagePath of packages) {
  const absolute = resolve(root, packagePath);
  const dist = resolve(absolute, "dist");
  rmSync(dist, { recursive: true, force: true });
  run(process.execPath, [tsc, "-p", resolve(absolute, "tsconfig.json")]);
  rewriteDeclarationSpecifiers(dist);
}

const reactRoot = resolve(root, "packages/input-bindings-react");
for (const css of ["styles.css", "platform-advisories.css", "workbench.css"]) {
  copyFileSync(resolve(reactRoot, "src", css), resolve(reactRoot, "dist", css));
}

for (const packagePath of packages) {
  const absolute = resolve(root, packagePath);
  verifyExports(absolute);
  verifyNoSourceExtensions(resolve(absolute, "dist"));
  verifyNoStorybookFiles(resolve(absolute, "dist"));
}

console.log(`Built ${packages.length} compiled npm workspaces.`);

function rewriteDeclarationSpecifiers(directory) {
  for (const path of walk(directory)) {
    if (!path.endsWith(".d.ts")) continue;
    const content = readFileSync(path, "utf8");
    const rewritten = content
      .replace(
        /(\bfrom\s+)(["'])(\.{1,2}\/[^"']+?)\.(?:ts|tsx)\2/gu,
        "$1$2$3.js$2",
      )
      .replace(
        /(\bimport\s*\(\s*)(["'])(\.{1,2}\/[^"']+?)\.(?:ts|tsx)\2/gu,
        "$1$2$3.js$2",
      )
      .replace(
        /(\bimport\s+)(["'])(\.{1,2}\/[^"']+?)\.(?:ts|tsx)\2/gu,
        "$1$2$3.js$2",
      );
    if (rewritten !== content) writeFileSync(path, rewritten);
  }
}

function verifyExports(packageRoot) {
  const manifest = JSON.parse(readFileSync(resolve(packageRoot, "package.json"), "utf8"));
  const targets = new Set();
  collectExportTargets(manifest.exports, targets);
  if (typeof manifest.types === "string") targets.add(manifest.types);

  for (const target of [...targets].sort()) {
    if (!target.startsWith("./dist/")) {
      throw new Error(`${manifest.name} export still points outside dist: ${target}`);
    }
    if (!existsSync(resolve(packageRoot, target))) {
      throw new Error(`${manifest.name} export target is missing: ${target}`);
    }
  }
}

function collectExportTargets(value, targets) {
  if (typeof value === "string") {
    targets.add(value);
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const nested of Object.values(value)) collectExportTargets(nested, targets);
}

function verifyNoStorybookFiles(directory) {
  for (const path of walk(directory)) {
    if (/\.stories\.(?:js|d\.ts)$/u.test(path)) {
      throw new Error(`Published package contains a Storybook story: ${path}`);
    }
  }
}

function verifyNoSourceExtensions(directory) {
  for (const path of walk(directory)) {
    if (![".js", ".d.ts"].some((suffix) => path.endsWith(suffix))) continue;
    const content = readFileSync(path, "utf8");
    if (/\.(?:ts|tsx)(?:["'])/u.test(content)) {
      throw new Error(`Emitted package still references a TypeScript source extension: ${path}`);
    }
  }
}

function* walk(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else if (entry.isFile()) yield path;
  }
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with exit ${result.status}.`);
  }
}
