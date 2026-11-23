# Dashboard design

## Product goal

Provide a clear, private interface for reviewing PBX call detail records. Rust owns SMDR collection, parsing, SQLite storage, and a loopback-only API. Next.js owns the authenticated dashboard and never connects to the PBX directly.

## Visual direction

Use a light operational console with a white background, dark text, muted borders, and teal for active or healthy states. Keep navigation quiet and make call data easy to scan. On desktop, prioritize status, summary metrics, daily activity, rankings, and recent records. On smaller screens, stack charts above the table.

## Components and behavior

- Use the existing shadcn/ui source components and Tailwind CSS utilities.
- Overview is server-rendered and protected by Auth.js credentials authentication.
- Period selector covers 7, 30, or 90 days. **Actualizar registros** reloads data and shows its loading state; Export downloads authenticated raw SMDR CSV.
- Extension and destination rankings filter the call table. The menu-area ranking reads its DDI and area-to-extension mapping from local `config.toml`; keep those deployment values out of source control.
- Search, categorical filters, and pagination are backed by Rust. Pages contain 10, 25, or 50 rows. The URL stores categorical filters and page state but omits free-text phone searches.
- Settings let an authenticated user edit the PBX address, SMDR TCP port, local SQLite path, and SMDR password. The API never returns the saved password.
- Changing PBX settings signals the collector to reconnect. Moving SQLite copies to a new path after checkpointing WAL and keeps the original for rollback.
- Preserve unknown call-answer status as unknown. Do not infer missed calls from silence.
- Make empty, loading, offline, and no-search-match states explicit. Keep the table horizontally scrollable on narrow screens.
- Keep credentials in local environment files. The Rust API token stays server-side and is never sent to the browser.

## Data semantics

SMDR formats and available fields vary by PBX model and configuration. Distinguish what the record reports from what the application infers. Do not present call detail analytics as live SIP registration, audio monitoring, or call-routing state.

## Accessibility

- Use semantic page landmarks, labelled inputs, named icon buttons, visible keyboard focus, and text labels alongside color states.
- Keep a skip link, support keyboard navigation, and respect reduced-motion settings.
- Do not represent a metric by color alone.
