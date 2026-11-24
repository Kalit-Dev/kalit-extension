import { createMemoryRouter } from "react-router";
import { PopupConnectPage } from "@/pages/popup-connect";
import { PopupVaultPage } from "@/pages/popup-vault";
import { UnlockPage } from "@/pages/unlock";
import { PopupShell } from "@/widgets/popup-shell";

// Extension sahifasida URL o'zgarmasligi uchun memory router.
export const router = createMemoryRouter(
  [
    {
      element: <PopupShell />,
      children: [
        { path: "/connect", element: <PopupConnectPage /> },
        { path: "/unlock", element: <UnlockPage /> },
        { path: "/vault", element: <PopupVaultPage /> },
        { path: "*", element: null },
      ],
    },
  ],
  { initialEntries: ["/connect"] },
);
