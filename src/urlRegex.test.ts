import { describe, expect, it } from "vitest";
// Frontend copy lives in src/components/urlRegex.ts so tests import the real
// pattern instead of a third copy.
import { YOUTUBE_REGEX as FRONTEND_REGEX } from "./components/urlRegex";
import { isYouTubeUrl } from "../web/validate.mjs";

const ACCEPT = [
  "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  "https://youtube.com/watch?v=dQw4w9WgXcQ&t=30s",
  "http://youtube.com/watch?v=dQw4w9WgXcQ",
  "https://youtu.be/dQw4w9WgXcQ",
  "https://www.youtube.com/shorts/dQw4w9WgXcQ",
  "https://www.youtube.com/embed/dQw4w9WgXcQ",
  "https://www.youtube.com/v/dQw4w9WgXcQ",
  "youtube.com/watch?v=dQw4w9WgXcQ",
  "https://www.youtube.com/watch?app=desktop&v=dQw4w9WgXcQ",
];

const REJECT = [
  "not-a-url",
  "",
  "https://evil.com/https://youtu.be/dQw4w9WgXcQ", // the bug this test pins
  "https://vimeo.com/123456789012",
  "https://www.youtube.com/watch?v=shortid12", // 10 chars
  "https://www.youtube.com/watch?v=waytoolongid123", // 16 chars
  "https://youtu.be/dQw4w9WgXcQextra", // trailing ID chars
  "javascript:alert(1)//youtu.be/dQw4w9WgXcQ",
];

describe("YouTube URL regex parity (frontend vs backend)", () => {
  it("accepts the same URLs", () => {
    for (const url of ACCEPT) {
      expect(FRONTEND_REGEX.test(url), `frontend should accept: ${url}`).toBe(true);
      expect(isYouTubeUrl(url), `backend should accept: ${url}`).toBe(true);
    }
  });

  it("rejects the same URLs", () => {
    for (const url of REJECT) {
      expect(FRONTEND_REGEX.test(url), `frontend should reject: ${url}`).toBe(false);
      expect(isYouTubeUrl(url), `backend should reject: ${url}`).toBe(false);
    }
  });

  it("frontend regex is anchored at start (no embedded-URL bypass)", () => {
    expect(FRONTEND_REGEX.source.startsWith("^")).toBe(true);
  });
});
