export interface Strength {
  score: 0 | 1 | 2 | 3 | 4;
  label: string;
}

const LABELS = ["Juda zaif", "Zaif", "O'rtacha", "Yaxshi", "Kuchli"] as const;

/** Tezkor UI baholash. Production'da zxcvbn-ts bilan almashtirish tavsiya etiladi. */
export function passwordStrength(pw: string): Strength {
  if (!pw) return { score: 0, label: LABELS[0] };
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(pw)).length;
  let score = 0;
  if (pw.length >= 12) score++;
  if (pw.length >= 16) score++;
  if (classes >= 3) score++;
  if (classes === 4 || pw.length >= 20) score++;
  if (/^(.)\1+$/.test(pw) || /^(?:1234|qwer|pass|parol)/i.test(pw)) score = 0;
  const s = Math.min(score, 4) as Strength["score"];
  return { score: s, label: LABELS[s] };
}
