import { readFileSync } from "node:fs";

const root = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const packagePaths = [
  "../packages/input-bindings/package.json",
  "../packages/input-bindings-runtime/package.json",
  "../packages/input-bindings-web/package.json",
  "../packages/input-bindings-react/package.json",
];
const packages = packagePaths.map((path) =>
  JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8")),
);
const cargo = readFileSync(new URL("../Cargo.toml", import.meta.url), "utf8");
const cargoVersion = cargo.match(/^version\s*=\s*"([^"]+)"/mu)?.[1];

if (!cargoVersion) {
  throw new Error("Could not read workspace Cargo version.");
}

const expected = root.version;
const versions = new Map([
  [root.name, root.version],
  ["cargo-workspace", cargoVersion],
  ...packages.map((pkg) => [pkg.name, pkg.version]),
]);
const mismatches = [...versions.entries()].filter(([, version]) => version !== expected);
if (mismatches.length > 0) {
  throw new Error(
    `Release versions must match ${expected}: ${mismatches
      .map(([name, version]) => `${name}=${version}`)
      .join(", ")}`,
  );
}

const refName = process.env.GITHUB_REF_NAME;
if (refName?.startsWith("v") && refName.slice(1) !== expected) {
  throw new Error(`Tag ${refName} does not match workspace version ${expected}.`);
}

console.log(`Release version ${expected} is consistent across ${versions.size} artifacts.`);
