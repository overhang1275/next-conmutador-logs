import type { DashboardData } from "@/lib/types";

export type DashboardQuery = {
  days?: number;
  page?: number;
  per_page?: number;
  q?: string;
  extension?: string;
  did?: string;
  direction?: string;
  result?: string;
};

export type PublicSettings = {
  pbx_ip: string;
  pbx_port: number;
  database_path: string;
  password_configured: boolean;
};

function rustConfig() {
  const url = process.env.RUST_API_URL;
  const token = process.env.RUST_API_TOKEN;
  if (!url || !token) throw new Error("La conexión segura con el servicio Rust no está configurada.");
  return { url, token };
}

export async function getDashboard(query: DashboardQuery = {}): Promise<DashboardData> {
  const { url, token } = rustConfig();
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== "") params.set(key, String(value));
  }
  const response = await fetch(`${url}/api/v1/dashboard?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`El servicio Rust respondió con estado ${response.status}.`);
  return response.json() as Promise<DashboardData>;
}

export async function getRustSettings(): Promise<PublicSettings> {
  const { url, token } = rustConfig();
  const response = await fetch(`${url}/api/v1/settings`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
  if (!response.ok) throw new Error(`No se pudo leer la configuración del servicio Rust (${response.status}).`);
  return response.json() as Promise<PublicSettings>;
}

export async function saveRustSettings(settings: PublicSettings & { smdr_password?: string }): Promise<{ settings: PublicSettings; reconnecting: boolean; database_copied: boolean }> {
  const { url, token } = rustConfig();
  const response = await fetch(`${url}/api/v1/settings`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(settings),
    cache: "no-store",
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(body || `No se pudo guardar la configuración (${response.status}).`);
  }
  return response.json();
}

export async function getRawExport(): Promise<Response> {
  const { url, token } = rustConfig();
  return fetch(`${url}/api/v1/export.csv`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
}
