# Chrome Web Store: single purpose and permission justifications

Text for the Chrome Web Store "Privacy practices" form. Each claim below was checked against the source.

## Single purpose

Kalit is the browser companion of a hardware password manager: it detects login forms, and after the user confirms on the
physical Kalit device (USB, ESP32), fills in the credentials or offers to save new ones to the device.

## Permission justifications

- **storage**: Stores four small settings in `chrome.storage.local`: this computer's Noise private key (`hostPriv`), the
  paired device's public key (`deviceKey`), the list of sites where the user turned off save prompts (`neverSave`), and the
  auto-connect flag (`autoConnect`). Passwords and the master password are never written to storage.
- **idle**: `chrome.idle.onStateChanged` is used to lock the device when the computer's screen locks.
- **offscreen**: An offscreen document (reason WORKERS) owns the Web Serial connection and the Noise session to the device.
  The MV3 service worker is suspended after about 30 seconds and the popup closes, either of which would drop the connection.
- **favicon**: Shows the website's icon next to each entry via the `/_favicon/` endpoint (Chrome's local cache; no network request by the extension).
- **Host permissions `https://*/*`, `http://localhost/*`, `http://127.0.0.1/*`**: Required for the content script to find login
  forms on any website, fill credentials after device approval, and show the inline menu and the save prompt (iframe
  `overlay.html`, exposed as a web-accessible resource to the same match patterns). The page origin is read from the tab URL
  and checked by the device. Plain `http://` is limited to localhost/127.0.0.1 for development; remote sites need HTTPS.
  Page content is never sent anywhere.
- **Content script** (`content.js`, `document_idle`, top frame only): detects login forms, intercepts submit to offer saving, fills fields.
- **Web Serial** (no manifest permission): the user grants a specific USB device through Chrome's chooser on the manager page (`manager.html`);
  the chooser is filtered to the Espressif, Silicon Labs and WCH USB vendor IDs used by supported boards. The same port is
  used by the Firmware page to flash a verified firmware image to the device's ROM bootloader (esptool-js, bundled).
- **Host permission `https://*/*` also covers** the firmware download above (cross-origin fetch from the extension page).

## Data usage disclosures

- Collects: none. Passwords are held on the user's hardware device, not by the publisher.
- No data is sold, transferred to third parties, or used for unrelated purposes; no remote code (all code ships in the package).
- One user-initiated network request type: the manager's Firmware page ("Check for updates") downloads firmware release
  files (GET only, no data sent, no credentials) from `https://github.com/Kalit-Dev/kalit-firmware/releases/latest/download/`.
  Nothing is downloaded until the user clicks. Before anything is written to the device the extension verifies an Ed25519
  signature over `SHA256SUMS` (public key pinned in the package) and the SHA-256 of every file. No remote code is executed:
  the files are firmware binaries for the user's own device, not extension code.
- Privacy policy: docs/PRIVACY.md (publish it at a public URL and enter that URL in the form).
