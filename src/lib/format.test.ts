import { describe, expect, it } from "vitest";
import { compareVersions, formatBytes, formatCount, percent } from "./format";

describe("compareVersions", () => {
  it("returns 0 for identical version strings", () => {
    expect(compareVersions("1.2.3", "1.2.3")).toBe(0);
    expect(compareVersions("0.0.1", "0.0.1")).toBe(0);
    expect(compareVersions("1.0", "1.0")).toBe(0);
    expect(compareVersions("2", "2")).toBe(0);
  });

  it("handles numeric segment comparisons (e.g. 1.2.10 vs 1.2.9)", () => {
    expect(compareVersions("1.2.10", "1.2.9")).toBeGreaterThan(0);
    expect(compareVersions("1.2.9", "1.2.10")).toBeLessThan(0);
    expect(compareVersions("2.0.0", "1.99.99")).toBeGreaterThan(0);
    expect(compareVersions("1.10.0", "1.2.0")).toBeGreaterThan(0);
  });

  it("handles differing segment lengths", () => {
    expect(compareVersions("1.2.1", "1.2")).toBeGreaterThan(0);
    expect(compareVersions("1.2", "1.2.1")).toBeLessThan(0);
    expect(compareVersions("1.2.0", "1.2")).toBe(0);
    expect(compareVersions("1.2", "1.2.0")).toBe(0);
    expect(compareVersions("1.0.0.0", "1.0")).toBe(0);
    expect(compareVersions("2", "1.9.9")).toBeGreaterThan(0);
    expect(compareVersions("1", "1.0.1")).toBeLessThan(0);
  });

  it("handles empty strings and edge cases", () => {
    expect(compareVersions("", "")).toBe(0);
    expect(compareVersions("", "1.0.0")).toBeLessThan(0);
    expect(compareVersions("1.0.0", "")).toBeGreaterThan(0);
  });

  it("handles leading zeroes in segments", () => {
    expect(compareVersions("1.02.0", "1.2.0")).toBe(0);
    expect(compareVersions("1.03.0", "1.2.0")).toBeGreaterThan(0);
  });

  it("handles non-numeric or pre-release suffixes gracefully", () => {
    expect(compareVersions("1.2.0-beta", "1.2.0")).toBe(0);
    expect(compareVersions("alpha", "beta")).toBe(0);
  });

  it("correctly sorts mod versions when used with Array.prototype.sort", () => {
    const versions = ["0.18.0", "2.0.0", "1.0.0", "1.1.10", "1.1.2", "1.1.0"];
    const sortedAscending = [...versions].sort(compareVersions);
    expect(sortedAscending).toEqual([
      "0.18.0",
      "1.0.0",
      "1.1.0",
      "1.1.2",
      "1.1.10",
      "2.0.0",
    ]);

    const sortedDescending = [...versions].sort((a, b) => compareVersions(b, a));
    expect(sortedDescending).toEqual([
      "2.0.0",
      "1.1.10",
      "1.1.2",
      "1.1.0",
      "1.0.0",
      "0.18.0",
    ]);
  });
});

describe("formatCount", () => {
  it("formats counts correctly", () => {
    expect(formatCount(0)).toBe("0");
    expect(formatCount(999)).toBe("999");
    expect(formatCount(1000)).toBe("1k");
    expect(formatCount(1500)).toBe("2k");
    expect(formatCount(1842000)).toBe("1.8M");
    expect(formatCount(1000000)).toBe("1.0M");
  });
});

describe("formatBytes", () => {
  it("formats byte sizes correctly", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1024)).toBe("1 KB");
    expect(formatBytes(1234567)).toBe("1.2 MB");
    expect(formatBytes(1073741824)).toBe("1.00 GB");
    expect(formatBytes(2147483648)).toBe("2.00 GB");
  });
});

describe("percent", () => {
  it("calculates percentage correctly and safe against edge cases", () => {
    expect(percent(0, 100)).toBe(0);
    expect(percent(50, 100)).toBe(50);
    expect(percent(1, 3)).toBe(33);
    expect(percent(150, 100)).toBe(100);
    expect(percent(10, 0)).toBe(0);
    expect(percent(10, -5)).toBe(0);
  });
});
