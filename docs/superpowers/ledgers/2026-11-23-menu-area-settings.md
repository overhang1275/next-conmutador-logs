# Menu Area Settings Execution Ledger

Ruling: The browser form will call the authenticated same-origin Next.js route, while `getMenuConfig()` and `saveMenuConfig()` keep the Rust bearer token on the server — a client-side helper could expose server-only API credentials — cost if wrong: an extra same-origin request layer.

Ruling: Serialize both menu and PBX configuration writes with one shared mutex — they write the same TOML file and temp path, and concurrent stale snapshots could overwrite one another — cost if wrong: configuration saves wait briefly for another save to finish.

Ruling: Create and reset the TOML temp file with Unix mode `0600` before writing secrets — the file contains the SMDR password and API token, and the installer's existing `0640` mode is broader — cost if wrong: a separate process relying only on group read permission would lose access, while the Rust service account remains the owner.

Ruling: Keep duplicate extension mappings valid but explain that SMDR reports the destination extension, not the menu key — call records cannot identify which key was pressed when paths share an extension — cost if wrong: area counts remain extension-level estimates rather than key-level measurements.

Task 1 complete: Rust API persists the menu config without notifying the collector reconnect watcher; validation and secret-safe response confirmed by static review.
Task 2 complete: authenticated Next.js route keeps the bearer token server-side and surfaces Rust validation errors.
Task 3 complete: settings page has independent menu mapping form; controls are disabled during save and the copy explains extension-based attribution.
Task 4 complete: README points new installations to the dashboard setup.

Final review: fresh reviewer found three important risks and one navigation inconsistency; all were addressed. The reviewer also noted the inherited first-row attribution when extensions are shared; the settings form now warns that SMDR cannot identify the pressed key. Static review was repeated after the fixes. No tests or builds were run per workspace instruction.
