import { Check, Cpu, Info } from "lucide-react";
import { GEN_MAX, WORDS_MAX, WORDS_MIN } from "@/shared/api/device/protocol";
import { cn } from "@/shared/lib/utils";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Segmented } from "@/shared/ui/segmented";
import { Slider } from "@/shared/ui/slider";
import {
  describeGenerator,
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
  { key: "lower", sample: "a–z", name: "Kichik harf" },
  { key: "upper", sample: "A–Z", name: "Katta harf" },
  { key: "digit", sample: "0–9", name: "Raqam" },
  { key: "symbol", sample: "!@#", name: "Belgi" },
] as const;

interface LengthControlProps {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  invalid: boolean;
  onChange: (n: number) => void;
}

/** Slayder + aniq qiymat maydoni: ikkalasi bir xil qiymatni tahrirlaydi. */
function LengthControl({ id, label, value, min, max, invalid, onChange }: LengthControlProps) {
  const shown = Number.isFinite(value) ? Math.min(Math.max(value, min), max) : min;
  return (
    <div className="grid gap-2.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-center gap-4">
        <Slider
          aria-label={`${label} (slayder)`}
          min={min}
          max={max}
          step={1}
          value={[shown]}
          onValueChange={([n]) => onChange(n!)}
          className="min-w-0 flex-1"
        />
        <Input
          id={id}
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          value={Number.isNaN(value) ? "" : value}
          onChange={(e) => onChange(e.target.value === "" ? Number.NaN : Number(e.target.value))}
          aria-invalid={invalid}
          className="w-20 text-center font-mono tabular-nums"
        />
      </div>
      <div className="flex justify-between text-[11px] text-muted-foreground tabular-nums" aria-hidden>
        <span>{min}</span>
        <span>{max}</span>
      </div>
    </div>
  );
}

interface Props {
  value: GeneratorSettings;
  onChange: (next: GeneratorSettings) => void;
}

/** Qurilma generatori sozlamalari: belgilar to'plami, PIN, diceware passphrase. Parol qurilmada yaratiladi. */
export function GeneratorOptions({ value, onChange }: Props) {
  const set = (patch: Partial<GeneratorSettings>) => onChange({ ...value, ...patch });
  const error = generatorError(value);
  return (
    <div className="grid gap-5" data-testid="generator-options">
      <Segmented label="Generator turi" fill value={value.kind} options={KINDS} onChange={(kind) => set({ kind })} />

      {value.kind === "chars" && (
        <>
          <LengthControl
            id="gen-length"
            label="Uzunlik"
            value={value.length}
            min={minLength(value)}
            max={GEN_MAX}
            invalid={!!error}
            onChange={(length) => set({ length })}
          />
          <fieldset className="grid gap-2.5">
            <legend className="mb-2.5 text-sm leading-none font-medium">Belgilar to'plami</legend>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {CLASSES.map(({ key, sample, name }) => {
                const on = value[key];
                return (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={on}
                    onClick={() => set({ [key]: !on })}
                    className={cn(
                      "relative grid justify-items-start gap-0.5 rounded-lg border px-3 py-2.5 text-left outline-none transition-colors",
                      "focus-visible:ring-[3px] focus-visible:ring-ring/50",
                      on ? "border-primary bg-primary/10" : "text-muted-foreground hover:bg-accent",
                    )}
                  >
                    <span className={cn("font-mono text-sm", on && "text-foreground")}>{sample}</span>
                    <span className="text-xs">{name}</span>
                    {on && <Check className="absolute top-2 right-2 size-3.5 text-primary" aria-hidden />}
                  </button>
                );
              })}
            </div>
          </fieldset>
        </>
      )}

      {value.kind === "pin" && (
        <LengthControl
          id="gen-pin"
          label="Raqamlar soni"
          value={value.pinLength}
          min={PIN_MIN}
          max={PIN_MAX}
          invalid={!!error}
          onChange={(pinLength) => set({ pinLength })}
        />
      )}

      {value.kind === "words" && (
        <LengthControl
          id="gen-words"
          label="So'zlar soni"
          value={value.words}
          min={WORDS_MIN}
          max={WORDS_MAX}
          invalid={!!error}
          onChange={(words) => set({ words })}
        />
      )}

      <div className="grid gap-2 rounded-lg border bg-muted/30 px-3.5 py-3">
        <p className="flex items-center gap-2 text-sm font-medium">
          <Cpu className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          Qurilmada yaratiladi · {describeGenerator(value)}
        </p>
        {error ? (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        ) : (
          <p className="flex items-start gap-1.5 text-xs leading-relaxed text-muted-foreground">
            <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            {value.kind === "pin"
              ? "PIN qisqa bo'lgani uchun parol auditi uni “zaif” deb belgilaydi. Faqat qurilma o'zi urinishlarni cheklaydigan joylar (SIM, kalit) uchun."
              : value.kind === "words"
                ? "EFF ro'yxatidan tasodifiy so'zlar, “-” bilan ajratiladi. Har so'z ≈ 12.9 bit; 6 ta so'z ≈ 77 bit."
                : "O'xshash belgilar (0/O, 1/l/I) tushirib qoldiriladi; tanlangan har tur kamida bir marta uchraydi."}
          </p>
        )}
      </div>
    </div>
  );
}
