import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

test("workbench owns light theme tokens and native control colors", () => {
  assert.match(styles, /\.ib-workbench\s*\{[\s\S]*?--ib-surface:\s*#ffffff;[\s\S]*?color-scheme:\s*light;/);
  assert.match(
    styles,
    /\.ib-workbench button,[\s\S]*?\.ib-workbench textarea\s*\{[\s\S]*?background:\s*var\(--ib-surface\);[\s\S]*?color:\s*inherit;/,
  );
});

test("workbench switches the same token set in dark mode", () => {
  const darkMode = styles.slice(styles.lastIndexOf("@media (prefers-color-scheme: dark)"));

  assert.match(darkMode, /\.ib-workbench\s*\{/);
  assert.match(darkMode, /--ib-border:\s*#3d444d;/);
  assert.match(darkMode, /--ib-surface:\s*#0d1117;/);
  assert.match(darkMode, /--ib-subtle:\s*#151b23;/);
  assert.match(darkMode, /color:\s*#f0f6fc;/);
  assert.match(darkMode, /color-scheme:\s*dark;/);
});
