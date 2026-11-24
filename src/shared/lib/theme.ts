import { useSyncExternalStore } from "react";

export type Theme = "dark" | "light" | "system";
export const DEFAULT_THEME: Theme = "dark";

const KEY = "kalit-theme";
const EVENT = "kalit-theme-change";
const media = () => window.matchMedia("(prefers-color-scheme: dark)");

export function getTheme(): Theme {
  try {
    const v = localStorage.getItem(KEY);
    return v === "dark" || v === "light" || v === "system" ? v : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

export const resolveTheme = (t: Theme): "dark" | "light" =>
  t === "system" ? (media().matches ? "dark" : "light") : t;

function apply(t: Theme) {
  document.documentElement.classList.toggle("dark", resolveTheme(t) === "dark");
}

export function setTheme(t: Theme): void {
  try {
    localStorage.setItem(KEY, t);
  } catch {
    // saqlab bo'lmasa ham joriy sahifada qo'llanadi
  }
  apply(t);
  window.dispatchEvent(new Event(EVENT));
}

/** Sahifa ochilganda birinchi bo'lib chaqiriladi: sinf qo'yadi va o'zgarishlarga (tab'lar, tizim rejimi) obuna bo'ladi. */
export function initTheme(): void {
  apply(getTheme());
  const sync = () => {
    apply(getTheme());
    window.dispatchEvent(new Event(EVENT));
  };
  window.addEventListener("storage", (e) => e.key === KEY && sync());
  media().addEventListener("change", () => getTheme() === "system" && sync());
}

const subscribe = (cb: () => void) => {
  window.addEventListener(EVENT, cb);
  return () => window.removeEventListener(EVENT, cb);
};

export const useTheme = (): Theme => useSyncExternalStore(subscribe, getTheme, () => DEFAULT_THEME);
