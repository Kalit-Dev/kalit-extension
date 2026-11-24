export type OverlayView = "menu" | "save";

const HOST_STYLE = "all: initial !important; position: fixed !important; z-index: 2147483647 !important;";
const FRAME_STYLE =
  "display: block; border: 0; background: transparent; color-scheme: normal; height: 0; width: 100%;";

/**
 * Inline menu va save prompt — extension origin'dagi iframe, yopiq Shadow DOM ichida.
 * Sayt skriptlari iframe ichidagi ma'lumotni o'qiy olmaydi.
 */
export class Overlay {
  private host: HTMLElement | null = null;
  private frame: HTMLIFrameElement | null = null;
  private anchor: HTMLElement | null = null;
  private view: OverlayView | null = null;
  private raf = 0;

  constructor() {
    const reposition = () => {
      cancelAnimationFrame(this.raf);
      this.raf = requestAnimationFrame(() => this.place());
    };
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
  }

  get window(): Window | null {
    return this.frame?.contentWindow ?? null;
  }

  get element(): HTMLElement | null {
    return this.host;
  }

  get current(): OverlayView | null {
    return this.view;
  }

  show(view: OverlayView, anchor: HTMLElement | null = null) {
    if (this.view === view && this.anchor === anchor && this.host?.isConnected) return;
    this.hide();

    const host = document.createElement("kalit-overlay");
    host.setAttribute("style", HOST_STYLE);
    const shadow = host.attachShadow({ mode: "closed" });
    const frame = document.createElement("iframe");
    frame.setAttribute("style", FRAME_STYLE);
    frame.setAttribute("title", "Kalit");
    frame.setAttribute("tabindex", "-1");
    frame.src = chrome.runtime.getURL(`overlay.html?view=${view}`);
    shadow.append(frame);
    document.documentElement.append(host);

    this.host = host;
    this.frame = frame;
    this.anchor = anchor;
    this.view = view;
    this.place();
  }

  setHeight(height: number) {
    if (this.frame) this.frame.style.height = `${Math.min(Math.max(height, 0), 480)}px`;
  }

  hide() {
    this.host?.remove();
    this.host = this.frame = this.anchor = null;
    this.view = null;
  }

  private place() {
    const host = this.host;
    if (!host) return;
    const set = (prop: string, value: string) => host.style.setProperty(prop, value, "important");

    if (this.view === "save" || !this.anchor) {
      set("top", "12px");
      set("right", "12px");
      set("left", "auto");
      set("width", "360px");
      return;
    }
    if (!this.anchor.isConnected) return this.hide();

    const r = this.anchor.getBoundingClientRect();
    const width = Math.min(Math.max(r.width, 300), 380);
    const left = Math.max(8, Math.min(r.left - 8, window.innerWidth - width - 8));
    set("top", `${r.bottom - 4}px`);
    set("left", `${left}px`);
    set("right", "auto");
    set("width", `${width}px`);
  }
}
