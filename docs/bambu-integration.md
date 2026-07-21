# Bambu Lab P1S Integration

## Status: structurally complete, NOT verified against physical hardware

Everything in `apps/bridge/src/printers/bambu/` implements the full
`PrinterAdapter` interface and will type-check, build, and run. But Bambu
Lab does not publish an official local API — every protocol detail below
comes from community reverse-engineering (projects like `bambulabs_api`,
`bambu-connect`, and various Home Assistant integrations), not from Bambu
documentation. **Do not treat this adapter as production-ready until you
have run through the verification checklist below against a real P1S.**

Until then, run the bridge with `PRINTER_ADAPTER=mock` — the mock adapter
exercises the entire queue → command → bridge → "printer" → completion
pipeline with no physical printer involved, which is how this whole
application was built and tested.

## What the adapter assumes

| Concern | Assumption | File |
|---|---|---|
| Transport | MQTTS (MQTT over TLS) on port `8883` | `connection.ts` |
| MQTT auth | username `bblp`, password = the printer's LAN-only access code | `connection.ts` |
| TLS cert | Printer presents a self-signed certificate; adapter sets `rejectUnauthorized: false` | `connection.ts` |
| Status topic | Subscribe `device/{serial}/report`, printer pushes JSON periodically | `mqttStatus.ts` |
| Status shape | `print.gcode_state` (`IDLE`/`PREPARE`/`RUNNING`/`PAUSE`/`FINISH`/`FAILED`), `print.mc_percent`, `print.nozzle_temper`, `print.bed_temper`, `print.subtask_name` | `mqttStatus.ts` |
| Request topic | Publish `device/{serial}/request` | `config.ts`, `startPrintCommand.ts` |
| Full status request | `{"pushing":{"command":"pushall","sequence_id":"0"}}` | `mqttStatus.ts` |
| Start print | `{"print":{"command":"project_file","param":"Metadata/plate_1.gcode","url":"file:///sdcard/<file>", ...}}` | `startPrintCommand.ts` |
| Pause/resume/stop | `{"print":{"command":"pause"\|"resume"\|"stop"}}` | `BambuP1SPrinterAdapter.ts` |
| File transfer | Implicit FTPS on port `990`, username `bblp`, password = access code, uploaded to `/` | `fileUpload.ts` |

Every one of these is a guess informed by public write-ups, not a
guarantee. Firmware updates can and do change this behavior.

## Verification checklist (do this before relying on `PRINTER_ADAPTER=bambu`)

Run these in order. Stop and fix before moving to the next step — later
steps assume earlier ones actually work.

1. **Enable LAN Only Mode** on the printer (Settings → Network) and note
   the IP address and access code shown on its screen.
2. **MQTT connection** — run `pnpm --filter bridge bambu:test-connection`
   with `BAMBU_PRINTER_IP` / `BAMBU_PRINTER_SERIAL` / `BAMBU_ACCESS_CODE`
   set. Confirm step 1 in its output reports `connected: true`. If not,
   check the IP/access code and that nothing else on the network (a
   firewall, an existing Bambu Studio connection) is blocking a second
   MQTT client.
3. **Status parsing** — confirm step 2 of the script reports a real
   `status` (not `unknown`) with plausible temperatures. If it stays
   `unknown`, the printer is not sending reports, or `mqttStatus.ts`'s
   field names don't match this firmware version — temporarily log the
   raw MQTT payload in `mqttStatus.ts` and compare against the table above.
4. **File upload** — with a small test `.gcode.3mf`, manually exercise
   `uploadPrintFile()` (e.g. via a scratch script or `node --experimental-repl-await`)
   and confirm the file actually appears on the printer (check its screen
   / SD card browser). Confirm the destination path in `fileUpload.ts`
   (currently the FTP root) is where the printer expects it.
5. **Start print** — with the queue/bridge running end-to-end and a real
   job queued, use the Start Next screen once. Watch `docs/troubleshooting.md`'s
   log-reading section and the printer's own screen simultaneously. Confirm
   the print actually starts, and that `startPrintCommand.ts`'s "did it
   start" heuristic (polling status for `printing`/`preparing`) correctly
   reflects reality rather than timing out or false-positiving.
6. **Completion detection** — let a real print finish (or cancel one) and
   confirm `statusReporter.ts` correctly detects `completed`/`failed` and
   updates the job — without ever auto-starting the next one.
7. **Pause/resume/cancel** — exercise each from the printer's own UI and
   from a `pause_print`/`resume_print`/`cancel_print` command, confirming
   both directions agree.
8. **Recovery** — kill the bridge process (`kill -9`) mid-print-start and
   restart it. Confirm `recovery.ts` marks the stuck command/job `failed`
   rather than silently hanging or double-starting the print.

## What's deliberately NOT implemented

- **AMS color detection.** By design — see the product spec. AMS contents
  are always manually entered by whoever queues the print.
- **Automatic reconnection state recovery mid-print.** The MQTT client
  will reconnect (`reconnectPeriod: 5000`), but a report missed during a
  disconnect window is simply missed; the next report resyncs state. This
  is acceptable for a status *display*, not for anything safety-critical.
- **Firmware/model variants.** This targets the P1S specifically. An A1,
  X1C, or P1P may have different topic names, payload fields, or lack
  FTPS entirely — do not assume portability without re-verifying.

## If you get stuck

Isolate the failure to one of the three independent pieces:
MQTT connection → MQTT status parsing → FTPS upload → MQTT start command.
Each has its own module and can be tested in isolation using the
diagnostic script or a short scratch script that imports just that module.
