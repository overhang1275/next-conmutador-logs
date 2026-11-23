# Línea Clara

Línea Clara is a self-hosted call reporting dashboard. A Rust service collects SMDR records from a PBX and stores them in SQLite. A Next.js application provides an authenticated dashboard for reviewing and exporting call records.

## Features

- Collector connection status and last record received.
- Call summaries, daily activity, extension statistics, and menu area reporting.
- Search, filters, and server-side pagination.
- CSV export of raw SMDR records.
- PBX connection settings managed from the dashboard.
- Local SQLite storage.

SMDR reports call detail according to the fields and format provided by the PBX. It does not provide live SIP registration, audio monitoring, or call-routing configuration.

## Install on Debian or Ubuntu

The installer downloads this repository, installs its build dependencies, compiles the Rust and Next.js applications, creates a restricted service account, and configures two `systemd` services.

Run the following from a Debian or Ubuntu server as root:

```bash
curl -fsSL https://raw.githubusercontent.com/overhang1275/next-conmutador-logs/main/install.sh | bash -s -- https://github.com/overhang1275/next-conmutador-logs.git
```

The installer asks for the PBX IPv4 address, SMDR TCP port, the server IP or DNS name used to open the dashboard, and the dashboard password. It sets that address as Auth.js's canonical URL so login redirects return to the same host. After installation, enter the SMDR password in **PBX settings**. The dashboard listens on TCP port `3001`; allow access only from a trusted network. Do not expose it directly to the public internet.

To populate **Calls by menu area**, open the dashboard settings and use **Áreas del menú** to set the main menu DID plus each key, area, and destination extension. This mapping labels reports only; it does not change Panasonic routing. Saving it does not restart the SMDR collector.

Check the services and logs with:

```bash
systemctl status linea-clara-smdr linea-clara-web
journalctl -u linea-clara-smdr -u linea-clara-web -f
```

## Update an existing Debian or Ubuntu installation

After pushing the new version to GitHub, run this on the server as root. The updater builds a separate release first, then briefly stops the services while it backs up state and activates the new version. If its health checks fail, it restores the previous release. It does not change the PBX configuration, SQLite records, or dashboard credentials.

```bash
set -e
tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT
curl -fsSL -o "$tmp" https://raw.githubusercontent.com/overhang1275/next-conmutador-logs/main/update.sh
bash "$tmp"
# For another branch, use: bash "$tmp" nombre-de-rama
```

The updater prints the protected backup directory and previous release path; keep them until the update is confirmed:

```bash
systemctl status linea-clara-smdr linea-clara-web
```

The SQLite database and collector configuration live under `/var/lib/linea-clara`. Dashboard secrets are stored in `/etc/linea-clara/web.env` with restricted permissions.

## Local development

Requirements: Rust stable, Node.js 24 or newer, and pnpm 11.

1. Copy `config.example.toml` to `config.toml` and set the PBX address, SMDR password, database path, and a random API token.
2. Create `web/.env.local` with `AUTH_SECRET`, `DASHBOARD_USER`, `DASHBOARD_PASSWORD`, `RUST_API_URL=http://127.0.0.1:8787`, and the matching `RUST_API_TOKEN`.
3. In one terminal, run `cargo run` from this directory.
4. In another terminal, run `pnpm install` and `pnpm dev` from `web/`.
5. Open `http://127.0.0.1:3001`.

After signing in, configure menu analytics in **Configuración del PBX → Áreas del menú** by entering the main menu DID and each key, area, and destination extension. This mapping labels reports only; it does not change Panasonic routing, and saving it does not restart the SMDR collector.

Keep `config.toml`, `.env.local`, database files, and backups out of version control. The supplied `.gitignore` excludes these local files.

## Project layout

```text
src/              Rust SMDR collector and API
web/              Next.js dashboard
install.sh        Debian/Ubuntu installer
update.sh        staged updater with protected backup and rollback
config.example.toml
```

## License

No license has been selected yet. Until one is added, all rights remain with the copyright holder and reuse is not granted by default.
