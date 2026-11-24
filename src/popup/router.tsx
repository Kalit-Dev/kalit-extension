import { createMemoryRouter } from "react-router";
import { AppShell } from "./components/app-shell";
import { OpenManagerPage } from "./routes/open-manager";
import { UnlockPage } from "./routes/unlock";
import { VaultPage } from "./routes/vault";

// Extension sahifasida URL o'zgarmasligi uchun memory router.
export const router = createMemoryRouter(
  [
    {
      element: <AppShell />,
      children: [
        { path: "/connect", element: <OpenManagerPage /> },
        { path: "/unlock", element: <UnlockPage /> },
        { path: "/vault", element: <VaultPage /> },
        { path: "*", element: null },
      ],
    },
  ],
  { initialEntries: ["/connect"] },
);
