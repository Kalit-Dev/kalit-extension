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
