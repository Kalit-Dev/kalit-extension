import { describe, expect, it } from "vitest";
import { BACKUP_STALE_DAYS, isBackupStale } from "./last-backup";

const DAY = 86_400_000;

describe("isBackupStale", () => {
  const now = 1_800_000_000_000;
  it("zaxira hech olinmagan bo'lsa eskirgan", () => expect(isBackupStale(null, now)).toBe(true));
  it("yangi zaxira eskirmagan", () => expect(isBackupStale(now - DAY, now)).toBe(false));
  it("chegaradan oshsa eskirgan", () => expect(isBackupStale(now - (BACKUP_STALE_DAYS + 1) * DAY, now)).toBe(true));
});
