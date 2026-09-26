import { readdir, readFile, stat } from "node:fs/promises";

const distDirectory = new URL("../dist/", import.meta.url);
const assetsDirectory = new URL("../dist/assets/", import.meta.url);
const files = (await readdir(assetsDirectory)).filter((file) => file.endsWith(".js"));

if (files.length === 0) {
  throw new Error("Pages build produced no JavaScript assets.");
}

const failures = [];
for (const file of files) {
  const source = await readFile(new URL(file, assetsDirectory), "utf8");
  verifyBrowserSource(source, `assets/${file}`, failures);
}

const browserBundleUrl = new URL("input-bindings-browser.js", distDirectory);
const browserBundleStat = await stat(browserBundleUrl).catch(() => null);
if (!browserBundleStat?.isFile()) {
  failures.push("input-bindings-browser.js: stable browser dogfood bundle is missing");
} else {
  const source = await readFile(browserBundleUrl, "utf8");
  verifyBrowserSource(source, "input-bindings-browser.js", failures);
  if (/from\s*["']@moritzbrantner\//u.test(source)) {
    failures.push("input-bindings-browser.js: contains an unresolved workspace package import");
  }

  const browserApi = await import(browserBundleUrl.href);
  for (const exportName of [
    "AnalogInputController",
    "InputRuntimeController",
    "analyzeConflicts",
    "applyProfile",
    "attachGamepadRuntime",
    "attachGyroscopeAnalog",
    "attachKeyboardRuntime",
    "attachMouseRuntime",
    "attachTouchLookAnalog",
    "attachVirtualStickAnalog",
    "keyboardEventToStroke",
    "requestDeviceMotionPermission",
    "validateRegistry",
  ]) {
    if (typeof browserApi[exportName] !== "function") {
      failures.push(`input-bindings-browser.js: missing callable export ${exportName}`);
    }
  }
}

if (failures.length > 0) {
  throw new Error(`Invalid Pages bundle:\n${failures.join("\n")}`);
}

console.log(
  `Verified ${files.length} Pages JavaScript assets and the stable input-bindings browser bundle.`,
);

function verifyBrowserSource(source, label, failures) {
  if (/\bReact\.(?:createElement|Fragment)\b/u.test(source)) {
    failures.push(`${label}: contains classic JSX output that requires an unbound React global`);
  }
  if (/\bfrom\s*["']react(?:\/(?:jsx-runtime|jsx-dev-runtime))?["']/u.test(source)) {
    failures.push(`${label}: contains a bare React import that browsers cannot resolve on GitHub Pages`);
  }
}
