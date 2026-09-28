import type { BrowserFamily, PlatformConflictEnvironment, PlatformConflictRule, PlatformFamily } from "@moritzbrantner/input-bindings";
export declare const DEFAULT_WEB_PLATFORM_CONFLICT_CATALOG: readonly PlatformConflictRule[];
export interface NavigatorPlatformLike {
    userAgent?: string;
    platform?: string;
    userAgentData?: {
        platform?: string;
    };
    keyboard?: {
        getLayoutMap?: unknown;
    };
}
export declare function detectPlatformConflictEnvironment(navigatorLike?: NavigatorPlatformLike): PlatformConflictEnvironment;
export declare function detectPlatform(platformHint: string, userAgent?: string): PlatformFamily;
export declare function detectBrowser(userAgent: string): BrowserFamily;
