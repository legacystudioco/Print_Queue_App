# Flashforge Adventurer 5M Integration

## Status: protocol implemented and unit-tested against a local fake HTTP server; NOT yet verified against the real Adventurer 5M. Do not treat this as working until the manual verification checklist below has actually been run on the bridge host, against the real printer.

`apps/bridge/src/printers/flashforge/` implements the full `PrinterAdapter`
interface over the Adventurer 5M's local HTTP REST API. Flashforge does not
publish an official LAN control API — every protocol detail below comes
from community reverse-engineering, not Flashforge documentation.

## Protocol source

Two independent, cross-checked community sources, both inspected directly
(cloned locally) before writing any code here:

- **[Parallel-7/flashforge-api-docs](https://github.com/Parallel-7/flashforge-api-docs)**
  — wiki pages "Adventurer 5M Series", "Authentication", "Error-Codes",
  "State-Machines", plus the machine-readable OpenAPI-style spec
  `endpoints/endpoints_5m_3.2.7.yaml`. Primary source for exact endpoint
  paths, request/response JSON shapes, and the HTTP error-code table.
- **[GhostTypes/ff-5mp-api-py](https://github.com/GhostTypes/ff-5mp-api-py)**
  — a maintained Python reference client for the same printer family.
  Cross-checked for exact HTTP header names on `/uploadGcode`, the
  firmware-version gate between the "legacy" and "modern" `/printGcode` /
  `/uploadGcode` payload shapes, and the `code: 0 | 200` = success /
  `code: 3` = unauthorized envelope convention.

No Node.js package exists (checked npm and GitHub) that implements this
exact printer/firmware family over HTTP — the closest hits
(`flashforge-finder-api`, `01F0/flashforge-finder-api`) target the much
older Finder/Adventurer 3 TCP-only protocol, not the 5M's HTTP API. Per
the project's protocol-sourcing policy, this integration is therefore a
from-scratch, protocol-isolated client (`FlashforgeLanClient`) rather than
a wrapped third-party dependency — see "Why HTTP only, no TCP" below for
why the surface area needed is small enough that this is a reasonable, low
risk choice.

## Firmware compatibility note (read this before deploying)

The sources above are **primary-validated against firmware 3.2.7**. This
deployment's confirmed printer firmware is **5.1.8-2.2.3** — not the same
string, and not independently verified against these docs.

The reference client (`ff-5mp-api-py`) determines "legacy vs modern"
`/printGcode` / `/uploadGcode` payload format by splitting the firmware
version string on `-` and comparing the dotted segments against the
threshold `3.1.3`:

```python
self.firmware_ver = info.firmware_version.split("-")[0]  # "5.1.8-2.2.3" -> "5.1.8"
# 5.1.8 > 3.1.3  ->  "modern" (extended) payload format
```

`"5.1.8-2.2.3"` takes exactly the dash-separated shape this logic expects,
and `5.1.8` unambiguously resolves to **modern** — so `FlashforgeLanClient`
always uses the modern payload shapes (see below). This is a confident
inference from a documented, tested code path, **not** a live confirmation
against 5.1.8-2.2.3 itself. Treat the whole integration as unverified until
`pnpm --filter bridge diagnose:printers` and
`pnpm --filter bridge diagnose:flashforge-upload` have both been run
successfully against the real printer (see checklist below).

## Why HTTP only, no TCP

The Adventurer 5M exposes two local channels:

| Protocol | Port | Auth |
|---|---|---|
| HTTP REST | 8898 | `serialNumber` + `checkCode` |
| TCP (legacy G/M-code) | 8899 | none (session-based `M601 S1`/`M602`) |

The wiki's own "Recommended Client Strategy" section says to use HTTP for
status and all standard control (start/pause/cancel/upload), reserving TCP
for things HTTP can't do (raw motion control, homing, manual extrusion) —
none of which this integration needs. Every operation Print Queue requires
— status, upload, start, pause, resume, cancel — has a documented HTTP
endpoint, so `FlashforgeLanClient` never opens a TCP/8899 connection at
all. This also keeps the implementation smaller and avoids a second,
unauthenticated, session-locking protocol surface.

## Endpoints used

All requests are `POST http://<FLASHFORGE_HOST>:<FLASHFORGE_PORT><path>`
with `serialNumber`/`checkCode` for authentication (JSON body for most
endpoints; HTTP headers for `/uploadGcode`, per the documented convention).

| Endpoint | Purpose | Used by |
|---|---|---|
| `/detail` | Full status (state, progress, temps, active filename) | `getStatus()`, `testConnection()` |
| `/uploadGcode` | Multipart upload; `printNow` header controls whether it also starts | `uploadPrintFile()` — always sends `printNow: "false"` |
| `/gcodeList` | List files in `/data` | Post-upload delivery confirmation |
| `/printGcode` | Start an already-uploaded file by name | `startPrint()` |
| `/control` (`jobCtl_cmd`) | pause / continue / cancel the active job | `pausePrint()` / `resumePrint()` / `cancelPrint()` |

Response envelope: `{ "code": number, "message": string, ... }`, where
`code === 0 || code === 200` means success. Documented failure codes:
`3` = unauthorized (bad serial/check code), `4` = not found, `5` = busy;
anything else is treated as a generic protocol error. See
`apps/bridge/src/printers/flashforge/flashforgeErrors.ts`.

## Capabilities

```ts
{
  canUploadFile: true,
  canStartPrint: true,
  canPause: true,
  canResume: true,
  canCancel: true,
  canReportProgress: true,
  canReportTemperatures: true,
  supportsDeliveryOnly: true,
}
```

Every operation the shared `PrinterAdapter` interface defines is
implemented — nothing returns `unsupported_operation` for this brand today.

## Deliver-only vs. start-now

- **`start_print`** (the existing "Start Next" flow, unchanged for both
  brands): download → `uploadPrintFile()` (uploads with `printNow: false`)
  → `startPrint()` (a separate `/printGcode` call). This is the fully
  bridge-tracked path: job goes `command_pending → downloading →
  uploading_to_printer → starting → printing`, and `StatusReporter`
  eventually detects completion the same way it does for Bambu.
- **`deliver_print`** (new, backend/adapter-only for now — no Queue UI
  change; see `apps/bridge/src/handlers/deliverPrint.ts`): download →
  `uploadPrintFile()` only, never calls `startPrint()`. The job returns to
  `ready` (a new `uploading_to_printer -> ready` state-machine edge) instead
  of continuing to `starting`/`printing`. This matches "upload now, start
  later from the printer screen or FlashForge's software" — if someone
  starts it manually from the touchscreen at that point, Print Queue has no
  way to see that (the same limitation Bambu already has for anything
  started outside its own tracked `start_print` command); a later
  `start_print` command re-uploads (safe — it just overwrites the
  same-named file) and starts it through the normal tracked path.

## Retry / idempotency notes

- Re-uploading the same file name is safe — the printer just overwrites it,
  there's no append/versioning behavior to worry about.
- A `/printGcode` call that times out or can't reach the printer (network
  level — `FLASHFORGE_UNREACHABLE`/timeout, not a confirmed rejection) is
  treated as **outcome unknown**, not a confirmed failure:
  `FlashforgePrinterAdapter.startPrint()` queries `/detail` once before
  giving up, and if the printer is already printing the exact file that was
  requested, reports success instead of retrying blindly. A confirmed
  rejection from the printer (auth/busy/not-found/protocol error) is
  reported as a real failure immediately, no retry.
- Upload success is never taken on the upload call's word alone: after
  `/uploadGcode` returns success, the adapter calls `/gcodeList` and
  confirms the sanitized filename is actually present before reporting
  delivery success (`FLASHFORGE_UPLOAD_UNCONFIRMED` if it isn't).
- A crashed bridge never silently re-executes a `deliver_print`/`start_print`
  command: `recovery.ts` marks any command left `claimed`/`processing` by
  this bridge as `failed` on the next startup rather than retrying it. A
  human must issue a brand-new command (new `idempotency_key`) to try
  again, and re-uploading is safe (overwrite, not append) if they do.
  `claim_next_printer_command`'s `FOR UPDATE SKIP LOCKED` claim additionally
  prevents the same command row from ever being processed twice
  concurrently. Verified: if the bridge crashes *after* `deliver_print`
  already moved the job to `ready` but *before* marking its own command row
  `completed`, recovery only re-fails commands/jobs still in an **active**
  pipeline state (`command_pending`/`downloading`/`uploading_to_printer`/
  `starting`/`printing`) — `ready` is not in that set, so an
  already-successfully-delivered job is never incorrectly flipped back to
  `failed` on restart.

## Lifecycle verification — deliver_print

Confirmed by reading the actual transition code (`jobStatus.ts`,
`handlers/deliverPrint.ts`, `statusReporter.ts`) and by the state-machine
test in `packages/shared/src/state-machine.test.ts`:

- The added `uploading_to_printer -> ready` edge is **additive only** — every
  existing edge Bambu's `start_print` pipeline uses
  (`uploading_to_printer -> starting -> printing -> completed/failed`)
  is unchanged. Bambu never reaches `deliver_print`'s code path at all
  (nothing creates that command type for a Bambu job today).
- A `deliver_print` job moves `command_pending -> downloading ->
  uploading_to_printer -> ready` and stops there — it can never reach
  `completed` through this path (no code transitions a job directly from
  `uploading_to_printer`/`ready` to `completed`).
- `deliverPrint.ts` never sets `printers.current_job_id` — only
  `start_print`'s successful-start path and its manual-fallback path do
  that (see `startPrint.ts`). Since `StatusReporter.reconcileJob()` only
  acts on the printer's *current* `current_job_id`, and only when that
  job's own status is already `printing`, a delivery-only job is
  structurally invisible to the completion-detection/notification path —
  **completion notifications cannot fire from a delivery alone**, verified
  by `handlers/deliverPrint.test.ts`'s assertion that `current_job_id`
  stays `null` after a successful delivery.
- A failed or ambiguous-outcome upload always lands the job in `failed`
  (see `failJobFromAnyActiveState` in `jobStatus.ts`, shared with
  `start_print`) — there is no separate "uncertain" status; delivery either
  visibly succeeds (upload accepted **and** confirmed via `/gcodeList`) or
  the job fails, never a silent "maybe."

**Known, accepted gap — not fixed here:** if a person starts the delivered
file manually from the printer's own touchscreen (the documented, intended
use of `deliver_print`), Print Queue has no mechanism to correlate that
manual action back to the job that delivered it — not while the bridge is
running, and not after a bridge restart. Nothing currently persists a
durable `job_id -> remote_filename` index that `StatusReporter` consults
against the printer's live `printFileName`. This is a scope-limited,
consciously-not-implemented gap (adding that correlation would be a new
feature, out of scope for this verification pass), and it is **not a
regression** — Bambu has the identical limitation today for anything
started outside Print Queue's own tracked `start_print`/manual-fallback
flow (e.g. a file started directly from Bambu Studio). The one thing this
bridge *can* tell you, via `getStatus()`'s `currentFileName` field
regardless of job correlation, is what the printer says it's currently
printing — useful for a human glancing at the Queue column, not for
automatic job-state reconciliation.

## Typed errors

`apps/bridge/src/printers/flashforge/flashforgeErrors.ts` defines
`FLASHFORGE_UNREACHABLE`, `FLASHFORGE_AUTH_FAILED`,
`FLASHFORGE_UPLOAD_FAILED`, `FLASHFORGE_UPLOAD_UNCONFIRMED`,
`FLASHFORGE_FILE_NOT_FOUND`, `FLASHFORGE_BUSY`, `FLASHFORGE_START_FAILED`,
`FLASHFORGE_PROTOCOL_ERROR`, `FLASHFORGE_UNSUPPORTED_OPERATION` as an
internal `FlashforgeProtocolError.code`, normalized at the adapter boundary
onto the shared `PrinterAdapterErrorCode` union (`normalizeFlashforgeError`)
— the same two-layer pattern `printers/bambu/errors.ts` uses for Bambu.

## Environment variables

See `apps/bridge/.env.example`. Only used for a printer row whose `brand`
is `flashforge`; a bridge host with only a Bambu printer never needs these.

| Variable | Required | Notes |
|---|---|---|
| `FLASHFORGE_HOST` | yes | LAN IP — must stay stable (DHCP reservation, see below) |
| `FLASHFORGE_PORT` | no (default `8898`) | |
| `FLASHFORGE_SERIAL_NUMBER` | yes | Printer's serial number (Settings/About on the touchscreen) |
| `FLASHFORGE_ACCESS_CODE` | yes, secret | The printer's "Check Code" (Settings/Network) |
| `FLASHFORGE_REQUEST_TIMEOUT_MS` | no (default `10000`) | Status/control calls |
| `FLASHFORGE_UPLOAD_TIMEOUT_MS` | no (default `120000`) | File upload, separately timed since it can be large/slow |
| `FLASHFORGE_PRINT_START_MODE` | no (default `auto`) | `auto` \| `manual` \| `auto_with_manual_fallback` — same semantics as `BAMBU_PRINT_START_MODE`, but `/printGcode` gives an unambiguous synchronous success/failure response (unlike Bambu's fire-and-forget MQTT + ACS ambiguity), so `auto` is safe here |

None of these are committed with real values anywhere in this repo —
`.env.example` leaves them blank, matching the existing convention for
Bambu's own credentials.

### Credential disambiguation — Check Code vs. Flash Code (read before setting `FLASHFORGE_ACCESS_CODE`)

The Adventurer 5M's touchscreen and box/manual expose **more than one**
code, and they are not interchangeable:

| Term(s) seen on the printer | What it's actually for | Used by this bridge? |
|---|---|---|
| "Check Code" / "Verify Code" | LAN HTTP API authentication — sent as `checkCode` with `serialNumber` on every local request (`/detail`, `/control`, `/uploadGcode`, `/printGcode`, `/gcodeList`) | **Yes — this is `FLASHFORGE_ACCESS_CODE`** |
| "Flash Code" / "FlashCloud registration code" / "Registration Code" | Binds the printer to a FlashCloud (Flashforge's cloud/WAN) account, via `/notifyWanBind`; reported back read-only as `flashRegisterCode` in `/detail` | **No — unrelated to LAN control, never sent by this bridge** |
| Serial number | Printer identity, sent alongside the Check Code on every request | Yes — `FLASHFORGE_SERIAL_NUMBER` |

This distinction is confirmed directly in the protocol source (see §1):
`endpoints_5m_3.2.7.yaml`'s `/detail` schema documents `flashRegisterCode`
as a separate field from the `serialNumber`/`checkCode` pair required by
every authenticated endpoint, and the `ff-5mp-api-py` reference client
models `flash_cloud_register_code` as a read-only info field, never as a
credential it sends.

**A code shown as "Flash Code" or a "FlashCloud registration code" on this
printer's screen or box (format typically several uppercase letters, e.g.
`PDNDSW`) is the cloud registration code — do not put it in
`FLASHFORGE_ACCESS_CODE`.** It will not work for LAN authentication and
this integration never uses it for anything.

**To find the actual Check Code** on this printer's firmware, check the
touchscreen menu path documented for this family (Settings → Network, or
Settings → About/Machine Info — the exact submenu can vary slightly by
firmware build; look specifically for a field labeled "Check Code" or
"Verify Code", typically a short numeric string, distinct from the Flash
Code shown elsewhere in the same menus). If it isn't visible under
Network/About, check Machine Info or a dedicated "LAN Mode"/"Wi-Fi
Control" screen. This has not been visually confirmed on this specific
printer as of writing — verify on the real device before setting
`FLASHFORGE_ACCESS_CODE`, and do not guess or reuse the Flash Code as a
substitute.

## Stable IP requirement

The bridge needs `FLASHFORGE_HOST` to keep pointing at the same printer.
Prefer a **DHCP reservation** in the home router (bind the Adventurer 5M's
MAC address to a fixed IP) over a static IP configured on the printer
itself — this survives printer resets/firmware updates without any
re-pairing. If the IP ever does change, the bridge will simply report that
printer as unreachable (`FLASHFORGE_UNREACHABLE`) until `FLASHFORGE_HOST`
is updated to match — it fails safe, not silently.

### One global `FLASHFORGE_HOST` — known limitation, acceptable today

`FLASHFORGE_HOST`/`FLASHFORGE_PORT`/`FLASHFORGE_SERIAL_NUMBER`/`FLASHFORGE_ACCESS_CODE`
are single, bridge-process-wide environment variables — they are **not**
looked up per physical printer row. This mirrors the existing Bambu
pattern (`BAMBU_PRINTER_IP` etc. are equally global), not something new
introduced for Flashforge.

This is safe **only** because `uq_printers_brand` (migration
`0010_printer_brand.sql`) enforces at most one physical printer per brand.
If that constraint is ever relaxed to allow multiple Flashforge printers on
the same bridge host, these env vars would need to become per-printer
configuration (e.g. sourced from the `printers` row itself, or namespaced
env vars like `FLASHFORGE_<PRINTER_ID>_HOST`) — `FlashforgePrinterAdapter`
and `FlashforgeLanClient` already take their connection config as a plain
constructor argument, so `printers/factory.ts` is the only place that would
need to change to read per-row values instead of global env vars. This is
called out here explicitly so it isn't rediscovered as a surprise later;
no such change is needed or made now.

## Diagnostics

```bash
pnpm --filter bridge diagnose:printers
```

Read-only: reports reachability, status, and capabilities for every printer
assigned to this bridge host (Bambu and Flashforge together). Never
uploads or starts anything. Exits non-zero if any configured, enabled
printer can't be reached.

```bash
pnpm --filter bridge diagnose:flashforge-upload -- /absolute/path/to/test.gcode --confirm-upload
```

Opt-in: uploads one real local `.gcode` file to the printer **without
starting it**, confirms it via `/gcodeList`, and prints the confirmed
remote filename. Never touches Supabase or a Print Queue job/command.
`--confirm-upload` is required on purpose — this really does write to the
printer's storage.

## Manual verification checklist

Do not claim this integration works until every step below has actually
been run, in order, against the real printer and the real bridge host.

1. `git pull` on the old Mac, then `pnpm install`.
2. `pnpm --filter @print-queue/shared build && pnpm --filter bridge build`
   (or `pnpm --filter bridge dev` for an unbuilt dev run).
3. Add the new variables to `apps/bridge/.env` (`FLASHFORGE_HOST`,
   `FLASHFORGE_SERIAL_NUMBER`, `FLASHFORGE_ACCESS_CODE`). **Do not change
   `BRIDGE_ID`** — migration 0016 assigns SquishPrint to whatever
   `bridge_id` the existing Bambu printer row already uses, so the current
   value (whatever it already is — e.g. `home-p1s-bridge`) is correct as-is.
4. Confirm the old Mac and the Adventurer 5M are on the same subnet.
5. `ping <FLASHFORGE_HOST>` — confirm basic network reachability before
   trusting anything HTTP-level.
6. `pnpm --filter bridge diagnose:printers` — confirm Bambu **and**
   SquishPrint both report `Connection: OK`.
7. Confirm Bambu specifically still connects and reports its usual status
   (regression check — this refactor must not have touched Bambu behavior).
8. Confirm SquishPrint reports reachable/idle in that same run.
9. Get one small, already-sliced, known-safe Adventurer 5M `.gcode` test
   file (e.g. a small calibration cube) onto the old Mac.
10. `pnpm --filter bridge diagnose:flashforge-upload -- /path/to/test.gcode --confirm-upload`
11. Confirm the diagnostic reports the file present in the printer's file
    list (step 3 of that script's output).
12. **Do not start it automatically** during this first test.
13. Start the uploaded file manually from the printer's own touchscreen.
14. Confirm status/progress starts appearing in Print Queue's Flashforge
    column shortly after (within one `HEARTBEAT_INTERVAL_MS`).
15. Let it finish (or cancel it) and confirm completion is recorded
    correctly — but note: since this print was started manually from the
    touchscreen rather than through a `start_print` command, Print Queue
    has no job to reconcile it against (this is expected — see
    "Deliver-only vs. start-now" above). This step is really about
    confirming the *status reporting* (state/progress/temps) is accurate,
    not about job completion tracking.
16. Only after 1–15 look right: queue a real job for SquishPrint in Print
    Queue and use the normal Start Next flow (`start_print` command) —
    this is the fully-tracked path; confirm the job transitions through to
    `completed` on its own once the print finishes.
17. Confirm Bambu remains fully operational throughout all of the above —
    run a status check (`diagnose:printers` again, or watch its Queue
    column) after step 16 to be sure the Flashforge worker never affected it.

## Risks specific to firmware 5.1.8-2.2.3

- The exact `/printGcode` and `/uploadGcode` payload shape has only been
  confirmed correct for firmware 3.2.7; this printer's 5.1.8-2.2.3 is
  inferred (not confirmed) to need the same "modern" shape via the
  version-gate logic described above. If the real printer rejects a
  request that looks correct per this doc, capture the raw response body
  (the bridge logs the redacted request but not the full response body by
  default) and compare against `endpoints_5m_3.2.7.yaml`.
- `/detail`'s `status` string values are documented from 3.2.7; if
  5.1.8-2.2.3 reports a status string not in `STATUS_MAP`
  (`FlashforgePrinterAdapter.ts`), it falls back to `unknown` rather than
  guessing — check the logged `raw.rawStatus` field and add it to the map
  once confirmed.
- No physical verification has occurred as of writing this integration.
  Everything above the LAN client (adapter status mapping, capability
  flags, retry/idempotency logic) is unit-tested against a fake local HTTP
  server, not the real firmware.
