import { describe, expect, it } from "vitest";
import { isEngineRequest } from "./protocol";

describe("isEngineRequest", () => {
  it("accepts known ops and rejects everything else", () => {
    expect(isEngineRequest({ target: "engine", op: "unlock", args: ["x"] })).toBe(true);
    expect(isEngineRequest({ target: "engine", op: "revealSecret", args: ["id"] })).toBe(true);
    expect(isEngineRequest({ target: "engine", op: "importBegin", args: [3] })).toBe(true);
    expect(isEngineRequest({ target: "engine", op: "importEnd", args: [] })).toBe(true);
    expect(isEngineRequest({ target: "engine", op: "rm -rf", args: [] })).toBe(false);
    expect(isEngineRequest({ target: "engine", op: "lock" })).toBe(false);
    expect(isEngineRequest({ type: "kalit:matches" })).toBe(false);
    expect(isEngineRequest(null)).toBe(false);
  });
});
