# Bambu Lab P1S Integration

## Status: connection, status, temperature, and AMS reporting verified against real hardware

`apps/bridge/src/printers/bambu/` implements the full `PrinterAdapter`
interface. Bambu Lab does not publish an official local API — every
protocol detail below comes from community reverse-engineering (projects
like `bambulabs_api`, `bambu-connect`, and various Home Assistant
integrations), not from Bambu documentation, but the connection and
status-reporting path has now been run against a real P1S and confirmed
correct end to end (see "Verification results" below). File upload and
starting a print remain unverified against hardware — see the checklist.

**LAN Only Mode does NOT need to be enabled.** The printer's local MQTT
API (port 8883) and FTPS API (port 990) are always on, independent of
that setting — LAN Only Mode only controls whether the printer *also*
keeps its cloud connection (Bambu Handy, remote access) active. This was
confirmed directly: the adapter connected, authenticated, and correctly
read live status/AMS/temperature data from a P1S with LAN Only Mode
**off** and cloud connectivity untouched. Earlier drafts of this doc
incorrectly suggested enabling LAN Only Mode as a prerequisite — that was
wrong and has been corrected.

If you want to test end-to-end without touching a real printer, run the
bridge with `PRINTER_ADAPTER=mock` instead — the mock adapter exercises
the entire queue → command → bridge → "printer" → completion pipeline,
which is how this application was originally built and tested.

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
| Start print | `{"print":{"command":"project_file","param":"Metadata/plate_1.gcode","url":"file:///sdcard/<file>", ...}}` | `startPrintCommand.ts` | ⚠️ not yet exercised |
| Pause/resume/stop | `{"print":{"command":"pause"\|"resume"\|"stop"}}` | `BambuP1SPrinterAdapter.ts` | ⚠️ not yet exercised |
| File transfer | Implicit FTPS on port `990`, username `bblp`, password = access code, uploaded to `/` | `fileUpload.ts` | ⚠️ not yet exercised |

The ⚠️ rows are structurally complete and type-check/build, but were
deliberately not exercised yet because doing so means actually starting a
print — do that deliberately (see checklist steps 4-6 below), not as a
side effect of routine testing.

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
{"level":"info","msg":"Using BambuP1SPrinterAdapter — connection, status, temperature, and AMS reporting are verified against a real P1S. File upload and start-print are structurally complete but not yet exercised against hardware — see docs/bambu-integration.md."}
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

Steps 1-3 are done (see above). Do 4-6 deliberately, with the printer
idle and nothing you care about on the plate:

4. **File upload** — with a small test `.gcode.3mf`, exercise
   `uploadPrintFile()` (e.g. via a scratch script, or just queue a real
   job and watch it through to the `uploading_to_printer` step) and
   confirm the file actually appears on the printer (check its screen /
   SD card browser). Confirm the destination path in `fileUpload.ts`
   (currently the FTP root) is where the printer expects it.
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
