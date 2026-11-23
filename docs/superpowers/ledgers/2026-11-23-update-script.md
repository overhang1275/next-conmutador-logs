# Update Script Execution Ledger

Ruling: Back up a configured SQLite database outside `/var/lib/linea-clara` and its SQLite sidecars after stopping services — the dashboard allows database relocation, so backing up only the standard state directory could omit records — cost if wrong: an extra protected copy consumes disk space, and an unusual escaped TOML path causes a safe preflight refusal.

Ruling: Acquire a nonblocking system-wide lock for update runs — overlapping release swaps could interrupt or overwrite one another — cost if wrong: a second administrator must retry after the first run finishes.

Ruling: Keep previous releases and backups without automatic pruning — automatic deletion could remove the only recovery copy — cost if wrong: repeated updates consume additional disk space until an administrator removes old copies.

Ruling: Stop both services before taking the state backup, then reread `config.toml` before selecting an external SQLite path — the dashboard can change `database_path` while the candidate is compiling — cost if wrong: a malformed or unsupported path makes the updater stop and roll back rather than guess.

Ruling: Reject symlinked installation, state, and secrets roots/config files — preserving symlinks could back up data from an unexpected location or leave rollback incomplete — cost if wrong: custom deployments using these symlink layouts need a deliberate manual migration before using the updater.

Ruling: Require exact HTTP 200 responses and disable curl's user config for health checks — redirects or a local `.curlrc` must not count as a healthy deployment or expose request headers — cost if wrong: a customized login route that intentionally redirects needs its health check adjusted.

Implementation record: candidate release is built and checked as service user before downtime; rollback restarts services only after the previous app directory is restored. No server update was run. No build or tests were run; completion is based on static review.
