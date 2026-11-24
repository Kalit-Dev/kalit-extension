import { KeyRound, ShieldCheck } from "lucide-react";
import { useState } from "react";
import type { UseFormReturn } from "react-hook-form";
import { Button } from "@/shared/ui/button";
import { Disclosure } from "@/shared/ui/disclosure";
import { Input } from "@/shared/ui/input";
import type { Values } from "../model/entry-schema";

interface Props {
  form: UseFormReturn<Values>;
  /** Yozuvda TOTP allaqachon o'rnatilgan (tahrirlash). */
  installed: boolean;
  /** "Almashtirish" bosilgan: kiritish maydoni ochiq. */
  replacing: boolean;
  onReplace: () => void;
  /** "O'chirish" belgilanganda almashtirish rejimi yopiladi. */
  onClearToggle: (checked: boolean) => void;
}

/** 2FA kaliti (TOTP): yig'iladigan qator. Urug' qurilmada shifrlanadi va hech qachon qaytarilmaydi. */
export function TotpField({ form, installed, replacing, onReplace, onClearToggle }: Props) {
  const [open, setOpen] = useState(false);
  const { errors } = form.formState;
  const clearTotp = form.watch("clearTotp");
  const typed = form.watch("totp").trim() !== "";
  const showInput = !installed || replacing;

  const summary = clearTotp
    ? "Saqlashda o'chiriladi"
    : typed && showInput
      ? "Yangi kalit kiritildi"
      : installed
        ? "O'rnatilgan"
        : "Qo'shilmagan";

  return (
    <Disclosure
      id="totp"
      icon={KeyRound}
      title="2FA kaliti (TOTP)"
      summary={summary}
      open={open || !!errors.totp}
      onToggle={() => setOpen((o) => !o)}
    >
      <div className="grid gap-2">
        {showInput ? (
          <Input
            id="totp"
            autoComplete="off"
            spellCheck={false}
            placeholder="base32 kalit yoki otpauth://totp/… havolasi"
            aria-label="2FA kaliti"
            aria-invalid={!!errors.totp}
            className="font-mono placeholder:font-sans"
            {...form.register("totp")}
          />
        ) : (
          <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/30 px-3.5 py-2.5">
            <span className="flex items-center gap-2 text-sm text-muted-foreground">
              <ShieldCheck className="size-4 shrink-0" aria-hidden />
              {clearTotp ? "Saqlashda o'chiriladi" : "Qurilmada o'rnatilgan"}
            </span>
            {!clearTotp && (
              <Button type="button" variant="outline" size="sm" onClick={onReplace}>
                Almashtirish
              </Button>
            )}
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          {errors.totp ? (
            <span role="alert" className="text-destructive">
              {errors.totp.message}
            </span>
          ) : (
            "Qurilmada shifrlanadi; kod har safar tugma bilan tasdiqlab olinadi. Faqat SHA1, 6 raqam, 30 soniya."
          )}
        </p>
        {installed && (
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              className="size-3.5 accent-[var(--color-primary)]"
              {...form.register("clearTotp", {
                onChange: (e: { target: { checked: boolean } }) => onClearToggle(e.target.checked),
              })}
            />
            2FA kalitini o'chirish
          </label>
        )}
      </div>
    </Disclosure>
  );
}
