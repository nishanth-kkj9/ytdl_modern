// Type declarations for web/validate.mjs (plain ESM JS — no build step).
// Used by src/urlRegex.test.ts to import the authoritative backend pattern
// for the frontend/backend regex parity tests.
export declare const YOUTUBE_REGEX: RegExp;
export declare const MAX_URL_LENGTH: number;
export declare function isYouTubeUrl(url: unknown): boolean;
export declare function sanitizeHistoryRecord(body: unknown):
  | { ok: true; record: Record<string, unknown> }
  | { ok: false; error: string };
