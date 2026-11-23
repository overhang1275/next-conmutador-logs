"use client";

import { useState } from "react";
import { Check, LoaderCircle, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { PublicSettings } from "@/lib/rust-api";

export function SettingsForm({ initialSettings }: { initialSettings: PublicSettings }) {
  const [settings, setSettings] = useState(initialSettings);
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/settings", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...settings, smdr_password: password }), cache: "no-store",
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "No se pudo guardar la configuración.");
      setSettings(body.settings as PublicSettings); setPassword("");
      setNotice(body.database_copied ? "Configuración guardada. La base anterior se conservó y el colector está reconectando." : "Configuración guardada. El colector está reconectando al PBX.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "No se pudo guardar la configuración."); }
    finally { setSaving(false); }
  }

  return <form onSubmit={submit} className="space-y-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
    <div><h2 className="text-lg font-semibold text-slate-900">Destino del colector</h2><p className="mt-1 text-sm leading-5 text-slate-500">Dirección del Panasonic KX‑NS500 y puerto TCP donde transmite SMDR.</p></div>
    <div className="grid gap-5 sm:grid-cols-2">
      <label className="space-y-2 text-sm font-medium text-slate-700">IP del conmutador<Input required inputMode="decimal" autoComplete="off" value={settings.pbx_ip} onChange={(e) => setSettings({ ...settings, pbx_ip: e.target.value })} placeholder="192.0.2.10" /></label>
      <label className="space-y-2 text-sm font-medium text-slate-700">Puerto TCP SMDR<Input required type="number" min={1} max={65535} value={settings.pbx_port} onChange={(e) => setSettings({ ...settings, pbx_port: Number(e.target.value) })} /></label>
    </div>
    <div className="space-y-2"><label htmlFor="smdr-password" className="flex flex-wrap items-center gap-2 text-sm font-medium text-slate-700">Contraseña SMDR<span className={`rounded-full px-2 py-0.5 text-[11px] ${settings.password_configured ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900"}`}>{settings.password_configured ? "Configurada" : "Pendiente"}</span></label><Input id="smdr-password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={settings.password_configured ? "Configurada; vacío conserva la actual" : "Escribe la contraseña SMDR"} /><p className="text-xs leading-5 text-slate-500">Nunca se muestra la contraseña guardada. Si no necesitas cambiarla, deja este campo vacío.</p></div>
    <div className="space-y-2"><label htmlFor="database-path" className="text-sm font-medium text-slate-700">Ubicación de la base SQLite</label><Input id="database-path" required maxLength={1024} autoComplete="off" value={settings.database_path} onChange={(e) => setSettings({ ...settings, database_path: e.target.value })} /><p className="text-xs leading-5 text-slate-500">Para moverla, el destino debe ser una ruta nueva. Se copia la base actual y se conserva la original.</p></div>
    {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">{error}</p>}
    {notice && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{notice}</p>}
    <div className="flex flex-col gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:items-center sm:justify-between"><span className="text-xs text-slate-500">La conexión se reinicia al guardar.</span><Button type="submit" disabled={saving} className="gap-2">{saving ? <LoaderCircle size={16} className="animate-spin motion-reduce:animate-none" /> : notice ? <Check size={16} /> : <Save size={16} />}{saving ? "Guardando…" : "Guardar y reconectar"}</Button></div>
  </form>;
}
