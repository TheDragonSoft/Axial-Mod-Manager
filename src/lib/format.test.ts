import { describe, expect, it } from "vitest";
import { compareVersions, formatBytes, formatCount, percent } from "./format";

describe("formatCount", () => {
  it("formats counts less than 1,000 as plain string numbers", () => {
    expect(formatCount(0)).toBe("0");
    expect(formatCount(1)).toBe("1");
    expect(formatCount(42)).toBe("42");
    expect(formatCount(999)).toBe("999");
  });

  it("formats counts between 1,000 and 999,999 in 'k'", () => {
    expect(formatCount(1_000)).toBe("1k");
    expect(formatCount(1_001)).toBe("1k");
    expect(formatCount(1_499)).toBe("1k");
    expect(formatCount(1_500)).toBe("2k");
    expect(formatCount(999_000)).toBe("999k");
    expect(formatCount(999_999)).toBe("1000k");
  });

  it("formats counts 1,000,000 and above in 'M' with 1 decimal place", () => {
    expect(formatCount(1_000_000)).toBe("1.0M");
    expect(formatCount(1_049_000)).toBe("1.0M");
    expect(formatCount(1_050_000)).toBe("1.1M");
    expect(formatCount(1_842_000)).toBe("1.8M");
    expect(formatCount(10_000_000)).toBe("10.0M");
  });

  it("handles negative numbers correctly", () => {
    expect(formatCount(-10)).toBe("-10");
    expect(formatCount(-1_000)).toBe("-1000");
    expect(formatCount(-1_000_000)).toBe("-1000000");
  });

  it("handles floating point inputs", () => {
    expect(formatCount(0.5)).toBe("0.5");
    expect(formatCount(1500.5)).toBe("2k");
  });
});

describe("formatBytes", () => {
  it("formats bytes under 1024 as B", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1023)).toBe("1023 B");
  });

  it("formats bytes from 1024 to 1048575 as KB", () => {
    expect(formatBytes(1024)).toBe("1 KB");
    expect(formatBytes(1536)).toBe("2 KB");
    expect(formatBytes(1048575)).toBe("1024 KB");
  });

  it("formats bytes from 1048576 to 1073741823 as MB", () => {
    expect(formatBytes(1048576)).toBe("1.0 MB");
    expect(formatBytes(1234567)).toBe("1.2 MB");
    expect(formatBytes(1073741823)).toBe("1024.0 MB");
  });

  it("formats bytes 1073741824 and above as GB", () => {
    expect(formatBytes(1073741824)).toBe("1.00 GB");
    expect(formatBytes(2147483648)).toBe("2.00 GB");
  });
});

describe("percent", () => {
  it("calculates percentage correctly and rounds to nearest integer", () => {
    expect(percent(50, 100)).toBe(50);
    expect(percent(1, 3)).toBe(33);
    expect(percent(2, 3)).toBe(67);
    expect(percent(0, 100)).toBe(0);
  });

  it("is safe against divide-by-zero and non-positive total", () => {
    expect(percent(50, 0)).toBe(0);
    expect(percent(50, -10)).toBe(0);
  });

  it("clamps values to maximum 100", () => {
    expect(percent(150, 100)).toBe(100);
  });
});

describe("compareVersions", () => {
  it("returns 0 for equal versions", () => {
    expect(compareVersions("1.0.0", "1.0.0")).toBe(0);
    expect(compareVersions("1.2", "1.2.0")).toBe(0);
  });

  it("returns positive when version A is higher than version B", () => {
    expect(compareVersions("1.2.10", "1.2.9")).toBeGreaterThan(0);
    expect(compareVersions("2.0.0", "1.9.9")).toBeGreaterThan(0);
    expect(compareVersions("1.3", "1.2.9")).toBeGreaterThan(0);
  });

  it("returns negative when version A is lower than version B", () => {
    expect(compareVersions("1.2.9", "1.2.10")).toBeLessThan(0);
    expect(compareVersions("1.0.0", "2.0.0")).toBeLessThan(0);
    expect(compareVersions("1.2", "1.2.1")).toBeLessThan(0);
  });

  it("handles invalid or missing version numbers gracefully", () => {
    expect(compareVersions("invalid", "0.0.0")).toBe(0);
    expect(compareVersions("1.a.2", "1.0.2")).toBe(0);
  });
});
