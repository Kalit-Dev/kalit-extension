import { createMemoryRouter } from "react-router";
import { AppShell } from "./components/app-shell";
import { ConnectPage } from "./routes/connect";
import { NewEntryPage } from "./routes/entry-new";
import { PairPage } from "./routes/pair";
import { SettingsPage } from "./routes/settings";
import { SetupDonePage, SetupPage } from "./routes/setup";
import { UnlockPage } from "./routes/unlock";
import { VaultPage } from "./routes/vault";

// Extension sahifasida URL o'zgarmasligi uchun memory router.
export const router = createMemoryRouter(
  [
    {
      element: <AppShell />,
      children: [
        { path: "/connect", element: <ConnectPage /> },
        { path: "/pair", element: <PairPage /> },
        { path: "/setup", element: <SetupPage /> },
        { path: "/setup/done", element: <SetupDonePage /> },
        { path: "/unlock", element: <UnlockPage /> },
        { path: "/vault", element: <VaultPage /> },
        { path: "/vault/new", element: <NewEntryPage /> },
        { path: "/settings", element: <SettingsPage /> },
        { path: "*", element: null },
      ],
    },
  ],
  { initialEntries: ["/connect"] },
);
