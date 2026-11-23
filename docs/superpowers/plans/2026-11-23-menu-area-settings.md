# Menu Area Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Let an authenticated dashboard administrator configure the main menu DID and its key-to-area-to-extension mapping, then use the existing area statistics without interrupting SMDR collection.

**Architecture:** Add a dedicated authenticated menu-configuration API in Rust, persisting only `menu_did` and `menu_areas` through the existing TOML settings writer. Add a matching Next.js API route/client helper and a separate editable form on the settings page; this save path must not signal the collector's reconnect watch channel.

**Tech Stack:** Rust, Axum, TOML, Next.js App Router, React, TypeScript, Tailwind CSS.

**Spec:** `docs/superpowers/specs/2026-11-23-menu-area-settings-design.md`

## Global Constraints

- Save this section without restarting the SMDR connection.
- Do not show or save names of people.
- Do not modify the Panasonic, its routing, DIDs, record reception, or extension statistics outside the menu.
- Preserve the current dashboard aggregation: incoming call, destination equals configured menu DID, and extension matches the configured area row.

## Review Focus

- Duplicate or out-of-range menu keys must be rejected; inspect Rust validation for the inclusive 0–9 range.
- Empty area/extension values must not be persisted; inspect trimming and required-field handling.
- Multiple menu keys may point to the same extension; ensure validation does not reject this valid mapping.
- An empty DID and empty mapping must remain a valid unconfigured state for a fresh install.
- Saving a mapping must not reconnect the collector or expose the API token / SMDR password in its response.

---

### Task 1: Rust menu configuration API

**Files:**
- Modify: `src/main.rs`

**Interfaces:**
- Consumes: existing `Settings.menu_did`, `Settings.menu_areas`, `MenuAreaConfig`, `persist_settings`, and `authorized`.
- Produces: authenticated `GET /api/v1/menu-config` returning `{ menu_did: string, menu_areas: MenuAreaConfig[] }`; authenticated `PUT /api/v1/menu-config` accepting that shape and returning the saved shape.

- [x] Add `GET` and `PUT` routes for `/api/v1/menu-config` without changing `/api/v1/settings` behavior.
- [x] On `PUT`, trim DID, area, and extension; allow empty DID only when the mapping is empty; validate nonempty DID as digits, keys as unique integers 0–9, and area/extension as nonempty. Permit duplicate extensions across different keys.
- [x] Persist a cloned candidate `Settings` with `persist_settings`; update in-memory settings only after persistence succeeds. Do not send `settings_changed`.
- [x] Keep response limited to menu DID and area rows; never serialize `api_token` or `smdr_password`.

### Task 2: Next.js authenticated API bridge

**Files:**
- Modify: `web/src/lib/rust-api.ts`
- Create: `web/src/app/api/menu-config/route.ts`

**Interfaces:**
- Consumes: Rust `GET/PUT /api/v1/menu-config` contract from Task 1.
- Produces: `MenuConfig` type plus `getMenuConfig()` and `saveMenuConfig()` helpers; authenticated browser endpoint `GET/PUT /api/menu-config`.

- [x] Add the exact `MenuConfig` shape `{ menu_did: string; menu_areas: { key: number; area: string; extension: string }[] }` and typed Rust helpers using the existing bearer-token pattern.
- [x] Add Next route handlers that require `auth()`, call those helpers, and return safe error responses using the existing `/api/settings` conventions.

### Task 3: Editable menu configuration form

**Files:**
- Create: `web/src/components/menu-area-settings-form.tsx`
- Modify: `web/src/app/settings/page.tsx`

**Interfaces:**
- Consumes: `MenuConfig` and the same-origin authenticated `GET/PUT /api/menu-config` endpoint from Task 2; the server settings page loads initial data with `getMenuConfig()`.
- Produces: separate **Áreas del menú** section with DID input, rows for key/area/extension, add/remove actions, and save status.

- [x] Load menu configuration on the authenticated settings page independently from PBX connection settings.
- [x] Render a controlled row editor that allows keys 0–9, area labels, and extensions; allow removing rows and multiple rows with the same extension.
- [x] Validate required row values and unique keys before save; display API validation failures inline and announce successful saves with a status message.
- [x] Keep area save independent from the PBX connection form so it does not alter PBX credentials, database path, or collector connection.
- [x] Explain in the UI that this mapping affects dashboard analytics only and does not change PBX routing.

### Task 4: Setup documentation

**Files:**
- Modify: `README.md`

- [x] Add a short setup note that a fresh installation should configure menu DID and key/area/extension rows in **Configuración → Áreas del menú** for area analytics; clarify that this is reporting metadata, not PBX routing.

## Execution Notes

Implement natively in this session. The user requested implementation and selected the menu-specific approach. Do not add or run tests unless the user separately asks for verification; perform code review of the changed paths before reporting completion.

## Completion Note

Implementation tasks are complete. Tests/builds were not run, per the workspace instruction not to run verification unless requested. The changed files received static review.
