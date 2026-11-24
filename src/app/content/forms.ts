const USERNAME_SELECTOR = [
  'input[autocomplete~="username"]',
  'input[autocomplete~="email"]',
  'input[type="email"]',
  'input[type="text"]',
  'input[type="tel"]',
  "input:not([type])",
].join(",");

const USERNAME_HINT = /user|login|email|e-mail|account|phone|identifier/i;

export function isVisible(el: HTMLElement): boolean {
  const r = el.getBoundingClientRect();
  if (r.width === 0 || r.height === 0) return false;
  const s = getComputedStyle(el);
  return s.visibility !== "hidden" && s.display !== "none" && s.opacity !== "0";
}

export interface LoginFields {
  username: HTMLInputElement | null;
  password: HTMLInputElement | null;
}

/** Berilgan scope ichidan login/parol maydonlarini topadi (multi-step formalar ham). */
export function findLoginFields(scope: ParentNode = document): LoginFields {
  const password =
    [...scope.querySelectorAll<HTMLInputElement>('input[type="password"]')].find(isVisible) ?? null;
  const candidates = [...scope.querySelectorAll<HTMLInputElement>(USERNAME_SELECTOR)].filter(
    (el) => isVisible(el) && !el.disabled && !el.readOnly,
  );

  let username: HTMLInputElement | null = null;
  if (password) {
    // Paroldan oldingi eng yaqin matn maydoni.
    username =
      candidates
        .filter((c) => c.compareDocumentPosition(password) & Node.DOCUMENT_POSITION_FOLLOWING)
        .pop() ?? null;
  } else {
    username =
      candidates.find(
        (c) =>
          c.type === "email" ||
          /username|email/.test(c.autocomplete) ||
          USERNAME_HINT.test(`${c.name} ${c.id} ${c.placeholder}`),
      ) ?? null;
  }
  return { username, password };
}

export function isLoginField(el: Element): el is HTMLInputElement {
  if (!(el instanceof HTMLInputElement)) return false;
  if (el.type === "password") return true;
  const { username } = findLoginFields(el.form ?? document);
  return username === el;
}

/** React/Vue kabi controlled input'lar ham qiymatni "ko'rishi" uchun native setter. */
export function setValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  input.focus();
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

// ── v0.9: 2FA (OTP) maydonlari ────────────────────────────────────────────────
const OTP_HINT = /(^|[^a-z])(otp|totp|2fa|mfa)([^a-z]|$)|one[-_ ]?time|verification[-_ ]?code|(auth|authenticator|security)[-_ ]?code|код/i;
const OTP_TYPES = new Set(["text", "tel", "number", ""]);

const usable = (el: HTMLInputElement) =>
  OTP_TYPES.has(el.type) && isVisible(el) && !el.disabled && !el.readOnly;

const hintOf = (el: HTMLInputElement) =>
  `${el.name} ${el.id} ${el.placeholder} ${el.getAttribute("aria-label") ?? ""}`;

/** Bitta maydonli OTP: autocomplete="one-time-code" yoki nom/id/placeholder bo'yicha, maxlength 6..8 (yoki yo'q). */
function isSingleOtp(el: HTMLInputElement): boolean {
  if (!usable(el) || el.maxLength === 1) return false;
  if (/one-time-code/.test(el.autocomplete)) return true;
  const lengthOk = el.maxLength < 0 || (el.maxLength >= 6 && el.maxLength <= 8);
  return lengthOk && OTP_HINT.test(hintOf(el));
}

/** 6 ta bir belgili maydon (har biri maxlength=1) — eng yaqin umumiy konteynerda aynan 6 ta. */
function splitOtpGroup(el: HTMLInputElement): HTMLInputElement[] | null {
  if (el.maxLength !== 1 || !usable(el)) return null;
  let box: Element | null = el.parentElement;
  for (let depth = 0; box && depth < 4; depth++, box = box.parentElement) {
    const boxes = [...box.querySelectorAll<HTMLInputElement>("input")].filter((i) => i.maxLength === 1 && usable(i));
    if (boxes.length < 6) continue;
    return boxes.length === 6 && boxes.includes(el) ? boxes : null;
  }
  return null;
}

/** `el` OTP maydonmi (yoki 6 bo'lakli OTP'ning bir bo'lagimi)? Parol maydoni hech qachon emas. */
export function isOtpField(el: Element): el is HTMLInputElement {
  return el instanceof HTMLInputElement && (isSingleOtp(el) || splitOtpGroup(el) !== null);
}

/** `anchor` bilan bog'liq OTP maydon(lar)i; topilmasa sahifadagi birinchi bitta maydonli OTP. */
export function findOtpFields(anchor: HTMLInputElement | null, scope: ParentNode = document): HTMLInputElement[] {
  if (anchor) {
    if (isSingleOtp(anchor)) return [anchor];
    const group = splitOtpGroup(anchor);
    if (group) return group;
  }
  const single = [...scope.querySelectorAll<HTMLInputElement>("input")].find(isSingleOtp);
  return single ? [single] : [];
}

/** Kodni to'ldiradi: bitta maydonga to'liq, bo'lakli bo'lsa har biriga bittadan belgi. */
export function fillOtp(fields: HTMLInputElement[], code: string): boolean {
  if (fields.length === 0) return false;
  if (fields.length === 1) setValue(fields[0], code);
  else fields.forEach((f, i) => setValue(f, code[i] ?? ""));
  return true;
}
