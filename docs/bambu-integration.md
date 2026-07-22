# Bambu Lab P1S Integration

## Status: connection, status, temperature, and AMS reporting verified against real hardware. Starting a print is blocked by Bambu's Access Control System while in Cloud Mode — see below.

`apps/bridge/src/printers/bambu/` implements the full `PrinterAdapter`
interface. Bambu Lab does not publish an official local API — every
protocol detail below comes from community reverse-engineering (projects
like `bambulabs_api`, `OpenBambuAPI`, `bambu-connect`, and various Home
Assistant integrations), not from Bambu documentation, but the connection
and status-reporting path has now been run against a real P1S and
confirmed correct end to end (see "Verification results" below).

**Reading is unaffected by LAN Only Mode.** The printer's local MQTT API
(port 8883) and FTPS API (port 990) are always on for connecting and
reading status, independent of that setting — LAN Only Mode only controls
whether the printer *also* keeps its cloud connection (Bambu Handy, remote
access) active. This was confirmed directly: the adapter connected,
authenticated, and correctly read live status/AMS/temperature data from a
P1S with LAN Only Mode **off** and cloud connectivity untouched.

**Sending write commands (start/pause/resume/cancel) is a different
story — see "Print start is blocked by ACS" immediately below.** That
part of this doc was wrong in earlier drafts, which assumed (incorrectly)
that the same "reads are unaffected" conclusion also applied to writes.

If you want to test end-to-end without touching a real printer, run the
bridge with `PRINTER_ADAPTER=mock` instead — the mock adapter exercises
the entire queue → command → bridge → "printer" → completion pipeline,
which is how this application was originally built and tested.

## Print start is blocked by Bambu's Access Control System (ACS) while in Cloud Mode

**Symptom:** the bridge logs `Uploaded print file to printer via FTPS` →
`Published start-print command, waiting for printer to acknowledge via
status…` → `Timed out waiting for the printer to acknowledge the start
command`, and the printer's own screen shows:

> MQTT Command verification failed. Please update Studio (including the
> network plugin) or Handy to the latest version...

**This is not a payload bug, an auth-credential bug, or a bridge bug.**
The `project_file` payload this bridge sends matches the
[OpenBambuAPI spec](https://github.com/Doridian/OpenBambuAPI/blob/main/mqtt.md#printproject_file)
field-for-field, including the `url: "ftp:///<filename>"` convention for a
file sitting at the root of the SD card (exactly where `fileUpload.ts`
puts it). The MQTT connection itself succeeds (this is how status
reporting keeps working). The printer is deliberately rejecting the
*command*, and telling you so on-screen with a dedicated, official error:
Bambu's own wiki documents this exact message as
[`HMS_0500-0500-0001-0007`](https://wiki.bambulab.com/en/x1/troubleshooting/hmscode/0500_0500_0001_0007):
"MQTT Command verification failed, please update Studio or Handy."

**Root cause:** in early 2025 Bambu Lab rolled out an **Access Control
System (ACS)** to all current firmware (P1-series from `01.08.02.00`
onward; the printer here is on `01.10.00.00`, well past that). While a
printer is in **Cloud Mode**, ACS blocks "write" commands — starting a
print, pausing/resuming/canceling, heating, movement — from any client
that isn't cryptographically-signed Bambu Studio/Handy traffic, regardless
of whether the payload is well-formed. Reads (status/telemetry) are not
affected, which is exactly why steps 1–3 below verified cleanly while
start-print does not. Bambu Lab's own explanation of the change
([blog.bambulab.com — "Updates and Third-Party Integration with Bambu
Connect"](https://blog.bambulab.com/updates-and-third-party-integration-with-bambu-connect/))
confirms third-party tools are now expected to go through **Bambu
Connect**, a licensed desktop authorization broker for GUI slicers
(Bambu Studio, OrcaSlicer) — it is not a published API and has no
headless/server mode a bridge process could call into.

**The only documented way to restore local write access on current
firmware, without a firmware downgrade, is enabling LAN-only Mode +
Developer Mode together** (the Developer Mode toggle only appears once
LAN-only Mode is turned on; the two are not independent). This is not a
jailbreak or unofficial hack — Bambu Lab added Developer Mode themselves,
specifically in response to community backlash against ACS, as the
sanctioned way to keep local/third-party control working. Once enabled,
it "disables the authorization and authentication functions" for that
printer and the existing `project_file` payload in this codebase should
work unchanged. The trade-off: LAN-only Mode drops the printer's cloud
connection, so Bambu Handy loses remote (off-LAN) access to it — this is
an explicit, unavoidable trade Bambu built into the current firmware, not
something this bridge can route around. Evidence for all of the above,
gathered July 2026 (avoid older 2023/early-2024 sources — they predate
ACS entirely):

- [Bambu Lab Wiki — `HMS_0500-0500-0001-0007`](https://wiki.bambulab.com/en/x1/troubleshooting/hmscode/0500_0500_0001_0007) (official, matches the on-screen message verbatim)
- [Bambu Lab Wiki — Enable Developer Mode](https://wiki.bambulab.com/en/knowledge-sharing/enable-developer-mode) (official steps; Developer Mode is reached from inside LAN-only Mode settings)
- [blog.bambulab.com — Updates and Third-Party Integration with Bambu Connect](https://blog.bambulab.com/updates-and-third-party-integration-with-bambu-connect/) (Bambu's own account of the ACS/Bambu Connect rollout)
- [SimplyPrint Helpdesk — Bambu Lab security firmware "Authorization Control System" update](https://help.simplyprint.io/en/article/bambu-lab-security-firmware-authorization-control-system-update-will-i-still-be-able-to-use-simplyprint-y2uoor/) (states the P1-series firmware threshold `01.08.02.00`, and that only Developer Mode+LAN-only or a firmware downgrade preserve third-party write access — no Cloud Mode option exists)
- [SimplyPrint Helpdesk — LAN-only mode and Developer Mode, how to enable](https://help.simplyprint.io/en/article/bambu-lab-lan-only-mode-and-developer-mode-how-to-enable-xa0hch/) ("printers in Cloud mode block third-party write actions; printers in LAN-only Mode with Developer Mode do not")
- [OpenBambuAPI — mqtt.md](https://github.com/Doridian/OpenBambuAPI/blob/main/mqtt.md) (payload reference used to confirm this bridge's `project_file` payload is already correct)
- Community corroboration into mid-2026: [Hackaday, June 2026 — "Bambuddy Says Bye To Bambu Lab Cloud Services"](https://hackaday.com/2026/06/13/bambuddy-says-bye-to-bambu-lab-cloud-services/) and the [maziggy/bambuddy](https://github.com/maziggy/bambuddy) project both describe LAN-only + Developer Mode as the still-current, still-necessary path for any self-hosted/third-party controller

**No code change in this repo can fix this.** ACS is enforced by the
printer's firmware at the command-authorization layer, not by anything
this bridge sends. There is deliberately no attempt here to replicate or
forge Bambu Connect's signing/authorization mechanism — besides being
unverifiable without Bambu's private signing keys, that would mean
circumventing the printer's access-control system rather than integrating
with it.

**What this means for you:** to make the MQTT start command itself succeed
(and `pausePrint`/`resumePrint`/`cancelPrint`, which hit the same ACS gate)
against this P1S on firmware `01.10.00.00`, enable **LAN-only Mode** and
then **Developer Mode** on the printer itself (touchscreen: Settings →
network/general settings; see the Bambu wiki link above for the exact
menu path). No bridge code changes are required once that's done — the
existing MQTT payload already matches spec. If keeping Bambu Handy's
remote/off-LAN access for this printer is a hard requirement, that is a
genuine product trade-off Bambu's current firmware does not offer a way
around; the printer can still be monitored (status reads keep working)
from Cloud Mode, just not started remotely over MQTT.

## Living with ACS without touching printer settings: `BAMBU_PRINT_START_MODE`

If you don't want to flip LAN-only/Developer Mode — e.g. you want to keep
Bambu Handy's remote access — the bridge does not have to treat an
ACS-blocked start command as a failed job. The FTPS upload (which ACS does
*not* block) already gets the file onto the printer; a human can press
"Print" from Bambu Handy or Bambu Studio for the last step. `startPrint()`
in `apps/bridge/src/handlers/startPrint.ts` supports three modes via the
`BAMBU_PRINT_START_MODE` environment variable:

| Mode | Behavior |
|---|---|
| `auto` | Original behavior. Uploads, then sends the MQTT start command; a rejection (ACS or otherwise) fails the job. Use this once Developer Mode is enabled and you expect auto-start to actually work. |
| `manual` | Uploads only — never sends the MQTT start command at all. Always ends in "ready on printer, waiting for a human," never a job failure (unless the upload itself fails). |
| `auto_with_manual_fallback` (**default**) | Uploads, then still tries the MQTT start command (harmless if it's rejected). If it's actually accepted, the job proceeds exactly like `auto`. If it's rejected or times out — the ACS case on Cloud Mode — the job is **not** marked failed; it's marked as needing a manual start, same as `manual` mode's outcome. |

A failure at or before the FTPS upload (download failure, invalid file,
FTPS connection/auth/upload failure, missing printer) is **always** a hard
job failure in every mode — there's nothing on the printer for a human to
start. Only a failure to *auto-start after the upload has already
succeeded* is eligible for the manual-start treatment.

**How this is represented, without a database migration:** a job waiting
for a manual start reuses the existing `printing` job status (chosen
specifically because it's the one status `starting` can legally transition
to, and because `StatusReporter.reconcileJob` — which watches jobs with
status `printing` — will still correctly notice and transition it to
`completed`/`failed` once a human actually starts the print and it
finishes, with no further bridge involvement needed). What distinguishes
"genuinely printing" from "uploaded, waiting for a human" is metadata
written to the pre-existing `printer_commands.result` JSONB column (see
`StartPrintCommandResult` in `@print-queue/shared`), not a new status
value:

```json
{
  "remoteFileName": "sunday-batch.gcode.3mf",
  "uploadedAt": "2026-07-22T18:30:00.000Z",
  "startMode": "auto_with_manual_fallback",
  "autoStartAttempted": true,
  "autoStartSucceeded": false,
  "manualStartRequired": true,
  "startFailureReason": "MQTT Command verification failed.",
  "message": "File uploaded successfully, but the printer did not start automatically. Open Bambu Handy or Bambu Studio and start it manually."
}
```

The web app (`apps/web/src/lib/server/data.ts`) reads this back per job
(batched, one query per page load) to compute two UI-only flags —
`manualStartRequired` and `failedBeforeUpload` — that `apps/web/src/components/ui/Badge.tsx`
uses to show "Ready on printer — manual start required" (violet, not red or
green) instead of "Printing", and "Failed (before upload)" instead of a
plain "Failed" where applicable. Nothing about `PrintJobRecord`,
`PrinterCommandRecord`, or the Postgres schema changed.

## What the adapter assumes

| Concern | Assumption | File | Status |
|---|---|---|---|
| Transport | MQTTS (MQTT over TLS) on port `8883` | `connection.ts` | ✅ verified |
| MQTT auth | username `bblp`, password = the printer's local access code | `connection.ts` | ✅ verified |
| TLS cert | Printer presents a self-signed certificate; adapter sets `rejectUnauthorized: false` | `connection.ts` | ✅ verified |
| Status topic | Subscribe `device/{serial}/report`, printer pushes JSON periodically | `mqttStatus.ts` | ✅ verified |
| Status shape | `print.gcode_state`, `print.mc_percent`, `print.nozzle_temper`, `print.bed_temper`, `print.subtask_name` | `mqttStatus.ts` | ✅ verified |
| AMS shape | `print.ams.ams[].tray[]` with `tray_type` (material) and `tray_color` (hex) | `mqttStatus.ts` | ✅ verified |
| Request topic | Publish `device/{serial}/request` | `config.ts`, `startPrintCommand.ts` | ✅ verified (pushall) |
| Full status request | `{"pushing":{"command":"pushall","sequence_id":"0"}}` | `mqttStatus.ts` | ✅ verified |
| Start print | `{"print":{"command":"project_file","param":"Metadata/plate_1.gcode","url":"ftp:///<file>", ...}}` | `startPrintCommand.ts` | ⚠️ payload confirmed correct per OpenBambuAPI spec; blocked end-to-end by ACS in Cloud Mode — see above |
| Pause/resume/stop | `{"print":{"command":"pause"\|"resume"\|"stop"}}` | `BambuP1SPrinterAdapter.ts` | ⚠️ same ACS gate as start print, not yet exercised |
| File transfer | Implicit FTPS on port `990`, username `bblp`, password = access code, uploaded to `/` | `fileUpload.ts` | ✅ verified — file upload is a read/write-to-SD-card operation, not an ACS-gated "print" command, and succeeds in Cloud Mode |

The Start print / Pause-resume-stop rows are structurally complete and
type-check/build. Start print's payload has been cross-checked against
the community OpenBambuAPI spec and is believed correct, but the only way
to *exercise* it against real hardware is with Developer Mode enabled
(see "Print start is blocked by ACS" above) — do that deliberately (see
checklist steps 5-6 below), not as a side effect of routine testing.

## Verification results (real P1S, see below for hardware details)

Run via `pnpm --filter bridge bambu:test-connection`:

```
1. Connect + authenticate
  ✓ Connected

2. Fetch printer status (waiting up to 8s for a report)…
  ✓ Printer status: printing

3. Fetch print state
  ✓ State: printing (56%)
     current file: Turntable_plate_2

4. Fetch temperatures
  ✓ Nozzle: 219.96875°C, Bed: 55°C

5. Fetch AMS status
  ✓ 1 AMS unit(s), 4 tray slot(s)
     AMS 0 / slot 0: empty
     AMS 0 / slot 1: PLA (898989FF)
     AMS 0 / slot 2: PLA (F72323FF)
     AMS 0 / slot 3: PLA (FFFFFFFF)
```

And the full bridge startup sequence (`pnpm bridge:dev`,
`PRINTER_ADAPTER=bambu`) against the same printer:

```
{"level":"info","msg":"Starting bridge","bridgeId":"home-p1s-bridge","adapter":"bambu"}
{"level":"info","msg":"Bound to printer","printerId":"...","printerName":"Workshop P1S"}
{"level":"info","msg":"Using BambuP1SPrinterAdapter — connection, status, temperature, AMS reporting, and FTPS file upload are verified against a real P1S. Start-print is structurally complete and payload-correct but blocked by Bambu's ACS while the printer is in Cloud Mode — see docs/bambu-integration.md."}
{"level":"info","msg":"Running printer connection health check…"}
{"level":"info","msg":"Connected to printer MQTT broker","ip":"192.168.1.157"}
{"level":"info","msg":"✓ Connected"}
{"level":"info","msg":"No stale commands to recover"}
{"level":"info","msg":"Bridge is running","heartbeatIntervalMs":20000,"commandPollIntervalMs":3000}
```

The status-report loop was then confirmed writing live, correct printer
status into Supabase (`printers.status`, `printer_events`) while the
printer was mid-print via Bambu Studio/Handy — the bridge only observes;
it never touched or interfered with that print, since no `printer_commands`
row existed for it.

**Operational note learned during this verification:** don't leave more
than one `pnpm bridge:dev` process running against the same printer —
each instance independently polls and writes status, and multiple stale
instances (e.g. from earlier dev sessions you forgot were still running)
will interleave conflicting status reports. Check
`ps aux | grep "tsx.*src/index.ts"` if status ever looks like it's
flickering between unrelated values, and kill duplicates. Production
deployments (systemd/Docker, see `docs/setup-bridge.md`) don't have this
problem since exactly one instance runs.

## Verification checklist (remaining steps)

Steps 1-4 are done (see above). **Before step 5, enable LAN-only Mode +
Developer Mode on the printer** (see "Print start is blocked by ACS"
above) — otherwise step 5 will time out the same way it did before this
was diagnosed, regardless of anything else. Do 5-6 deliberately, with the
printer idle and nothing you care about on the plate:

5. **Start print** — with the queue/bridge running end-to-end and a real
   job queued, use the Start Next screen once. Watch the bridge's logs
   and the printer's own screen simultaneously. Confirm the print
   actually starts, and that `startPrintCommand.ts`'s "did it start"
   heuristic (polling status for `printing`/`preparing`) correctly
   reflects reality rather than timing out or false-positiving.
6. **Completion detection** — let that print finish (or cancel it) and
   confirm `statusReporter.ts` correctly detects `completed`/`failed` and
   updates the job — without ever auto-starting the next one. (The
   parsing side of this — `FINISH`/`FAILED` gcode_state → job status — is
   already confirmed correct from the read-only verification above; this
   step confirms the write side, i.e. that the bridge actually started
   the job it's now watching.)
7. **Pause/resume/cancel** — exercise each from the printer's own UI and
   from a `pause_print`/`resume_print`/`cancel_print` command, confirming
   both directions agree.
8. **Recovery** — kill the bridge process (`kill -9`) mid-print-start and
   restart it. Confirm `recovery.ts` marks the stuck command/job `failed`
   rather than silently hanging or double-starting the print.

## What's deliberately NOT implemented

- **AMS color detection.** By design — see the product spec. AMS contents
  are always manually entered by whoever queues the print, never read
  from the printer to auto-populate anything. `getAmsStatus()` exists
  purely for the diagnostic script and startup health check; nothing in
  the queue/job pipeline calls it.
- **Automatic reconnection state recovery mid-print.** The MQTT client
  will reconnect (`reconnectPeriod: 5000`) after a connection that was
  previously established drops, but a report missed during a disconnect
  window is simply missed; the next report resyncs state. This is
  acceptable for a status *display*, not for anything safety-critical.
- **Firmware/model variants.** This targets the P1S specifically. An A1,
  X1C, or P1P may have different topic names, payload fields, or lack
  FTPS entirely — do not assume portability without re-verifying.

## Startup health check

The bridge runs a connection health check before starting its
command/status loops (`src/healthCheck.ts`), logging exactly one of:

- `✓ Connected`
- `✗ Cannot reach printer` — host/network unreachable (wrong IP, printer
  off, wrong network, firewalled).
- `✗ Invalid access code` — the printer rejected the MQTT credentials
  specifically as a bad username/password (the username is fixed, so
  this means the access code is wrong).
- `✗ Authentication failed` — the printer rejected the connection for
  another authorization reason.

If the health check fails, the bridge logs the failure and exits(1)
rather than starting loops against a printer it can't reach — see
`docs/troubleshooting.md`.

## If you get stuck

Isolate the failure to one of the four independent pieces: MQTT
connection → MQTT status/AMS parsing → FTPS upload → MQTT start command.
Each has its own module and can be tested in isolation using
`pnpm --filter bridge bambu:test-connection` or a short scratch script
that imports just that module.
