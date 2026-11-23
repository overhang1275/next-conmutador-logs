"use client";

import { useState } from "react";
import { Check, LoaderCircle, Plus, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { MenuConfig } from "@/lib/rust-api";

export function MenuAreaSettingsForm({ initialConfig }: { initialConfig: MenuConfig }) {
  const [config, setConfig] = useState(initialConfig);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  function addArea() {
    const nextKey = Array.from({ length: 10 }, (_, key) => key)
      .find((key) => !config.menu_areas.some((area) => area.key === key));
    if (nextKey === undefined) {
      setError("Ya están ocupadas las diez teclas del menú.");
      return;
    }
    setError("");
    setNotice("");
    setConfig({ ...config, menu_areas: [...config.menu_areas, { key: nextKey, area: "", extension: "" }] });
  }

  function updateArea(index: number, values: Partial<MenuConfig["menu_areas"][number]>) {
    setConfig({
      ...config,
      menu_areas: config.menu_areas.map((area, areaIndex) => areaIndex === index ? { ...area, ...values } : area),
    });
    setError("");
    setNotice("");
  }

  function removeArea(index: number) {
    setConfig({ ...config, menu_areas: config.menu_areas.filter((_, areaIndex) => areaIndex !== index) });
    setError("");
    setNotice("");
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");

    const menuDid = config.menu_did.trim();
    const areas = config.menu_areas.map((area) => ({
      ...area,
      area: area.area.trim(),
      extension: area.extension.trim(),
    }));
    if (menuDid && !/^\d{1,32}$/.test(menuDid)) {
      setError("El DDI principal debe contener solo dígitos y no exceder 32 caracteres.");
      setSaving(false);
      return;
    }
    if (areas.length > 0 && !menuDid) {
      setError("Configura el DDI principal antes de agregar áreas del menú.");
      setSaving(false);
      return;
    }
    if (areas.some((area) => !area.area || !area.extension)) {
      setError("Completa el área y la extensión en cada fila.");
      setSaving(false);
      return;
    }
    if (new Set(areas.map((area) => area.key)).size !== areas.length) {
      setError("Cada fila debe tener una tecla distinta.");
      setSaving(false);
      return;
    }

    try {
      const response = await fetch("/api/menu-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ menu_did: menuDid, menu_areas: areas }),
        cache: "no-store",
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "No se pudo guardar la configuración de áreas.");
      setConfig(body as MenuConfig);
      setNotice("Áreas del menú guardadas. No se reinició el colector SMDR.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se pudo guardar la configuración de áreas.");
    } finally {
      setSaving(false);
    }
  }

  return <form onSubmit={submit} className="space-y-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
    <div>
      <h2 className="text-lg font-semibold text-slate-900">Áreas del menú</h2>
      <p className="mt-1 text-sm leading-5 text-slate-500">Relaciona cada tecla con el área y la extensión que recibe sus llamadas.</p>
    </div>

    <label className="block max-w-sm space-y-2 text-sm font-medium text-slate-700" htmlFor="menu-did">
      DDI principal del menú
      <Input id="menu-did" type="text" inputMode="numeric" autoComplete="off" disabled={saving} maxLength={32} pattern="[0-9]*" required={config.menu_areas.length > 0} value={config.menu_did} onChange={(event) => { setConfig({ ...config, menu_did: event.target.value }); setError(""); setNotice(""); }} placeholder="3332844400" />
      <span className="block text-xs font-normal leading-5 text-slate-500">Las estadísticas del menú solo incluyen llamadas entrantes a este DDI.</span>
    </label>
    <p className="-mt-3 text-xs leading-5 text-slate-500">El SMDR registra la extensión destino, no la tecla marcada. Si varias filas usan la misma extensión, el conteo queda en la primera coincidencia y no se puede separar por tecla.</p>

    {config.menu_areas.length > 0 ? <div className="space-y-3">
      <div className="hidden grid-cols-[6rem_minmax(0,1fr)_minmax(0,1fr)_2.5rem] gap-3 px-1 text-xs font-medium text-slate-500 sm:grid">
        <span>Tecla</span><span>Área</span><span>Extensión</span><span className="sr-only">Acciones</span>
      </div>
      {config.menu_areas.map((area, index) => <div key={`${area.key}-${index}`} className="grid gap-3 rounded-lg border border-slate-200 p-3 sm:grid-cols-[6rem_minmax(0,1fr)_minmax(0,1fr)_2.5rem] sm:items-end sm:border-0 sm:p-0">
        <label className="space-y-1.5 text-xs font-medium text-slate-600">
          <span className="sm:sr-only">Tecla</span>
          <select aria-label={`Tecla del área ${index + 1}`} disabled={saving} value={area.key} onChange={(event) => updateArea(index, { key: Number(event.target.value) })} className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500">
            {Array.from({ length: 10 }, (_, key) => <option key={key} value={key} disabled={config.menu_areas.some((other, otherIndex) => otherIndex !== index && other.key === key)}>{key}</option>)}
          </select>
        </label>
        <label className="space-y-1.5 text-xs font-medium text-slate-600">
          <span>Área</span>
          <Input required disabled={saving} maxLength={80} value={area.area} onChange={(event) => updateArea(index, { area: event.target.value })} placeholder="Formas" />
        </label>
        <label className="space-y-1.5 text-xs font-medium text-slate-600">
          <span>Extensión</span>
          <Input required disabled={saving} maxLength={32} inputMode="numeric" value={area.extension} onChange={(event) => updateArea(index, { extension: event.target.value })} placeholder="4422" />
        </label>
        <button type="button" disabled={saving} onClick={() => removeArea(index)} aria-label={`Quitar fila del área ${index + 1}`} className="inline-flex h-10 w-full items-center justify-center rounded-md text-slate-500 hover:bg-rose-50 hover:text-rose-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-600 disabled:cursor-not-allowed disabled:opacity-50 sm:w-10">
          <Trash2 size={16} aria-hidden="true" /><span className="ml-2 text-sm sm:sr-only">Quitar</span>
        </button>
      </div>)}
    </div> : <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50/70 px-4 py-6 text-center">
      <p className="text-sm font-medium text-slate-700">Todavía no hay áreas configuradas</p>
      <p className="mt-1 text-xs text-slate-500">Agrega una fila por cada opción del menú que quieras medir.</p>
    </div>}

    <button type="button" disabled={saving} onClick={addArea} className="inline-flex min-h-10 items-center gap-2 rounded-md px-3 text-sm font-medium text-teal-800 hover:bg-teal-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 disabled:cursor-not-allowed disabled:opacity-50">
      <Plus size={16} aria-hidden="true" />Agregar área
    </button>

    {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">{error}</p>}
    {notice && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{notice}</p>}
    <div className="flex flex-col gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
      <p className="max-w-xl text-xs leading-5 text-slate-500">Esta relación solo organiza las estadísticas del dashboard; no cambia el menú ni el enrutamiento del Panasonic.</p>
      <Button type="submit" disabled={saving} className="shrink-0 gap-2">{saving ? <LoaderCircle size={16} className="animate-spin motion-reduce:animate-none" /> : notice ? <Check size={16} /> : <Save size={16} />}{saving ? "Guardando…" : "Guardar áreas"}</Button>
    </div>
  </form>;
}
