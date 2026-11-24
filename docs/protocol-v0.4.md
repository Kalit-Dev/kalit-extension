# Kalit protocol v0.4 (delta over v0.3)

Transport, handshake, framing and all v0.2/v0.3 commands are unchanged. Firmware 0.3.0 implements this delta.

## Entry kinds

`EntryMeta` gains `kind: "web" | "secret"` (host parses it with default `"web"`, so firmware without the field still works).

- `web`: as before (`site` is a registrable domain, filled via GET_CREDENTIAL with origin check).
- `secret`: not bound to a website. `site` is `""`; `title` (1..64 bytes) is the display name. `username` may be `""`.

Both kinds share one vault, one 32-entry capacity and the 160-byte metadata budget (`site+username+title`).

## ADD_ENTRY

Web params are unchanged (`kind` may be omitted or `"web"`). Secret variant:

```
{ kind: "secret", title: str(1..64), username?: str(0..256),
  password?: str(1..512), generateLength?: int(12..64) }   // one of password/generateLength required
-> { entry: EntryMeta }
```

No `origin`/`site`. Confirm: action `save`, `ConfirmInfo.site = title`, `username`. Errors: capacity, budget or invalid title/password -> INVALID_STATE.

## REVEAL_SECRET (new, confirm)

```
{ id: str } -> { username: str, password: str }
```

Only for secret entries; the user confirms on the device (`ConfirmAction` gains `"reveal"`, `ConfirmInfo.site = title`).
Errors: LOCKED (vault locked), NOT_FOUND (unknown id), INVALID_STATE (web entry), USER_REJECTED / TIMEOUT.

The host never stores the result: it is returned to the caller of `revealSecret(id)` only and is not part of the engine snapshot or `entries`.

## Changes to existing commands

- `GET_CREDENTIAL` on a secret entry -> `ORIGIN_MISMATCH` (device is the authority; host still sends the request).
- `UPDATE_ENTRY` / `DELETE_ENTRY` work for secrets with the same params; confirm `site` is the title. A secret's title cannot be emptied (INVALID_STATE). On update the confirm `site` is the title before the change.
- `CHANGE_MASTER` preserves `kind`.

## Host API

`useDevice.addEntry(Omit<AddWebEntryParams,"site"> | AddSecretEntryParams)`, `useDevice.revealSecret(id): Promise<{username, password}>`; engine op `revealSecret`.
