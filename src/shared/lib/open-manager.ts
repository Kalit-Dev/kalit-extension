/** manager.html ochiq bo'lsa — unga o'tadi, bo'lmasa yangi tab ochadi. */
export async function openManager(hash = ""): Promise<void> {
  const url = chrome.runtime.getURL("manager.html");
  const [existing] = await chrome.tabs.query({ url });
  if (existing?.id !== undefined) {
    await chrome.tabs.update(existing.id, { active: true, ...(hash ? { url: url + hash } : {}) });
    if (existing.windowId !== undefined) await chrome.windows.update(existing.windowId, { focused: true });
    return;
  }
  await chrome.tabs.create({ url: url + hash });
}
