import { Cpu, PenLine } from "lucide-react";
import type { UseFormReturn } from "react-hook-form";
import { Disclosure } from "@/shared/ui/disclosure";
import { Field } from "@/shared/ui/field";
import { PasswordInput } from "@/shared/ui/password-input";
import { PasswordStrengthMeter } from "@/shared/ui/password-strength-meter";
import { Segmented } from "@/shared/ui/segmented";
import { useState } from "react";
import { describeGenerator, type GeneratorSettings } from "../model/generator-options";
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

/** Parol: yangi yozuvda standart — qurilmada yaratish (sozlamalar yig'ilgan); yoki qo'lda. Tahrirlashda faqat yangi parol (ixtiyoriy). */
export function PasswordSection({ form, editing, gen, onGen }: Props) {
  const mode = form.watch("mode");
  const password = form.watch("password");
  const { errors } = form.formState;
  const generating = mode === "generate" && !editing;
  const [open, setOpen] = useState(false);

  return (
    <div className="grid gap-3">
      {!editing && (
        <Segmented fill compact label="Parol manbai" value={mode} options={MODES} onChange={(v) => form.setValue("mode", v)} />
      )}
      {generating ? (
        <div className="overflow-hidden rounded-xl border">
          <Disclosure
            dense
            id="gen"
            icon={Cpu}
            title="Parol qurilmada yaratiladi"
            summary={`${describeGenerator(gen)} · sozlash`}
            open={open}
            onToggle={() => setOpen((o) => !o)}
          >
            <GeneratorOptions value={gen} onChange={onGen} />
          </Disclosure>
        </div>
      ) : (
        <div className="grid gap-2">
          <Field htmlFor="password" label={editing ? "Yangi parol (ixtiyoriy)" : "Parol"} error={errors.password?.message}>
            <PasswordInput
              id="password"
              placeholder={editing ? "Bo'sh qoldirsangiz, parol o'zgarmaydi" : "Parolni kiriting"}
              aria-invalid={!!errors.password}
              {...form.register("password")}
            />
          </Field>
          {password && <PasswordStrengthMeter password={password} />}
        </div>
      )}
    </div>
  );
}
