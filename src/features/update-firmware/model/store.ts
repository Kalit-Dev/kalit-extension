import { create } from "zustand";
import { useDevice } from "@/entities/device";
import { SerialTransport } from "@/shared/api/device/serial-transport";
import { describeFirmwareError } from "@/shared/api/firmware/errors";
import { flashRelease, type FlashProgress } from "@/shared/api/firmware/flash";
import { loadVerifiedRelease, type VerifiedRelease } from "@/shared/api/firmware/release";
import { FirmwareError } from "@/shared/api/firmware/verify";
import { kvGet, kvSet } from "@/shared/lib/kv";

export type FirmwareView =
  | { step: "idle" }
  | { step: "checking" }
  | { step: "ready"; release: VerifiedRelease }
  | { step: "working"; progress: FlashProgress }
  | { step: "done"; version: string; reconnected: boolean }
  | { step: "error"; message: string };

interface FirmwareStore {
  view: FirmwareView;
  check(): Promise<void>;
  /** Faqat user gesture ichida chaqiriladi (port chooser). */
  update(release: VerifiedRelease): Promise<void>;
  reset(): void;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Holat komponentdan tashqarida: yangilash boshlanganda engine uzilib, manager sahifasi qobig'i almashadi
 * va komponent qayta mount bo'ladi. Oqim esa davom etishi va progress yo'qolmasligi kerak.
 */
export const useFirmware = create<FirmwareStore>()((set, get) => {
  const setView = (view: FirmwareView) => set({ view });

  /** Qurilma boot bo'lib, USB qayta paydo bo'lishini kutib, engine'ni qayta ulaydi (avto-ulanish tiklanadi). */
  async function reconnect(): Promise<boolean> {
    await kvSet("autoConnect", true);
    for (let i = 0; i < 5; i++) {
      await sleep(1500);
      try {
        await useDevice.getState().connect("usb");
        return true;
      } catch {
        /* qurilma hali ko'tarilmagan */
      }
    }
    return false;
  }

  return {
    view: { step: "idle" },

    async check() {
      if (get().view.step === "working") return;
      setView({ step: "checking" });
      try {
        setView({ step: "ready", release: await loadVerifiedRelease() });
      } catch (e) {
        setView({ step: "error", message: describeFirmwareError(e) });
      }
    },

    async update(release) {
      if (get().view.step === "working") return;
      // Chooser faqat user gesture ichida ochiladi, shuning uchun port eng birinchi olinadi.
      let port: SerialPort | null;
      try {
        port = (await SerialTransport.grantedPort()) ?? (await SerialTransport.requestPort());
      } catch (e) {
        if (e instanceof DOMException && e.name === "NotFoundError") return; // foydalanuvchi bekor qildi
        return setView({ step: "error", message: describeFirmwareError(new FirmwareError("NO_PORT")) });
      }

      const wasAuto = (await kvGet("autoConnect")) !== false;
      setView({ step: "working", progress: { stage: "connecting", fraction: 0 } });
      try {
        await useDevice.getState().disconnect(); // engine portni yopadi va avto-ulanishni to'xtatadi
        await sleep(300);
        const { version } = await flashRelease(port, release, (progress) => setView({ step: "working", progress }));
        const reconnected = wasAuto ? await reconnect() : false;
        setView({ step: "done", version, reconnected });
      } catch (e) {
        if (wasAuto) await reconnect(); // xato bo'lsa ham eski holatga qaytishga urinamiz
        setView({ step: "error", message: describeFirmwareError(e) });
      }
    },

    reset() {
      if (get().view.step !== "working") setView({ step: "idle" });
    },
  };
});
