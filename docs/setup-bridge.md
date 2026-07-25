# Bridge Setup & Deployment

The bridge is a small Node.js service that must run continuously on a
device on the same local network as the printer — a Raspberry Pi, an
always-on mini PC, a NAS, or just a machine you leave running. It never
needs to be reachable from the internet; it only makes outbound
connections (to Supabase, and to the printer's local IP).

## Prerequisites

- Node.js 20+ (or Docker, if using the container option).
- Network access to Supabase (outbound HTTPS/WSS) and to every printer's
  local IP this bridge host is responsible for — MQTTS port 8883 + FTPS
  port 990 for Bambu (see `docs/bambu-integration.md`), HTTP port 8898 for
  Flashforge (see `docs/flashforge-integration.md`).
- One or more `printers` rows in Supabase whose `bridge_id` matches this
  bridge's `BRIDGE_ID` env var (see `docs/setup-supabase.md`). A single
  bridge host can run several printers of different brands concurrently —
  the bridge starts one isolated worker per assigned, enabled printer row
  (see `runtime/BridgeSupervisor.ts`); it does not have to be one process
  per printer.

## Configuration

Copy `apps/bridge/.env.example` to `apps/bridge/.env` and fill in real
values. Start with `PRINTER_ADAPTER=mock` to verify the whole pipeline
before ever pointing it at a real printer. Once ready, run
`pnpm --filter bridge diagnose:printers` to confirm every assigned printer
is actually reachable before trusting `pnpm --filter bridge start`.

## Option 1: Raspberry Pi with systemd

```bash
git clone <your-repo> ~/print-queue-app
cd ~/print-queue-app
corepack enable
pnpm install
pnpm --filter @print-queue/shared build
pnpm --filter bridge build
cp apps/bridge/.env.example apps/bridge/.env   # edit with real values
```

Create `/etc/systemd/system/print-queue-bridge.service`:

```ini
[Unit]
Description=Print Queue Bridge
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/print-queue-app/apps/bridge
EnvironmentFile=/home/pi/print-queue-app/apps/bridge/.env
ExecStart=/usr/bin/node dist/index.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now print-queue-bridge
journalctl -u print-queue-bridge -f   # structured JSON logs
```

## Option 2: Docker Compose

```bash
cp apps/bridge/.env.example apps/bridge/.env   # edit with real values
docker compose -f docker-compose.bridge.yml up -d --build
docker compose -f docker-compose.bridge.yml logs -f
```

`docker-compose.bridge.yml` sets `restart: unless-stopped`, so it survives
reboots and crashes automatically. See the comments in that file re:
`network_mode: host` (needed on Linux for the simplest path to the
printer's LAN IP; not applicable/needed the same way on Docker Desktop).

## Option 3: Windows (Task Scheduler)

1. Install Node.js 20+ from nodejs.org.
2. Open PowerShell in the repo folder and run the same
   `pnpm install && pnpm --filter @print-queue/shared build && pnpm --filter bridge build`
   steps as above.
3. Create `apps/bridge/.env` with real values.
4. Open Task Scheduler → Create Task:
   - General: "Run whether user is logged on or not", enable "Run with
     highest privileges".
   - Triggers: "At startup".
   - Actions: Program `node.exe`, arguments `dist\index.js`, start-in
     `C:\path\to\print-queue-app\apps\bridge`.
   - Settings: enable "Restart the task if it fails", every 1 minute, up
     to a large number of attempts.

## Option 4: macOS (launchd)

Create `~/Library/LaunchAgents/com.printqueue.bridge.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.printqueue.bridge</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/local/bin/node</string>
    <string>dist/index.js</string>
  </array>
  <key>WorkingDirectory</key><string>/Users/you/print-queue-app/apps/bridge</string>
  <key>EnvironmentVariables</key>
  <dict>
    <!-- duplicate the keys from apps/bridge/.env here, launchd doesn't read .env files -->
    <key>SUPABASE_URL</key><string>https://your-project.supabase.co</string>
    <key>SUPABASE_SECRET_KEY</key><string>...</string>
    <key>BRIDGE_ID</key><string>home-p1s-bridge</string>
    <key>PRINTER_ADAPTER</key><string>mock</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>/tmp/print-queue-bridge.log</string>
  <key>StandardErrorPath</key><string>/tmp/print-queue-bridge.err.log</string>
</dict>
</plist>
```

```bash
launchctl load ~/Library/LaunchAgents/com.printqueue.bridge.plist
```

`KeepAlive` makes launchd restart it if it exits for any reason.

## Option 5: NAS (Synology/QNAP) via Docker

Most modern NAS units run Docker (Synology Container Manager, QNAP
Container Station). Upload the repo (or just `apps/bridge`,
`packages/shared`, and the root workspace files it needs), then either:

- Use the NAS's Docker UI to build from `apps/bridge/Dockerfile` with the
  repo root as build context, or
- SSH in and run the same `docker compose -f docker-compose.bridge.yml up -d --build`
  command as Option 2.

Mount a persistent volume for `apps/bridge/tmp` (already set up in the
compose file) so partially-downloaded files don't pile up on the NAS's
system volume.

## Verifying it's running

Watch the logs (structured JSON, one line per event). You should see
`"msg":"Bridge is running"` shortly after start, and a `status_report`
line roughly every `HEARTBEAT_INTERVAL_MS`. In the web app's dashboard,
"Bridge online/offline" reflects `printers.last_seen_at` freshness — it
should flip to "online" within one heartbeat interval of the bridge
starting.
