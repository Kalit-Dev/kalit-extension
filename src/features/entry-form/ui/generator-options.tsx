import { Info } from "lucide-react";
import { GEN_MAX, WORDS_MAX, WORDS_MIN } from "@/shared/api/device/protocol";
import { cn } from "@/shared/lib/utils";
import { Input } from "@/shared/ui/input";
import { Segmented } from "@/shared/ui/segmented";
import {
  generatorError,
  minLength,
  PIN_MAX,
  PIN_MIN,
  type GeneratorKind,
  type GeneratorSettings,
} from "../model/generator-options";

const KINDS = [
  { value: "chars", label: "Parol" },
  { value: "pin", label: "PIN" },
  { value: "words", label: "So'zlar" },
] as const satisfies readonly { value: GeneratorKind; label: string }[];

const CLASSES = [
  { key: "lower", label: "a–z" },
  { key: "upper", label: "A–Z" },
  { key: "digit", label: "0–9" },
  { key: "symbol", label: "!@#" },
] as const;

interface Props {
  value: GeneratorSettings;
  onChange: (next: GeneratorSettings) => void;
}

/** Qurilma generatori sozlamalari: belgilar to'plami, PIN, diceware passphrase. Parol qurilmada yaratiladi. */
export function GeneratorOptions({ value, onChange }: Props) {
  const set = (patch: Partial<GeneratorSettings>) => onChange({ ...value, ...patch });
  const error = generatorError(value);
  const num = (raw: string) => (raw === "" ? Number.NaN : Number(raw));
  return (
    <div className="grid gap-3 rounded-lg border bg-muted/20 p-4 sm:col-span-2" data-testid="generator-options">
      <Segmented label="Generator turi" fill compact value={value.kind} options={KINDS} onChange={(kind) => set({ kind })} />

      {value.kind === "chars" && (
        <div className="grid gap-3 sm:grid-cols-[8rem_1fr] sm:items-end">
          <label className="grid gap-1.5 text-sm font-medium">
            Uzunlik
            <Input
              type="number"
              inputMode="numeric"
              min={minLength(value)}
              max={GEN_MAX}
              value={Number.isNaN(value.length) ? "" : value.length}
              onChange={(e) => set({ length: num(e.target.value) })}
              aria-invalid={!!error}
            />
          </label>
          <div role="group" aria-label="Belgilar to'plami" className="flex flex-wrap gap-2">
            {CLASSES.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                aria-pressed={value[key]}
                onClick={() => set({ [key]: !value[key] })}
                className={cn(
                  "h-9 min-w-14 rounded-md border px-3 font-mono text-sm outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50",
                  value[key] ? "border-primary bg-primary/10 text-foreground" : "text-muted-foreground hover:bg-accent",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {value.kind === "pin" && (
        <label className="grid max-w-32 gap-1.5 text-sm font-medium">
          Raqamlar soni
          <Input
            type="number"
            inputMode="numeric"
            min={PIN_MIN}
            max={PIN_MAX}
            value={Number.isNaN(value.pinLength) ? "" : value.pinLength}
            onChange={(e) => set({ pinLength: num(e.target.value) })}
            aria-invalid={!!error}
          />
        </label>
      )}

      {value.kind === "words" && (
        <label className="grid max-w-32 gap-1.5 text-sm font-medium">
          So'zlar soni
          <Input
            type="number"
            inputMode="numeric"
            min={WORDS_MIN}
            max={WORDS_MAX}
            value={Number.isNaN(value.words) ? "" : value.words}
            onChange={(e) => set({ words: num(e.target.value) })}
            aria-invalid={!!error}
          />
        </label>
      )}

      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : (
        <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          {value.kind === "pin"
            ? "PIN qisqa bo'lgani uchun parol auditi uni “zaif” deb belgilaydi. Faqat qurilma o'zi urinishlarni cheklaydigan joylar (SIM, kalit) uchun."
            : value.kind === "words"
              ? "EFF ro'yxatidan tasodifiy so'zlar, “-” bilan ajratiladi. Har so'z ≈ 12.9 bit; 6 ta so'z ≈ 77 bit."
              : "O'xshash belgilar (0/O, 1/l/I) tushirib qoldiriladi; tanlangan har tur kamida bir marta uchraydi."}
        </p>
      )}
    </div>
  );
}
