import { Cpu, KeyRound, PenLine } from "lucide-react";
import type { UseFormReturn } from "react-hook-form";
import { Field } from "@/shared/ui/field";
import { PasswordInput } from "@/shared/ui/password-input";
import { PasswordStrengthMeter } from "@/shared/ui/password-strength-meter";
import { Segmented } from "@/shared/ui/segmented";
import { Section } from "@/shared/ui/section";
import type { GeneratorSettings } from "../model/generator-options";
import type { Values } from "../model/entry-schema";
import { GeneratorOptions } from "./generator-options";

const MODES = [
  { value: "generate", label: "Qurilmada yaratish", icon: Cpu },
  { value: "manual", label: "Qo'lda kiritish", icon: PenLine },
] as const;

interface Props {
  form: UseFormReturn<Values>;
  editing: boolean;
  gen: GeneratorSettings;
  onGen: (next: GeneratorSettings) => void;
}

/** Parol bo'limi: yangi yozuvda qurilmada yaratish yoki qo'lda kiritish; tahrirlashda faqat yangi parol (ixtiyoriy). */
export function PasswordSection({ form, editing, gen, onGen }: Props) {
  const mode = form.watch("mode");
  const password = form.watch("password");
  const { errors } = form.formState;
  const generating = mode === "generate" && !editing;

  return (
    <Section
      icon={KeyRound}
      title="Parol"
      description={
        editing
          ? "Bo'sh qoldirsangiz, parol o'zgarmaydi."
          : generating
            ? "Parol qurilmaning o'zida yaratiladi."
            : "Parolni o'zingiz kiriting; u qurilmada shifrlanib saqlanadi."
      }
      action={
        !editing && (
          <Segmented
            compact
            label="Parol manbai"
            value={mode}
            options={MODES}
            onChange={(v) => form.setValue("mode", v)}
          />
        )
      }
    >
      {generating ? (
        <GeneratorOptions value={gen} onChange={onGen} />
      ) : (
        <div className="grid gap-3">
          <Field htmlFor="password" label={editing ? "Yangi parol" : "Parol"} error={errors.password?.message}>
            <PasswordInput
              id="password"
              placeholder={editing ? "Yangi parol (ixtiyoriy)" : "Parolni kiriting"}
              aria-invalid={!!errors.password}
              {...form.register("password")}
            />
          </Field>
          {password && <PasswordStrengthMeter password={password} />}
        </div>
      )}
    </Section>
  );
}
