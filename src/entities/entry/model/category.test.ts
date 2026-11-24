import { describe, expect, it } from "vitest";
import type { EntryMeta } from "@/shared/api/device/protocol";
import { categoryCounts, groupByKind, matchesCategory } from "./category";

const e = (id: string, extra: Partial<EntryMeta> = {}): EntryMeta => ({
  id,
  kind: "web",
  site: `${id}.com`,
  username: "u",
  updatedAt: 0,
  ...extra,
});

const entries = [
  e("a"),
  e("b", { hasTotp: true }),
  e("c", { hasNote: true, hasTotp: true }),
  e("d", { kind: "secret", site: "", title: "Wi-Fi" }),
  e("f", { kind: "secret", site: "", title: "Server", hasNote: true }),
];

describe("entry categories", () => {
  it("counts kinds and extras; extras may overlap kinds", () => {
    expect(categoryCounts(entries)).toEqual({ all: 5, web: 3, secret: 2, totp: 2, note: 2 });
    expect(categoryCounts([])).toEqual({ all: 0, web: 0, secret: 0, totp: 0, note: 0 });
  });

  it("filters by category", () => {
    const ids = (c: Parameters<typeof matchesCategory>[1]) => entries.filter((x) => matchesCategory(x, c)).map((x) => x.id);
    expect(ids("all")).toEqual(["a", "b", "c", "d", "f"]);
    expect(ids("web")).toEqual(["a", "b", "c"]);
    expect(ids("secret")).toEqual(["d", "f"]);
    expect(ids("totp")).toEqual(["b", "c"]);
    expect(ids("note")).toEqual(["c", "f"]);
  });

  it("groups by kind and drops empty groups", () => {
    expect(groupByKind(entries).map((g) => [g.kind, g.items.length])).toEqual([
      ["web", 3],
      ["secret", 2],
    ]);
    expect(groupByKind(entries.filter((x) => x.kind === "secret")).map((g) => g.kind)).toEqual(["secret"]);
    expect(groupByKind([])).toEqual([]);
  });
});
