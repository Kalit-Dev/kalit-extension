import { create } from "zustand";
import { DeviceClient, DeviceError } from "@/device/client";
import { MockTransport } from "@/device/mock-transport";
import type { AddEntryParams, ConfirmInfo, Credential, EntryMeta, Status } from "@/device/protocol";
import { SerialTransport } from "@/device/serial-transport";
import type { TransportKind } from "@/device/transport";
import { getHostId } from "@/lib/storage";

export type Phase = "disconnected" | "connecting" | "pairing" | "factory" | "locked" | "unlocked";

export interface PendingConfirm extends ConfirmInfo {
  expiresAt: number;
}

interface DeviceStore {
  client: DeviceClient | null;
  kind: TransportKind | null;
  phase: Phase;
  status: Status | null;
  /** Faqat metadata, faqat RAM'da. Parollar bu yerda hech qachon bo'lmaydi. */
  entries: EntryMeta[];
  pending: PendingConfirm | null;

  connect(kind: TransportKind, opts?: { silent?: boolean }): Promise<void>;
  disconnect(): Promise<void>;
  refresh(): Promise<void>;
  pair(): Promise<void>;
  onboard(masterPassword: string): Promise<void>;
  unlock(masterPassword: string): Promise<void>;
  lock(): Promise<void>;
  getCredential(id: string, origin: string): Promise<Credential>;
  addEntry(params: AddEntryParams): Promise<EntryMeta>;
  deleteEntry(id: string): Promise<void>;
  /** Faqat demo rejim: jismoniy tugmani simulyatsiya qiladi. */
  press(kind: "short" | "long"): void;
}

const initialState = {
  client: null,
  kind: null,
  phase: "disconnected" as Phase,
  status: null,
  entries: [] as EntryMeta[],
  pending: null,
};

export const useDevice = create<DeviceStore>()((set, get) => {
  const client = () => {
    const c = get().client;
    if (!c) throw new DeviceError("DISCONNECTED");
    return c;
  };

  return {
    ...initialState,

    async connect(kind, { silent = false } = {}) {
      if (get().client || get().phase === "connecting") return;
      set({ phase: "connecting" });
      try {
        const transport =
          kind === "mock"
            ? new MockTransport()
            : silent
              ? await SerialTransport.fromGranted()
              : await SerialTransport.request();
        if (!transport) {
          set({ phase: "disconnected" });
          return;
        }
        await transport.open();

        const c = new DeviceClient(transport);
        c.onEvent((e) => {
          if (e.event === "CONFIRM_PENDING") {
            set({ pending: { ...e.data, expiresAt: Date.now() + e.data.timeoutMs } });
          } else if (e.event === "CONFIRM_DONE") {
            set({ pending: null });
          } else if (e.event === "LOCKED") {
            set({ phase: "locked", entries: [], pending: null });
          }
        });
        transport.onClose(() => set({ ...initialState }));

        set({ client: c, kind });
        await get().refresh();
      } catch (e) {
        await get().client?.transport.close().catch(() => undefined);
        set({ ...initialState });
        if (!silent) throw e;
      }
    },

    async disconnect() {
      await get().client?.transport.close();
      set({ ...initialState });
    },

    async refresh() {
      const status = await client().call("GET_STATUS", { hostId: await getHostId() });
      set({ status });
      if (!status.hostTrusted) return set({ phase: "pairing", entries: [] });
      if (status.state === "FACTORY") return set({ phase: "factory", entries: [] });
      if (status.state === "LOCKED") return set({ phase: "locked", entries: [] });
      const { entries } = await client().call("LIST", {});
      set({ phase: "unlocked", entries });
    },

    async pair() {
      await client().call("PAIR_HOST", {
        hostId: await getHostId(),
        hostName: `Chrome · ${navigator.platform || "PC"}`.slice(0, 64),
      });
      await get().refresh();
    },

    async onboard(masterPassword) {
      // Refresh bu yerda chaqirilmaydi: avval recovery phrase ekrani ko'rsatiladi.
      await client().call("ONBOARD", { masterPassword });
    },

    async unlock(masterPassword) {
      try {
        await client().call("UNLOCK", { masterPassword });
      } finally {
        // Urinishlar sonini yangilash yoki WIPED bo'lsa FACTORY'ga o'tish.
        await get().refresh().catch(() => undefined);
      }
    },

    async lock() {
      await client().call("LOCK", {});
      set({ phase: "locked", entries: [], pending: null });
    },

    getCredential(id, origin) {
      return client().call("GET_CREDENTIAL", { id, origin });
    },

    async addEntry(params) {
      const { entry } = await client().call("ADD_ENTRY", params);
      set((s) => ({ entries: [...s.entries, entry] }));
      return entry;
    },

    async deleteEntry(id) {
      await client().call("DELETE_ENTRY", { id });
      set((s) => ({ entries: s.entries.filter((e) => e.id !== id) }));
    },

    press(kind) {
      const transport = get().client?.transport;
      if (transport instanceof MockTransport) transport.press(kind);
    },
  };
});
