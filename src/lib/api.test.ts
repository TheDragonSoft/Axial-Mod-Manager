import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isNetworkOrHttpError, toAppError } from "./api.ts";

describe("toAppError", () => {
  it("passes through valid AppError objects", () => {
    const err = { kind: "network", message: "Connection refused" };
    assert.deepEqual(toAppError(err), err);
  });

  it("converts unknown objects or primitives into unknown AppError", () => {
    assert.deepEqual(toAppError("Some raw string error"), {
      kind: "unknown",
      message: "Some raw string error",
    });
    assert.deepEqual(toAppError(null), {
      kind: "unknown",
      message: "null",
    });
    assert.deepEqual(toAppError(123), {
      kind: "unknown",
      message: "123",
    });
    assert.deepEqual(toAppError({ foo: "bar" }), {
      kind: "unknown",
      message: "[object Object]",
    });
  });
});

describe("isNetworkOrHttpError", () => {
  it("returns true for kind 'network'", () => {
    assert.equal(
      isNetworkOrHttpError({ kind: "network", message: "Timeout" }),
      true,
    );
  });

  it("returns true for kind 'http'", () => {
    assert.equal(
      isNetworkOrHttpError({ kind: "http", message: "500 Internal Server Error" }),
      true,
    );
  });

  it("returns false for non-network AppError kinds", () => {
    assert.equal(
      isNetworkOrHttpError({ kind: "io", message: "Permission denied" }),
      false,
    );
    assert.equal(
      isNetworkOrHttpError({ kind: "unknown", message: "Something failed" }),
      false,
    );
    assert.equal(
      isNetworkOrHttpError({ kind: "parse", message: "Invalid JSON" }),
      false,
    );
  });

  it("returns false for arbitrary objects and primitives", () => {
    assert.equal(isNetworkOrHttpError("network error string"), false);
    assert.equal(isNetworkOrHttpError(null), false);
    assert.equal(isNetworkOrHttpError(undefined), false);
    assert.equal(isNetworkOrHttpError(new Error("network error")), false);
  });
});
