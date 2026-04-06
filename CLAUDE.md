# Printly — Print Agent

## What this repo is
Electron desktop app (macOS tray app) that listens on `localhost:7799`, receives auction wins from the Chrome extension, records them to the Printly API, and prints thermal labels.

**Run:** `npm start`
**Tray app — no window, lives in macOS menu bar**

## The three-repo system
| Repo | Path | Role |
|------|------|------|
| Website | `~/printly-website-main` | Next.js dashboard + all API routes |
| **This repo** | `~/printly-agent` | Electron app, listens on localhost:7799 |
| Chrome extension | `/tmp/printly-extension` | Detects wins on Whatnot, POSTs to agent |

## Data flow
```
Chrome extension → POST localhost:7799/win → this app → POST printlyapp.me/api/agent/win → Supabase
                                                       → printLabel() → DYMO/thermal printer
```

## Key files
```
src/main.js    — HTTP server (port 7799), tray, auth IPC, win handler, notifications
src/printer.js — DYMO macOS path (printToPDF → lp), standard path (webContents.print)
src/labels.js  — HTML label generation for all sizes
src/login.html — sign-in window loaded by Electron
src/preload.js — contextBridge for login window IPC
```

## HTTP endpoints (localhost:7799)
- `GET /status` — returns `{ ok, signed_in, email, printer, version }`
- `POST /win` — receives win, records to API, prints label

## Win payload shape
```json
{ "buyer_name": "...", "item_name": "...", "price": 9.99, "source": "ws" }
```
Sources: `ws` (WebSocket/post-payment), `dom` (DOM/pre-payment), `reprint`, `test`

## Label sizes supported
`2x3`, `4x6`, `1x3`, `2x1`, `2.25x1.25` (jewelry), `1.125x3.5`, `1x2.125`, `1.25x2.25`, `thermal-58`

## DYMO printing on macOS
- Uses `printToPDF` → temp PDF → `lp -d printerName -o PageSize=wXXhXX file.pdf`
- `printToPDF pageSize` expects **INCHES** (`dims.width / 25400`) — NOT microns
- CUPS paper names auto-detected via `lpoptions`, fallback map in `DYMO_PAPER_FALLBACK`

## Important rules
- **All label text must be `color:#111`** — thermal printers have no color ink, light grays print invisible
- `wait_for_payment` setting: skip `dom`-source wins (pre-payment) when enabled
- Order counter stored locally in electron-store AND synced from backend `last_order_number` on startup + every 60s heartbeat
- Heartbeat runs every 60s: sends printer list, gets fresh settings + order number back
- Notifications: "Label printed ✓", "Print failed", "No printer configured"

## Auth
- Token stored in electron-store, sent as `Authorization: Bearer TOKEN`
- Login window (`src/login.html`) uses email → 6-digit OTP flow via API
- Session validated on startup via `/api/auth/validate-session`

## Settings (from API, refreshed every 60s)
```
printer_name, label_size, auto_print, wait_for_payment, show_price,
show_timestamp, copies, brand_logo_url, brand_accent_color, brand_seller_name
```

## API base
`https://printlyapp.me` (configurable via `PRINTLY_API_URL` env var)
