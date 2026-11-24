import { Loader2, NotebookPen, ShieldCheck } from "lucide-react";
import { useState } from "react";
import type { UseFormReturn } from "react-hook-form";
import { toast } from "sonner";
import { revealNote } from "@/features/reveal-credential";
import { NOTE_MAX_BYTES, type EntryMeta } from "@/shared/api/device/protocol";
import { describeError } from "@/shared/lib/errors";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";
import { Disclosure } from "@/shared/ui/disclosure";
import { Textarea } from "@/shared/ui/textarea";
import { noteBytes, type Values } from "../model/entry-schema";

interface Props {
  form: UseFormReturn<Values>;
  /** Tahrirlanayotgan yozuv (yangi yozuvda undefined). */
  entry?: EntryMeta;
}

/** Maxfiy eslatma: yig'iladigan qator. Tahrirlashda joriy matn qurilmada qoladi; xohlasa tugma bilan yuklanadi. */
export function NoteField({ form, entry }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const { errors } = form.formState;
  const note = form.watch("note");
  const clearNote = form.watch("clearNote");
  const hasStored = !!entry?.hasNote;
  const bytes = noteBytes(note);

  const loadNote = async () => {
    if (!entry) return;
    setLoading(true);
    try {
      form.setValue("note", await revealNote(entry), { shouldValidate: true });
      form.setValue("clearNote", false);
    } catch (e) {
      toast.error(describeError(e));
    } finally {
      setLoading(false);
    }
  };

  const summary = clearNote
    ? "Saqlashda o'chiriladi"
    : bytes > 0
      ? `${bytes} bayt kiritildi`
      : hasStored
        ? "Qurilmada saqlangan"
        : "Qo'shilmagan";

  return (
    <Disclosure
      dense
      id="note"
      icon={NotebookPen}
      title="Maxfiy eslatma"
      summary={summary}
      open={open || !!errors.note}
      onToggle={() => setOpen((o) => !o)}
    >
      <div className="grid gap-2">
        {hasStored && (
          <div className="flex justify-end">
            <Button type="button" variant="outline" size="sm" disabled={loading || clearNote} onClick={() => void loadNote()}>
              {loading ? <Loader2 className="animate-spin" /> : <ShieldCheck />} Qurilmadan yuklash
            </Button>
          </div>
        )}
        <Textarea
          id="note"
          rows={4}
          readOnly={clearNote} // disabled bo'lsa react-hook-form qiymatni undefined qiladi
          className={cn(clearNote && "opacity-50")}
          autoComplete="off"
          spellCheck={false}
          placeholder="Tiklash kodlari, PIN, xavfsizlik savollari…"
          aria-label="Maxfiy eslatma"
          aria-invalid={!!errors.note}
          {...form.register("note")}
        />
        <div className="flex items-start justify-between gap-3 text-xs text-muted-foreground">
          <span>
            {errors.note ? (
              <span role="alert" className="text-destructive">
                {errors.note.message}
              </span>
            ) : hasStored ? (
              "Bo'sh qoldirsangiz, eslatma o'zgarmaydi. Qurilmada shifrlanadi."
            ) : (
              "Qurilmada shifrlanadi; faqat tugma bilan tasdiqlab ko'riladi."
            )}
          </span>
          <span className={cn("shrink-0 tabular-nums", bytes > NOTE_MAX_BYTES && "text-destructive")}>
            {bytes} / {NOTE_MAX_BYTES}
          </span>
        </div>
        {hasStored && (
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" className="size-3.5 accent-[var(--color-primary)]" {...form.register("clearNote")} />
            Eslatmani o'chirish
          </label>
        )}
      </div>
    </Disclosure>
  );
}
