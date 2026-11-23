import { afterEach, describe, expect, it, vi } from "vitest";
import { kvGet, kvRemove, kvSet } from "./kv";

afterEach(() => vi.unstubAllGlobals());

describe("kv without chrome.storage (offscreen document)", () => {
  it("relays get/set/remove to the background worker", async () => {
    const sent: unknown[] = [];
    vi.stubGlobal("chrome", {
      runtime: {
        sendMessage: async (m: unknown) => {
          sent.push(m);
          return { ok: true, value: "v" };
        },
      },
    });
    expect(await kvGet("hostPriv")).toBe("v");
    await kvSet("autoConnect", false);
    await kvRemove("deviceKey");
    expect(sent).toEqual([
      { type: "bg:kv", op: "get", key: "hostPriv" },
      { type: "bg:kv", op: "set", key: "autoConnect", value: false },
      { type: "bg:kv", op: "remove", key: "deviceKey" },
    ]);
  });

  it("throws when the background does not answer", async () => {
    vi.stubGlobal("chrome", { runtime: { sendMessage: async () => undefined } });
    await expect(kvGet("hostPriv")).rejects.toThrow("KV_UNAVAILABLE");
  });
});
