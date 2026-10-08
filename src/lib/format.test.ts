import { compareVersions, formatBytes, formatCount, percent } from "./format";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

function runTests() {
  // basic version comparison
  assert(compareVersions("1.2.10", "1.2.9") > 0, "1.2.10 > 1.2.9");
  assert(compareVersions("1.2.9", "1.2.10") < 0, "1.2.9 < 1.2.10");
  assert(compareVersions("1.2.3", "1.2.3") === 0, "1.2.3 === 1.2.3");

  // segment length mismatch
  assert(compareVersions("1.2", "1.2.1") < 0, "1.2 < 1.2.1");
  assert(compareVersions("1.2.1", "1.2") > 0, "1.2.1 > 1.2");
  assert(compareVersions("1.2.0", "1.2") === 0, "1.2.0 === 1.2");

  // multi-digit segments
  assert(compareVersions("2.0.15", "2.0.2") > 0, "2.0.15 > 2.0.2");
  assert(compareVersions("100.0.0", "99.99.99") > 0, "100.0.0 > 99.99.99");

  // formatCount
  assert(formatCount(500) === "500", "500 formatCount");
  assert(formatCount(1500) === "2k", "1500 formatCount");
  assert(formatCount(1842000) === "1.8M", "1842000 formatCount");

  // formatBytes
  assert(formatBytes(500) === "500 B", "500 B formatBytes");
  assert(formatBytes(2048) === "2 KB", "2 KB formatBytes");
  assert(formatBytes(2097152) === "2.0 MB", "2.0 MB formatBytes");

  // percent
  assert(percent(50, 100) === 50, "50% percent");
  assert(percent(1, 0) === 0, "0 percent when total 0");
  assert(percent(150, 100) === 100, "100% max percent");

  console.log("All format tests passed successfully.");
}

runTests();
