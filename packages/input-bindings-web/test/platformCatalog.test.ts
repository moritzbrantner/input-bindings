import assert from "node:assert/strict";
import { test } from "node:test";

import { analyzePlatformConflicts, type Binding } from "@moritzbrantner/input-bindings";
import {
  DEFAULT_WEB_PLATFORM_CONFLICT_CATALOG,
  detectBrowser,
  detectPlatform,
  detectPlatformConflictEnvironment,
} from "../src/platformCatalog.ts";

test("detects representative desktop environments deterministically", () => {
  assert.equal(detectPlatform("Win32"), "windows");
  assert.equal(detectPlatform("MacIntel"), "macos");
  assert.equal(detectPlatform("Linux x86_64"), "linux");
  assert.equal(detectBrowser("Mozilla/5.0 Chrome/140.0 Safari/537.36"), "chromium");
  assert.equal(detectBrowser("Mozilla/5.0 Firefox/147.0"), "firefox");
  assert.equal(detectBrowser("Mozilla/5.0 Version/19.0 Safari/605.1.15"), "safari");

  assert.deepEqual(
    detectPlatformConflictEnvironment({
      userAgent: "Mozilla/5.0 Firefox/147.0",
      platform: "Win32",
      keyboard: { getLayoutMap: () => undefined },
    }),
    { platform: "windows", browser: "firefox", layoutMapAvailable: true },
  );
});

test("built-in catalog reports documented Chromium shortcut overlap", () => {
  const binding: Binding = {
    id: "tabs.new",
    action: "app.newTab",
    sequence: [
      { key: { kind: "logical", value: "t" }, modifiers: { ctrl: true } },
    ],
  };

  const diagnostics = analyzePlatformConflicts(
    [binding],
    DEFAULT_WEB_PLATFORM_CONFLICT_CATALOG,
    { platform: "windows", browser: "chromium", layoutMapAvailable: true },
  );

  assert.equal(diagnostics.length, 1);
  assert.equal(diagnostics[0].ruleId, "chrome.ctrl-t");
  assert.equal(diagnostics[0].source.id, "google.chrome.shortcuts");
});
