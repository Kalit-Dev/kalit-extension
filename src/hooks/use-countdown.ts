import { useEffect, useState } from "react";

/** `expiresAt` gacha qolgan millisekundlar (100 ms aniqlikda). */
export function useCountdown(expiresAt: number | undefined): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!expiresAt) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(timer);
  }, [expiresAt]);

  return expiresAt ? Math.max(0, expiresAt - now) : 0;
}
