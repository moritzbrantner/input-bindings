import type {
  BrowserFamily,
  PlatformConflictEnvironment,
  PlatformConflictRule,
  PlatformFamily,
  PlatformConflictSource,
} from "@moritzbrantner/input-bindings";

const VERIFIED_ON = "2026-09-16";

const chromeSource: PlatformConflictSource = {
  id: "google.chrome.shortcuts",
  title: "Google Chrome keyboard shortcuts",
  url: "https://support.google.com/chrome/answer/157179",
  verifiedOn: VERIFIED_ON,
};

const firefoxSource: PlatformConflictSource = {
  id: "mozilla.firefox.shortcuts",
  title: "Firefox keyboard shortcuts",
  url: "https://support.mozilla.org/en-US/kb/keyboard-shortcuts-perform-firefox-tasks-quickly",
  verifiedOn: VERIFIED_ON,
};

const safariSource: PlatformConflictSource = {
  id: "apple.safari.shortcuts",
  title: "Safari keyboard shortcuts and gestures",
  url: "https://support.apple.com/guide/safari/cpsh003/mac",
  verifiedOn: VERIFIED_ON,
};

const windowsSource: PlatformConflictSource = {
  id: "microsoft.windows.shortcuts",
  title: "Keyboard shortcuts in Windows",
  url: "https://support.microsoft.com/en-us/accessibility/windows-keyboard-shortcuts-in-windows",
  verifiedOn: VERIFIED_ON,
};

const macSource: PlatformConflictSource = {
  id: "apple.macos.shortcuts",
  title: "Keyboard shortcuts on your Mac",
  url: "https://support.apple.com/guide/mac-help/keyboard-shortcuts-mchlgtd_kbd01/mac",
  verifiedOn: VERIFIED_ON,
};

const logical = (
  value: string,
  modifiers: { ctrl?: boolean; alt?: boolean; shift?: boolean; meta?: boolean } = {},
) => ({ key: { kind: "logical" as const, value }, modifiers });

const browserRule = (
  id: string,
  title: string,
  sequence: ReturnType<typeof logical>[],
  browsers: BrowserFamily[],
  platforms: PlatformFamily[],
  source: PlatformConflictSource,
  note?: string,
): PlatformConflictRule => ({
  id,
  title,
  kind: "browserShortcut",
  severity: "warning",
  sequence,
  browsers,
  platforms,
  source,
  note,
});

const osRule = (
  id: string,
  title: string,
  sequence: ReturnType<typeof logical>[],
  platforms: PlatformFamily[],
  source: PlatformConflictSource,
  kind: "osShortcut" | "accessibilityShortcut" = "osShortcut",
  note?: string,
): PlatformConflictRule => ({
  id,
  title,
  kind,
  severity: "warning",
  sequence,
  platforms,
  source,
  note,
});

export const DEFAULT_WEB_PLATFORM_CONFLICT_CATALOG: readonly PlatformConflictRule[] = [
  browserRule("chrome.ctrl-t", "Chrome opens a new tab", [logical("t", { ctrl: true })], ["chromium"], ["windows", "linux"], chromeSource),
  browserRule("chrome.ctrl-w", "Chrome closes the current tab", [logical("w", { ctrl: true })], ["chromium"], ["windows", "linux"], chromeSource),
  browserRule("chrome.ctrl-l", "Chrome focuses the address bar", [logical("l", { ctrl: true })], ["chromium"], ["windows", "linux"], chromeSource),
  browserRule("chrome.ctrl-r", "Chrome reloads the page", [logical("r", { ctrl: true })], ["chromium"], ["windows", "linux"], chromeSource),
  browserRule("chrome.ctrl-p", "Chrome opens print", [logical("p", { ctrl: true })], ["chromium"], ["windows", "linux"], chromeSource),
  browserRule("chrome.ctrl-s", "Chrome saves the page", [logical("s", { ctrl: true })], ["chromium"], ["windows", "linux"], chromeSource),
  browserRule("chrome.meta-t", "Chrome opens a new tab", [logical("t", { meta: true })], ["chromium"], ["macos"], chromeSource),
  browserRule("chrome.meta-w", "Chrome closes the current tab", [logical("w", { meta: true })], ["chromium"], ["macos"], chromeSource),
  browserRule("chrome.meta-l", "Chrome focuses the address bar", [logical("l", { meta: true })], ["chromium"], ["macos"], chromeSource),
  browserRule("chrome.meta-r", "Chrome reloads the page", [logical("r", { meta: true })], ["chromium"], ["macos"], chromeSource),
  browserRule("firefox.ctrl-t", "Firefox opens a new tab", [logical("t", { ctrl: true })], ["firefox"], ["windows", "linux"], firefoxSource, "Firefox 147+ can customize many browser shortcuts, so this is an advisory about the default mapping."),
  browserRule("firefox.ctrl-w", "Firefox closes the current tab", [logical("w", { ctrl: true })], ["firefox"], ["windows", "linux"], firefoxSource),
  browserRule("firefox.ctrl-r", "Firefox reloads the page", [logical("r", { ctrl: true })], ["firefox"], ["windows", "linux"], firefoxSource),
  browserRule("firefox.meta-w", "Firefox closes the current tab", [logical("w", { meta: true })], ["firefox"], ["macos"], firefoxSource),
  browserRule("firefox.meta-r", "Firefox reloads the page", [logical("r", { meta: true })], ["firefox"], ["macos"], firefoxSource),
  browserRule("safari.meta-w", "Safari closes the active tab", [logical("w", { meta: true })], ["safari"], ["macos"], safariSource),
  browserRule("safari.shift-meta-t", "Safari reopens the last closed tab", [logical("t", { shift: true, meta: true })], ["safari"], ["macos"], safariSource),

  osRule("windows.alt-f4", "Windows closes the active item or app", [logical("F4", { alt: true })], ["windows"], windowsSource),
  osRule("windows.alt-tab", "Windows switches between open apps", [logical("Tab", { alt: true })], ["windows"], windowsSource),
  osRule("windows.meta-l", "Windows locks the PC", [logical("l", { meta: true })], ["windows"], windowsSource),
  osRule("windows.ctrl-alt-delete", "Windows opens the security screen", [logical("Delete", { ctrl: true, alt: true })], ["windows"], windowsSource),
  osRule("windows.ctrl-space", "Windows can toggle a Chinese IME with Ctrl+Space", [logical("Space", { ctrl: true })], ["windows"], windowsSource, "accessibilityShortcut", "This shortcut depends on the configured input method and is not universal."),

  osRule("macos.meta-q", "macOS quits the current app", [logical("q", { meta: true })], ["macos"], macSource),
  osRule("macos.meta-space", "macOS opens Spotlight", [logical("Space", { meta: true })], ["macos"], macSource),
  osRule("macos.meta-tab", "macOS switches apps", [logical("Tab", { meta: true })], ["macos"], macSource),
  osRule("macos.shift-meta-3", "macOS captures the full screen", [logical("3", { shift: true, meta: true })], ["macos"], macSource),
  osRule("macos.shift-meta-4", "macOS captures a selected area", [logical("4", { shift: true, meta: true })], ["macos"], macSource),
] as const;

export interface NavigatorPlatformLike {
  userAgent?: string;
  platform?: string;
  userAgentData?: { platform?: string };
  keyboard?: { getLayoutMap?: unknown };
}

export function detectPlatformConflictEnvironment(
  navigatorLike: NavigatorPlatformLike = globalThis.navigator as NavigatorPlatformLike,
): PlatformConflictEnvironment {
  const userAgent = navigatorLike.userAgent ?? "";
  const platformHint = navigatorLike.userAgentData?.platform ?? navigatorLike.platform ?? userAgent;
  return {
    platform: detectPlatform(platformHint, userAgent),
    browser: detectBrowser(userAgent),
    layoutMapAvailable: typeof navigatorLike.keyboard?.getLayoutMap === "function",
  };
}

export function detectPlatform(platformHint: string, userAgent = ""): PlatformFamily {
  const value = `${platformHint} ${userAgent}`.toLocaleLowerCase();
  if (/android/u.test(value)) return "android";
  if (/iphone|ipad|ipod/u.test(value)) return "ios";
  if (/win/u.test(value)) return "windows";
  if (/mac/u.test(value)) return "macos";
  if (/linux|x11/u.test(value)) return "linux";
  return "unknown";
}

export function detectBrowser(userAgent: string): BrowserFamily {
  if (/firefox|fxios/iu.test(userAgent)) return "firefox";
  if (/edg|chrome|chromium|crios/iu.test(userAgent)) return "chromium";
  if (/safari/iu.test(userAgent)) return "safari";
  return "unknown";
}
