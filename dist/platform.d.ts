import { type Binding, type InputStroke } from "./index.js";
export type PlatformFamily = "windows" | "macos" | "linux" | "android" | "ios" | "unknown";
export type BrowserFamily = "chromium" | "firefox" | "safari" | "unknown";
export type PlatformConflictSeverity = "info" | "warning";
export type PlatformConflictKind = "browserShortcut" | "osShortcut" | "accessibilityShortcut" | "layoutSensitive" | "altGraphSensitive" | "imeSensitive";
export type PlatformConflictSource = {
    id: string;
    title: string;
    url: string;
    verifiedOn?: string;
};
export type PlatformConflictRule = {
    id: string;
    title: string;
    kind: Exclude<PlatformConflictKind, "layoutSensitive" | "altGraphSensitive" | "imeSensitive">;
    severity: PlatformConflictSeverity;
    sequence: InputStroke[];
    platforms?: PlatformFamily[];
    browsers?: BrowserFamily[];
    source: PlatformConflictSource;
    note?: string | undefined;
};
export type PlatformConflictEnvironment = {
    platform: PlatformFamily;
    browser: BrowserFamily;
    layoutMapAvailable?: boolean;
};
export type PlatformConflictDiagnostic = {
    bindingId: string;
    action: string;
    kind: PlatformConflictKind;
    severity: PlatformConflictSeverity;
    title: string;
    source: PlatformConflictSource;
    ruleId?: string;
    note?: string | undefined;
};
export declare function analyzePlatformConflicts(bindings: readonly Binding[], catalog: readonly PlatformConflictRule[], environment: PlatformConflictEnvironment): PlatformConflictDiagnostic[];
