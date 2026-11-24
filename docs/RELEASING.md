# Release checklist

1. Version: set the same `version` in `package.json` and `public/manifest.json` (the package script fails if they differ).
2. `pnpm package` — runs typecheck, tests, build and writes `release/kalit-extension-v<version>.zip`
   (no source maps). Check the zip listing: `unzip -l release/*.zip`.
3. Note: `src/shared/api/device/interop.test.ts` is skipped unless the firmware binary exists
   (`pio run -e native_app` in `../kalit-firmware`, or `KALIT_FIRMWARE_DIR`). Run it with the binary before a release.
4. Clean-profile test: start Chrome with a fresh profile (`--user-data-dir=/tmp/kalit-test`), load the zip contents
   unpacked, and run the manual QA from the README ("Ulanishni toza tekshirish"): USB grant, pairing, unlock, autofill,
   save prompt, import, backup/restore, reconnect after unplugging, browser restart. Check no errors on `chrome://extensions`.
5. Store assets: screenshots 1280x800 (up to 5), small promo tile 440x280, description text (`docs/store-listing.md`),
   icon 128x128, public privacy policy URL (`docs/PRIVACY.md`), permission justifications (`docs/PERMISSIONS.md`).
6. Upload the zip in the Chrome Web Store dashboard, fill the privacy form from `docs/PERMISSIONS.md`, submit for review.
7. Tag the release in git (`v<version>`) and attach the zip to the GitHub release.

## Firmware update (Firmware page)

- The extension only flashes releases signed with the Ed25519 key whose public half is `RELEASE_PUBLIC_KEY_HEX` in
  `src/shared/api/firmware/signing-key.ts`. While it is all zeros the update button is disabled (fail-closed): generate the
  key as described in `../kalit-firmware/docs/RELEASE-SIGNING.md`, put the public key there, and release a new extension version.
- Each firmware tag needs these assets: `<env>-{bootloader,partitions,boot_app0,firmware}.bin`, `<env>-flash.json`,
  `SHA256SUMS`, `SHA256SUMS.sig` (the tag-triggered workflow in kalit-firmware builds, signs and uploads them).
- Before a release, with a built `../kalit-firmware/release/assets`, `pnpm test` also checks the real asset format.
- Flashing itself (esptool-js on real ESP32 DevKit / C3) is not covered by automated tests: do the manual check below.
  Update from firmware N-1 to N on hardware, confirm the vault entries survive and the device reconnects (locked).
