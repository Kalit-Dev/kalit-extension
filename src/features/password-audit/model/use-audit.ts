import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useDevice } from "@/entities/device";
import type { AuditReport, EntryMeta } from "@/shared/api/device/protocol";
import { describeError } from "@/shared/lib/errors";
import { entriesSignature, flagsById } from "./audit";

/**
 * Parol auditi (v0.10): hisob qurilmada; bu yerga faqat sonlar va yozuv bayroqlari keladi (ochiq parol hech qachon).
 * Natija RAMda, sahifa yopilsa yo'qoladi; yozuvlar to'plami o'zgarsa eskirgan hisoblanib tashlanadi.
 */
export function useAudit(entries: readonly EntryMeta[]) {
  const audit = useDevice((s) => s.auditPasswords);
  const [report, setReport] = useState<AuditReport | null>(null);
  const [running, setRunning] = useState(false);
  const signature = useMemo(() => entriesSignature(entries), [entries]);
  const ranFor = useRef<string | null>(null);
  const triedFor = useRef<string | null>(null); // xato bo'lsa shu to'plam uchun qayta-qayta urinmaymiz

  useEffect(() => {
    if (ranFor.current !== signature) setReport(null);
  }, [signature]);

  const run = useCallback(async () => {
    setRunning(true);
    const sig = signature;
    triedFor.current = sig;
    try {
      const next = await audit();
      ranFor.current = sig;
      setReport(next);
    } catch (e) {
      toast.error(describeError(e));
    } finally {
      setRunning(false);
    }
  }, [audit, signature]);

  // Avtomatik: sahifa ochilganda va yozuvlar to'plami o'zgarganda (tasdiqsiz, qurilma ichida hisoblanadi).
  useEffect(() => {
    if (entries.length > 0 && !running && ranFor.current !== signature && triedFor.current !== signature) void run();
  }, [entries.length, running, signature, run]);

  const flags = useMemo(() => flagsById(report), [report]);
  return { report, running, run, flags };
}
