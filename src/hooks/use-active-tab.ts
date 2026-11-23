import { useEffect, useState } from "react";
import { siteOf } from "@/lib/domain";

export interface ActiveTab {
  id: number;
  url: string;
  origin: string;
  site: string | null;
}

/** Side panel joylashgan oynadagi faol tab. */
export function useActiveTab(): ActiveTab | null {
  const [tab, setTab] = useState<ActiveTab | null>(null);

  useEffect(() => {
    let alive = true;
    const update = async () => {
      const [t] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!alive) return;
      if (t?.id === undefined || !t.url) return setTab(null);
      const site = siteOf(t.url);
      setTab({ id: t.id, url: t.url, origin: site ? new URL(t.url).origin : "", site });
    };
    const onChange = () => void update();

    void update();
    chrome.tabs.onActivated.addListener(onChange);
    chrome.tabs.onUpdated.addListener(onChange);
    chrome.windows.onFocusChanged.addListener(onChange);
    return () => {
      alive = false;
      chrome.tabs.onActivated.removeListener(onChange);
      chrome.tabs.onUpdated.removeListener(onChange);
      chrome.windows.onFocusChanged.removeListener(onChange);
    };
  }, []);

  return tab;
}
