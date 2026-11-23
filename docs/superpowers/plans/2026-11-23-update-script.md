# Debian Update Script Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Provide a root-run updater for an existing Debian/Ubuntu installation that stages and builds a new release, preserves runtime data and secrets, and rolls back automatically if the updated services fail health checks.

**Architecture:** `update.sh` reads the deployed repository URL and branch, clones and builds a candidate release under `/opt`, then stops the two systemd services, copies protected backups of state/secrets, swaps the application directory, and starts the services. A bounded health-check loop validates the Rust API and web login page; failure restores the previous application directory and starts the previous services.

**Tech Stack:** Bash, Git, Cargo, pnpm, systemd, curl.

**Spec:** `docs/superpowers/specs/2026-11-23-update-script-design.md`

## Global Constraints

- Preserve `/var/lib/linea-clara` and `/etc/linea-clara`; do not rewrite `config.toml`, the SQLite database, or `web.env`.
- Build the candidate release before stopping production services.
- Keep backups under root-only permissions.
- Roll back to the previous application directory if activation or health checks fail.
- Do not install packages or change the Panasonic, firewall, base systemd unit files, or service credentials. A legacy web service may receive a managed systemd drop-in to launch Next directly with Node instead of `pnpm exec`; preserve it after success and remove it automatically on rollback.
- Do not execute this updater against the user's server from this session.

## Review Focus

- Missing files, commands, service user, or services must fail before production downtime.
- A failed clone or build must leave the current release and services untouched.
- The backup must include the SQLite main database and WAL/SHM files after the collector is stopped.
- If `database_path` points outside `/var/lib/linea-clara`, the backup must include the external database and its SQLite sidecars, and record the original path.
- An activation failure must restore the prior application directory and restart both services.
- Health checks must not print or expose the API token, SMDR password, dashboard password, or secrets backup contents.
- The web process must not invoke pnpm at runtime; pnpm 11 attempts temporary writes under the read-only application directory and fails with `EROFS`.

---

### Task 1: Staged update and rollback script

**Files:**
- Create: `update.sh`

**Interfaces:**
- Invocation: `sudo bash /opt/linea-clara/update.sh [branch]`; the current installed Git remote and branch are defaults.
- Inputs: optional Git branch; installed paths and service names match `install.sh`.
- Output: progress messages, backup/release paths, and a nonzero exit on failure. Never print secrets.

- [x] Validate root, installed paths, required commands (`git`, `cargo`, `pnpm`, `curl`, `systemctl`), service account, and active service units before downtime.
- [x] Derive and validate the HTTPS GitHub origin and branch from `/opt/linea-clara`; allow one optional branch override.
- [x] Clone into a unique staging directory under `/opt`; validate required manifest files; run `cargo build --release --locked`, `pnpm install --frozen-lockfile`, and `pnpm build`; validate that `lineaclara` can read and execute the staged artifacts before downtime.
- [x] Only after a successful build, create a root-owned `0700` timestamped backup directory, stop web and SMDR services, reread runtime configuration, and copy `/var/lib/linea-clara` and `/etc/linea-clara` with metadata preserved. If the configured SQLite database is outside the state directory, also copy its main file and `-wal`, `-shm`, and `-journal` sidecars and record its original path.
- [x] Back up the effective web service definition; where it uses `pnpm exec`, install a managed drop-in that resets `ExecStart` and invokes Next.js with Node directly. Remove only a drop-in created by this run if rollback occurs; preserve it after successful health checks.
- [x] Rename the current app directory to a timestamped previous-release path and move the staged release into `/opt/linea-clara` on the same filesystem.
- [x] Start SMDR then web; poll `systemctl is-active`, authenticated `GET /api/v1/menu-config` using the token read silently from `config.toml`, and exact `200` from `GET /login` on `127.0.0.1:3001` with bounded timeouts.
- [x] On any failure after services stop, stop the candidate services, move the failed release aside, restore the previous release, restart prior services only after verifying the prior app directory is restored, print the backup paths, and exit nonzero. Retain previous releases and backups; do not prune them automatically.

### Task 2: Update instructions

**Files:**
- Modify: `README.md`

- [x] Document the update command using the repository's raw GitHub `update.sh` URL and state that it is for an existing Debian/Ubuntu install, requires root, creates protected backups, and has a short service interruption during activation.
- [x] Show how to inspect the printed backup/release path and the service status after completion.

## Completion note

Implemented `update.sh` and documented the invocation in `README.md`. The server's first update exposed pnpm's temporary write under the systemd read-only app tree; the updater now uses direct Node execution for legacy units and backs up/restores that override safely. No server update, build, or automated tests were run in this session.

Follow-up from server logs: the first update's web process failed with `EROFS` while pnpm created a temporary file under `/opt/linea-clara/web`. The installer and updater now use the direct Node entry point; the updater also applies a reversible drop-in for existing installations that still use `pnpm exec`.

## Execution Notes

Implement natively in this session. Do not run the updater against the user's server. Do not add or run tests unless the user separately requests verification; perform static script review before reporting completion.
