import { createHashRouter, Navigate } from "react-router";
import { ConnectPage } from "@/pages/connect";
import { EntryFormPage } from "@/pages/entry-form";
import { FirmwarePage } from "@/pages/firmware";
import { PairPage } from "@/pages/pair";
import { SettingsBackupPage, SettingsGeneralPage, SettingsHostsPage, SettingsImportPage, SettingsLayout, SettingsSecurityPage } from "@/pages/settings";
import { SetupDonePage, SetupPage } from "@/pages/setup";
import { UnlockPage } from "@/pages/unlock";
import { VaultPage } from "@/pages/vault";
import { ManagerShell } from "@/widgets/manager-shell";

// Hash router: tab yangilansa ham joyida qoladi.
export const router = createHashRouter([
  {
    element: <ManagerShell />,
    children: [
      { path: "/connect", element: <ConnectPage /> },
      { path: "/firmware", element: <FirmwarePage /> },
      { path: "/pair", element: <PairPage /> },
      { path: "/setup", element: <SetupPage /> },
      { path: "/setup/done", element: <SetupDonePage /> },
      { path: "/unlock", element: <UnlockPage /> },
      { path: "/vault", element: <VaultPage /> },
      { path: "/vault/new", element: <EntryFormPage /> },
      { path: "/vault/:id/edit", element: <EntryFormPage /> },
      { path: "/import", element: <Navigate to="/settings/import" replace /> },
      { path: "/security", element: <Navigate to="/settings/security" replace /> },
      {
        path: "/settings",
        element: <SettingsLayout />,
        children: [
          { index: true, element: <Navigate to="general" replace /> },
          { path: "general", element: <SettingsGeneralPage /> },
          { path: "hosts", element: <SettingsHostsPage /> },
          { path: "import", element: <SettingsImportPage /> },
          { path: "security", element: <SettingsSecurityPage /> },
          { path: "backup", element: <SettingsBackupPage /> },
        ],
      },
      { path: "/hosts", element: <Navigate to="/settings/hosts" replace /> },
      { path: "*", element: null },
    ],
  },
]);
