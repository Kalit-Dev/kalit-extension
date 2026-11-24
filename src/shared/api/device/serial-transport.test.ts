import { describe, expect, it } from "vitest";
import { debugLogText } from "./serial-transport";

describe("debugLogText (firmware log lines forwarded to console.debug)", () => {
  it("drops the 'PAIR CODE ####' line: the pairing code must not leak into the extension console", () => {
    expect(debugLogText("PAIR CODE 1234\r\n")).toBe("");
    expect(debugLogText("boot ok\r\nPAIR CODE 0042\r\nready\r\n")).toBe("boot ok\nready");
  });
  it("keeps other debug output", () => {
    expect(debugLogText("  kalit 1.3.0 boot\r\n")).toBe("kalit 1.3.0 boot");
  });
});
