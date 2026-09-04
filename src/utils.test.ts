import { describe, it, expect } from "vitest";
import { fmtSize, fmtDuration, isSafeThumbnail } from "./utils";

describe("fmtSize", () => {
  it("formats bytes to the closest unit", () => {
    expect(fmtSize(0)).toBe("0 B");
    expect(fmtSize(500)).toBe("500 B");
    expect(fmtSize(1024)).toBe("1.0 KB");
    expect(fmtSize(5 * 1024 * 1024)).toBe("5.0 MB");
    expect(fmtSize(3 * 1024 * 1024 * 1024)).toBe("3.0 GB");
  });

  it("treats negative input as zero", () => {
    expect(fmtSize(-1)).toBe("0 B");
  });
});

describe("fmtDuration", () => {
  it("formats minutes and seconds", () => {
    expect(fmtDuration(75)).toBe("1:15");
    expect(fmtDuration(65)).toBe("1:05");
  });

  it("formats hours", () => {
    expect(fmtDuration(3600 + 600 + 9)).toBe("1:10:09");
  });

  it("rounds the total first — fractional seconds never yield :60 (P2-31)", () => {
    // Old bug: floor(119.9/60)=1 min, round(59.9)=60 s → "1:60".
    expect(fmtDuration(119.9)).toBe("2:00");
    expect(fmtDuration(59.6)).toBe("1:00");
    expect(fmtDuration(59.4)).toBe("0:59");
  });
});

describe("isSafeThumbnail", () => {
  it("accepts YouTube CDN hosts", () => {
    expect(isSafeThumbnail("https://i.ytimg.com/vi/abc/maxresdefault.jpg")).toBe(true);
    expect(isSafeThumbnail("https://lh3.googleusercontent.com/foo")).toBe(true);
    expect(isSafeThumbnail("https://www.youtube.com/x")).toBe(true);
  });

  it("rejects internal / untrusted hosts", () => {
    expect(isSafeThumbnail("http://127.0.0.1:8000/evil.jpg")).toBe(false);
    expect(isSafeThumbnail("http://169.254.169.254/latest/meta-data")).toBe(false);
    expect(isSafeThumbnail("https://evil.com/ytimg.com")).toBe(false);
    expect(isSafeThumbnail("not a url")).toBe(false);
  });

  // SSRF pinning: the host suffix match uses LEADING-DOT suffixes, so both
  // classic spoof vectors must fail. These pin the guard against the
  // "endsWith bypass" claim from the external analysis round.
  it("rejects suffix-spoofing hostnames", () => {
    // Dotless suffix spoof: host ends with "ytimg.com" but is NOT a
    // ytimg.com subdomain.
    expect(isSafeThumbnail("https://evilytimg.com/vi/abc.jpg")).toBe(false);
    // Subdomain-of-subdomain spoof: attacker-controlled parent domain.
    expect(isSafeThumbnail("https://evil.ytimg.com.attacker.com/vi/abc.jpg")).toBe(false);
    expect(isSafeThumbnail("https://ytimg.com.evil.com/x.jpg")).toBe(false);
    // Sibling lookalikes.
    expect(isSafeThumbnail("https://notytimg.com/x.jpg")).toBe(false);
    expect(isSafeThumbnail("https://googleusercontent.com.evil.com/x.jpg")).toBe(false);
  });
});