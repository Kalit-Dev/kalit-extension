import type { PendingConfirm } from "@/shared/api/engine/protocol";

export type ConfirmView = Omit<PendingConfirm, "code">;

/**
 * Overlay nimani ko'rsatadi. "pair" hech qachon (ulash oqimining o'z UI'si bor; bosqichsiz "pair" hodisasi MITM'dan
 * bo'lishi mumkin). Qurilma yuborgan `code` hech qachon ko'rsatilmaydi: u ishonchsiz va boshqa amallarda yo'q.
 */
export function confirmView(pending: PendingConfirm | null): ConfirmView | null {
  if (!pending || pending.action === "pair") return null;
  const view: PendingConfirm = { ...pending };
  delete view.code;
  return view;
}
