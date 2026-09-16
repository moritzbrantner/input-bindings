import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const args = process.argv.slice(2);
const requestedVersion = argumentValue("--version");
const outputDirectory = resolve(root, argumentValue("--output") ?? "release");

const packageManifests = [
  "packages/input-bindings/package.json",
  "packages/input-bindings-runtime/package.json",
  "packages/input-bindings-web/package.json",
  "packages/input-bindings-react/package.json",
  "packages/input-bindings-demo/package.json",
];
const packageVersions = packageManifests.map((path) => {
  const manifest = JSON.parse(readFileSync(resolve(root, path), "utf8"));
  return { path, version: manifest.version };
});
const cargoVersion = workspaceCargoVersion();
const releaseVersion = requestedVersion ?? packageVersions[0]?.version;

if (!releaseVersion || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u.test(releaseVersion)) {
  throw new Error(`Invalid release version: ${releaseVersion ?? "<missing>"}`);
}

for (const item of packageVersions) {
  if (item.version !== releaseVersion) {
    throw new Error(
      `Version mismatch: ${item.path} is ${item.version}, expected ${releaseVersion}.`,
    );
  }
}
if (cargoVersion !== releaseVersion) {
  throw new Error(
    `Version mismatch: Cargo workspace is ${cargoVersion}, expected ${releaseVersion}.`,
  );
}

run("npm", ["run", "build:pages"]);
run("cargo", ["package", "--locked", "-p", "input-bindings-core"]);

const browserSource = resolve(
  root,
  "packages/input-bindings-demo/dist/input-bindings-browser.js",
);
const crateSource = resolve(
  root,
  `target/package/input-bindings-core-${releaseVersion}.crate`,
);
const sources = [
  {
    source: browserSource,
    filename: `input-bindings-browser-${releaseVersion}.js`,
    kind: "browser-esm",
  },
  {
    source: crateSource,
    filename: `input-bindings-core-${releaseVersion}.crate`,
    kind: "rust-crate",
  },
  { source: resolve(root, "LICENSE-MIT"), filename: "LICENSE-MIT", kind: "license" },
  {
    source: resolve(root, "LICENSE-APACHE"),
    filename: "LICENSE-APACHE",
    kind: "license",
  },
  { source: resolve(root, "README.md"), filename: "README.md", kind: "documentation" },
];

rmSync(outputDirectory, { recursive: true, force: true });
mkdirSync(outputDirectory, { recursive: true });

const artifacts = sources
  .map((item) => {
    const destination = resolve(outputDirectory, item.filename);
    copyFileSync(item.source, destination);
    return {
      file: item.filename,
      kind: item.kind,
      bytes: statSync(destination).size,
      sha256: sha256(destination),
    };
  })
  .sort((left, right) => left.file.localeCompare(right.file, "en"));

const manifestPath = resolve(outputDirectory, "manifest.json");
writeFileSync(
  manifestPath,
  `${JSON.stringify(
    {
      schemaVersion: 1,
      name: "input-bindings",
      version: releaseVersion,
      license: "MIT OR Apache-2.0",
      browser: {
        moduleFormat: "esm",
        entry: `input-bindings-browser-${releaseVersion}.js`,
      },
      rust: {
        crate: "input-bindings-core",
        package: `input-bindings-core-${releaseVersion}.crate`,
      },
      artifacts,
    },
    null,
    2,
  )}\n`,
);

const checksumFiles = [...artifacts.map((artifact) => artifact.file), "manifest.json"].sort(
  (left, right) => left.localeCompare(right, "en"),
);
writeFileSync(
  resolve(outputDirectory, "SHA256SUMS"),
  checksumFiles
    .map((filename) => `${sha256(resolve(outputDirectory, filename))}  ${filename}`)
    .join("\n") + "\n",
);

console.log(`Built input-bindings ${releaseVersion} artifacts in ${outputDirectory}`);

function argumentValue(name) {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${name} requires a value.`);
  }
  return value;
}

function workspaceCargoVersion() {
  const cargoToml = readFileSync(resolve(root, "Cargo.toml"), "utf8");
  const section = cargoToml.match(/\[workspace\.package\]([\s\S]*?)(?:\n\[|$)/u)?.[1];
  const version = section?.match(/^version\s*=\s*"([^"]+)"/mu)?.[1];
  if (!version) throw new Error("Cargo workspace version is missing.");
  return version;
}

function run(command, commandArgs) {
  const result = spawnSync(command, commandArgs, {
    cwd: root,
    encoding: "utf8",
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${commandArgs.join(" ")} failed with exit ${result.status}.`);
  }
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}
