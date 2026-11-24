import { createHashRouter } from "react-router";
import { ConnectPage } from "@/popup/routes/connect";
import { PairPage } from "@/popup/routes/pair";
import { SetupDonePage, SetupPage } from "@/popup/routes/setup";
import { UnlockPage } from "@/popup/routes/unlock";
import { ManagerShell } from "./shell";
import { EntryFormPage } from "./pages/entry-form";
import { HostsPage } from "./pages/hosts";
import { ImportPage } from "./pages/import";
import { SecurityPage } from "./pages/security";
import { SettingsPage } from "./pages/settings";
import { VaultPage } from "./pages/vault";

// Hash router: tab yangilansa ham joyida qoladi.
export const router = createHashRouter([
  {
    element: <ManagerShell />,
    children: [
      { path: "/connect", element: <ConnectPage /> },
      { path: "/pair", element: <PairPage /> },
      { path: "/setup", element: <SetupPage /> },
      { path: "/setup/done", element: <SetupDonePage /> },
      { path: "/unlock", element: <UnlockPage /> },
      { path: "/vault", element: <VaultPage /> },
      { path: "/vault/new", element: <EntryFormPage /> },
      { path: "/vault/:id/edit", element: <EntryFormPage /> },
      { path: "/hosts", element: <HostsPage /> },
      { path: "/import", element: <ImportPage /> },
      { path: "/security", element: <SecurityPage /> },
      { path: "/settings", element: <SettingsPage /> },
      { path: "*", element: null },
    ],
  },
]);
