import { SerialTransport } from "@/device/serial-transport";

// Web Serial tanlash oynasi side panel'da ishonchli ochilmaydi — ruxsat shu oddiy tab'da olinadi.
// Ruxsat extension origin'iga tegishli, shuning uchun side panel keyin getPorts() bilan jim ulanadi.
export const PORT_GRANTED = "KALIT_PORT_GRANTED";

const msg = document.getElementById("msg")!;
document.getElementById("btn")!.addEventListener("click", async () => {
  try {
    await SerialTransport.request();
    msg.textContent = "Ruxsat berildi. Bu oynani yopishingiz mumkin.";
    await chrome.runtime.sendMessage({ type: PORT_GRANTED }).catch(() => undefined);
    setTimeout(() => window.close(), 800);
  } catch (e) {
    msg.textContent = e instanceof DOMException && e.name === "NotFoundError" ? "Qurilma tanlanmadi." : `Xato: ${String(e)}`;
  }
});
