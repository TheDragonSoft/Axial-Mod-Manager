import { describe, expect, it } from "vitest";
import { compareVersions, formatBytes, formatCount, percent } from "./format";

describe("percent", () => {
  describe("divide-by-zero safeguard", () => {
    it("returns 0 when total is 0", () => {
      expect(percent(0, 0)).toBe(0);
      expect(percent(50, 0)).toBe(0);
      expect(percent(100, 0)).toBe(0);
    });

    it("returns 0 when total is negative", () => {
      expect(percent(50, -10)).toBe(0);
      expect(percent(0, -1)).toBe(0);
      expect(percent(-50, -100)).toBe(0);
    });
  });

  describe("standard percentage calculations", () => {
    it("calculates accurate percentages", () => {
      expect(percent(0, 100)).toBe(0);
      expect(percent(50, 100)).toBe(50);
      expect(percent(100, 100)).toBe(100);
    });

    it("rounds to the nearest integer", () => {
      expect(percent(1, 3)).toBe(33);
      expect(percent(2, 3)).toBe(67);
      expect(percent(1, 8)).toBe(13); // 12.5 -> 13
    });
  });

  describe("clamping safeguard", () => {
    it("clamps percentages over 100 to 100", () => {
      expect(percent(150, 100)).toBe(100);
      expect(percent(200, 50)).toBe(100);
    });
  });
});

describe("formatCount", () => {
  it("formats counts under 1,000 as plain strings", () => {
    expect(formatCount(0)).toBe("0");
    expect(formatCount(999)).toBe("999");
  });

  it("formats counts between 1,000 and 999,999 with 'k' suffix", () => {
    expect(formatCount(1000)).toBe("1k");
    expect(formatCount(1500)).toBe("2k");
    expect(formatCount(12345)).toBe("12k");
  });

  it("formats counts 1,000,000 and above with 'M' suffix", () => {
    expect(formatCount(1000000)).toBe("1.0M");
    expect(formatCount(1842000)).toBe("1.8M");
    expect(formatCount(2500000)).toBe("2.5M");
  });
});

describe("formatBytes", () => {
  it("formats bytes (< 1024 B)", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1023)).toBe("1023 B");
  });

  it("formats kilobytes (1024 B to < 1 MB)", () => {
    expect(formatBytes(1024)).toBe("1 KB");
    expect(formatBytes(1536)).toBe("2 KB");
    expect(formatBytes(500000)).toBe("488 KB");
  });

  it("formats megabytes (1 MB to < 1 GB)", () => {
    expect(formatBytes(1048576)).toBe("1.0 MB");
    expect(formatBytes(1234567)).toBe("1.2 MB");
  });

  it("formats gigabytes (>= 1 GB)", () => {
    expect(formatBytes(1073741824)).toBe("1.00 GB");
    expect(formatBytes(2147483648)).toBe("2.00 GB");
  });
});

describe("compareVersions", () => {
  it("returns 0 for identical version strings", () => {
    expect(compareVersions("1.0.0", "1.0.0")).toBe(0);
    expect(compareVersions("2.1", "2.1")).toBe(0);
  });

  it("correctly ranks version differences numerically", () => {
    expect(compareVersions("1.2.10", "1.2.9")).toBeGreaterThan(0);
    expect(compareVersions("1.2.9", "1.2.10")).toBeLessThan(0);
    expect(compareVersions("2.0.0", "1.9.9")).toBeGreaterThan(0);
    expect(compareVersions("0.18.0", "1.0.0")).toBeLessThan(0);
  });

  it("handles version strings with different segment counts", () => {
    expect(compareVersions("1.0", "1.0.0")).toBe(0);
    expect(compareVersions("1.0.1", "1.0")).toBeGreaterThan(0);
    expect(compareVersions("1.0", "1.0.1")).toBeLessThan(0);
  });
});
