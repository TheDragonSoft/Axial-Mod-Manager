import { describe, expect, it } from "vitest";
import { isNetworkOrHttpError, toAppError } from "./api";
import type { AppError } from "../types";

describe("toAppError", () => {
  it("passes through valid AppError objects unchanged", () => {
    const appError: AppError = {
      kind: "network",
      message: "Network request failed",
    };
    expect(toAppError(appError)).toEqual({
      kind: "network",
      message: "Network request failed",
    });
  });

  it("passes through objects with kind and message properties", () => {
    const customError = {
      kind: "custom_kind",
      message: "A custom error message",
      extraDetail: 123,
    };
    expect(toAppError(customError)).toBe(customError);
  });

  it("handles objects with empty string kind and message", () => {
    const emptyFields = { kind: "", message: "" };
    expect(toAppError(emptyFields)).toEqual({ kind: "", message: "" });
  });

  it("normalizes standard Error instances", () => {
    const err = new Error("Failed to connect");
    expect(toAppError(err)).toEqual({
      kind: "unknown",
      message: "Error: Failed to connect",
    });
  });

  it("normalizes string rejections", () => {
    expect(toAppError("Something went wrong")).toEqual({
      kind: "unknown",
      message: "Something went wrong",
    });
  });

  it("normalizes numeric rejections", () => {
    expect(toAppError(500)).toEqual({
      kind: "unknown",
      message: "500",
    });
  });

  it("normalizes boolean rejections", () => {
    expect(toAppError(false)).toEqual({
      kind: "unknown",
      message: "false",
    });
  });

  it("normalizes null and undefined", () => {
    expect(toAppError(null)).toEqual({
      kind: "unknown",
      message: "null",
    });
    expect(toAppError(undefined)).toEqual({
      kind: "unknown",
      message: "undefined",
    });
  });

  it("normalizes incomplete objects missing kind or message", () => {
    expect(toAppError({ kind: "network" })).toEqual({
      kind: "unknown",
      message: "[object Object]",
    });

    expect(toAppError({ message: "An error occurred" })).toEqual({
      kind: "unknown",
      message: "[object Object]",
    });

    expect(toAppError({})).toEqual({
      kind: "unknown",
      message: "[object Object]",
    });
  });
});

describe("isNetworkOrHttpError", () => {
  it("returns true for network errors", () => {
    expect(
      isNetworkOrHttpError({ kind: "network", message: "Offline" }),
    ).toBe(true);
  });

  it("returns true for http errors", () => {
    expect(
      isNetworkOrHttpError({ kind: "http", message: "500 Internal Error" }),
    ).toBe(true);
  });

  it("returns false for other AppError kinds", () => {
    expect(
      isNetworkOrHttpError({ kind: "unknown", message: "Something failed" }),
    ).toBe(false);
    expect(
      isNetworkOrHttpError({ kind: "not_found", message: "Not found" }),
    ).toBe(false);
  });

  it("returns false for non-AppError objects and primitives", () => {
    expect(isNetworkOrHttpError(new Error("Network error"))).toBe(false);
    expect(isNetworkOrHttpError("network error")).toBe(false);
    expect(isNetworkOrHttpError(null)).toBe(false);
    expect(isNetworkOrHttpError(undefined)).toBe(false);
  });
});
