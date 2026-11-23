"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { signOut } from "next-auth/react";
import {
  Activity, CalendarDays, Check, ChevronDown, Download, LogOut, Phone, PhoneCall,
  PhoneIncoming, PhoneMissed, RefreshCw, RadioTower, Search, Server, Settings2, Users, WifiOff,
} from "lucide-react";
import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { CallRecord, DashboardData } from "@/lib/types";

type Filters = { days: number; page: number; per_page: number; extension?: string; did?: string; direction?: string; result?: string };
type Props = { initialData: DashboardData | null; initialError: string; userName: string; initialFilters: Filters };

function number(value: number) {
  return new Intl.NumberFormat("es-MX").format(value);
}

function dateLabel(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return value;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12));
  return new Intl.DateTimeFormat("es-MX", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" }).format(date);
}

function timestampLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.replace("T", " ").slice(0, 16);
  return new Intl.DateTimeFormat("es-MX", { dateStyle: "short", timeStyle: "short" }).format(date);
}

function callDateTime(call: CallRecord) {
  return `${dateLabel(call.call_date)} · ${call.call_time}`;
}

function durationLabel(value: string) {
  return value.trim() || "—";
}

function statusVariant(result: string): "success" | "danger" | "muted" | "default" {
  if (result === "Atendida") return "success";
  if (result === "Sin respuesta") return "danger";
  if (result === "Estado no indicado" || result === "Recibida") return "muted";
  return "default";
}

function Metric({ title, value, icon: Icon, note }: { title: string; value: number; icon: typeof PhoneCall; note: string }) {
  return (
    <Card className="min-w-0">
      <CardContent className="flex items-center justify-between gap-3 p-4 sm:p-5">
        <div className="min-w-0"><p className="text-sm font-medium text-slate-500">{title}</p><p className="mt-2 text-[27px] font-semibold leading-none tracking-tight tabular-nums text-slate-900">{number(value)}</p><p className="mt-2 line-clamp-2 text-xs leading-4 text-slate-500">{note}</p></div>
        <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-teal-50 text-teal-800"><Icon size={20} strokeWidth={1.8} /></div>
      </CardContent>
    </Card>
  );
}

export function DashboardView({ initialData, initialError, userName, initialFilters }: Props) {
  const [data, setData] = useState<DashboardData | null>(initialData);
  const [error, setError] = useState(initialError);
  const [filters, setFilters] = useState<Filters>(initialFilters);
  const [query, setQuery] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [ranking, setRanking] = useState<"extensions" | "dids" | "menu">("extensions");

  const days = filters.days;
  const refresh = useCallback(async (nextFilters: Filters = filters, term = query) => {
    setRefreshing(true);
    try {
      const response = await fetch("/api/dashboard", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...nextFilters, q: term }), cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "No se pudo actualizar el tablero.");
      setData(body as DashboardData);
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se pudo actualizar el tablero.");
    } finally {
      setRefreshing(false);
    }
  }, [filters, query]);

  const applyFilters = useCallback((next: Filters) => {
    setFilters(next);
    const params = new URLSearchParams();
    for (const key of ["days", "page", "per_page", "extension", "did", "direction", "result"] as const) {
      const value = next[key]; if (value !== undefined && value !== "") params.set(key, String(value));
    }
    window.history.replaceState(null, "", `${window.location.pathname}?${params}${window.location.hash}`);
    void refresh(next, query);
  }, [query, refresh]);

  useEffect(() => {
    const interval = window.setInterval(() => void refresh(), 30_000);
    return () => window.clearInterval(interval);
  }, [refresh]);

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh({ ...filters, page: 1 }, query), 300);
    return () => window.clearTimeout(timer);
  }, [filters, query, refresh]);

  const chartData = useMemo(() => [...(data?.daily ?? [])].sort((a, b) => a.date.localeCompare(b.date)), [data]);
  const calls = data?.calls ?? [];
  const topExtensions = data?.extensions.slice(0, 6) ?? [];
  const topDids = data?.dids.slice(0, 6) ?? [];
  const menuAreas = data?.menu_areas ?? [];
  const maxMenuIncoming = Math.max(1, ...menuAreas.map((item) => item.incoming));
  const activeMenuArea = data?.menu_did && filters.did === data.menu_did && filters.direction === "Entrante"
    ? menuAreas.find((item) => item.extension === filters.extension)
    : undefined;
  const maxIncoming = Math.max(1, ...topExtensions.map((item) => item.incoming));
  const sessionExpired = error.toLocaleLowerCase("es-MX").includes("sesión");

  return (
    <div className="min-h-screen">
      <a href="#main-content" className="sr-only z-50 rounded-md bg-white px-4 py-2 text-sm font-semibold text-teal-900 shadow focus:not-sr-only focus:fixed focus:left-4 focus:top-4">Saltar al contenido</a>
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-[248px] flex-col border-r border-slate-200 bg-white lg:flex">
        <div className="flex h-[88px] items-center gap-3 border-b border-slate-100 px-6">
          <div className="grid size-11 place-items-center rounded-xl bg-teal-700 text-white"><Phone size={22} fill="currentColor" strokeWidth={1.5} /></div>
          <div><p className="font-semibold tracking-tight text-slate-900">Línea Clara</p><p className="mt-0.5 text-xs text-slate-500">Panasonic KX‑NS500</p></div>
        </div>
        <nav aria-label="Navegación principal" className="space-y-1 px-3 py-5">
          <a href="#overview" aria-current="page" className="flex h-10 items-center gap-3 rounded-lg bg-teal-50 px-3 text-sm font-medium text-teal-900"><Activity size={17} />Resumen</a>
          <a href="#calls" className="flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900"><PhoneCall size={17} />Llamadas</a>
        </nav>
        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
          <div className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Extensiones</div>
          {data?.extensions.map((item) => <button key={item.extension} type="button" onClick={() => { applyFilters({ ...filters, extension: item.extension, did: undefined, page: 1 }); document.querySelector("#calls")?.scrollIntoView({ behavior: "smooth" }); }} className={`flex min-h-9 w-full items-center justify-between gap-2 rounded-lg px-3 text-left text-sm hover:bg-slate-50 ${filters.extension === item.extension ? "bg-teal-50 font-medium text-teal-900" : "text-slate-600"}`}><span className="truncate">Ext. {item.extension}</span><span className="text-xs tabular-nums text-slate-400">{number(item.incoming)}</span></button>)}
        </div>
        <div className="mt-auto border-t border-slate-100 p-4">
          <a href="/settings" className="mb-3 flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900"><Settings2 size={16} />Configuración del PBX</a>
          <div className="mb-3 rounded-lg bg-slate-50 p-3"><div className="flex items-center gap-2 text-xs font-medium text-slate-600"><Settings2 size={15} />Conmutador</div><p className="mt-2 truncate text-sm font-medium text-slate-800">{data?.status.pbx_ip ?? "Sin configurar"}</p><p className="mt-1 text-xs text-slate-500">TCP · Puerto {data?.status.pbx_port ?? "—"}</p></div>
          <button type="button" onClick={() => signOut({ redirectTo: "/login" })} className="flex min-h-10 w-full items-center gap-3 rounded-lg px-3 text-sm text-slate-500 hover:bg-slate-50 hover:text-slate-900"><LogOut size={16} />Cerrar sesión</button>
        </div>
      </aside>

      <div className="min-w-0 lg:pl-[248px]">
        <header className="sticky top-0 z-10 border-b border-slate-200/80 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/85">
          <div className="mx-auto flex min-h-[76px] max-w-[1500px] items-center justify-between gap-3 px-4 sm:px-7 xl:px-9">
            <div className="flex min-w-0 items-center gap-3">
              <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-teal-700 text-white lg:hidden"><Phone size={18} fill="currentColor" /></div>
              <div><p className="text-xs text-slate-500">Monitor de llamadas</p><h1 id="overview" className="text-balance truncate text-lg font-semibold tracking-tight text-slate-900 sm:text-xl">Resumen de llamadas</h1></div>
            </div>
            <div className="flex shrink-0 items-center gap-2 sm:gap-3">
              <label className="sr-only" htmlFor="period">Periodo de análisis</label>
              <div className="relative hidden sm:block"><CalendarDays size={16} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" /><select id="period" value={days} onChange={(event) => applyFilters({ ...filters, days: Number(event.target.value), page: 1 })} className="h-10 appearance-none rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-9 text-sm text-slate-700 shadow-sm focus-visible:outline-teal-700 focus-visible:ring-2 focus-visible:ring-teal-600"><option value={7}>Últimos 7 días</option><option value={30}>Últimos 30 días</option><option value={90}>Últimos 90 días</option></select><ChevronDown size={14} aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-500" /></div>
              <Button variant="outline" size="sm" className="gap-2" onClick={() => void refresh(filters, query)} disabled={refreshing} aria-label="Actualizar registros" aria-busy={refreshing} title="Actualizar registros"><RefreshCw size={16} className={refreshing ? "animate-spin motion-reduce:animate-none" : ""} /><span className="hidden sm:inline">{refreshing ? "Actualizando…" : "Actualizar registros"}</span><span className="sm:hidden">{refreshing ? "Actualizando…" : "Actualizar"}</span></Button>
              <a href="/api/export" className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-teal-700 px-3 text-sm font-medium text-white shadow-sm hover:bg-teal-800 sm:px-4"><Download size={16} /><span className="hidden sm:inline">Exportar</span></a>
              <div className="hidden border-l border-slate-200 pl-3 text-right md:block"><p className="max-w-32 truncate text-sm font-medium text-slate-800">{userName}</p><p className="text-xs text-slate-500">Sesión privada</p></div>
            </div>
          </div>
          <div className="flex items-center gap-2 border-t border-slate-100 px-4 py-2 sm:hidden"><CalendarDays size={15} aria-hidden="true" className="text-slate-500" /><label className="sr-only" htmlFor="period-mobile">Periodo de análisis</label><select id="period-mobile" value={days} onChange={(event) => applyFilters({ ...filters, days: Number(event.target.value), page: 1 })} className="h-8 flex-1 bg-white text-sm text-slate-700 focus-visible:ring-2 focus-visible:ring-teal-600"><option value={7}>Últimos 7 días</option><option value={30}>Últimos 30 días</option><option value={90}>Últimos 90 días</option></select><a href="#calls" className="text-sm font-medium text-teal-800">Llamadas</a><a href="/settings" aria-label="Configuración del PBX" className="rounded-md p-2 text-slate-600"><Settings2 size={16} /></a></div>
        </header>

        <main id="main-content" tabIndex={-1} className="mx-auto max-w-[1500px] space-y-5 px-4 py-5 sm:px-7 sm:py-7 xl:px-9">
          <span className="sr-only" role="status" aria-live="polite">{refreshing ? "Actualizando llamadas…" : ""}</span>
          {error && <div role="status" className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"><WifiOff size={18} aria-hidden="true" className="mt-0.5 shrink-0" /><div className="min-w-0"><p className="font-medium">No se pudo actualizar la información</p><p className="mt-1 break-words text-amber-900/80">{error}{sessionExpired ? "" : " Revisa que el recolector Rust siga ejecutándose."}</p></div>{sessionExpired ? <a href="/login" className="ml-auto inline-flex min-h-9 shrink-0 items-center rounded-lg px-3 text-sm font-medium text-amber-950 underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-teal-700">Iniciar sesión</a> : <Button variant="ghost" size="sm" className="ml-auto shrink-0" onClick={() => void refresh()}>Reintentar</Button>}</div>}

          <section aria-label="Estado del conmutador" className="flex flex-col justify-between gap-4 rounded-xl border border-slate-200 bg-white px-5 py-4 sm:flex-row sm:items-center">
            <div className="flex items-center gap-4"><div className="grid size-11 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-700"><Server size={20} /></div><div><p className="text-xs font-medium uppercase tracking-[0.08em] text-slate-500">PBX</p><p className="mt-1 text-sm font-medium text-slate-800">Panasonic KX‑NS500 <span className="mx-1.5 text-slate-300">·</span>{data?.status.pbx_ip ?? "Sin configurar"}</p></div></div>
            <div className="flex items-center gap-4 sm:justify-end"><Badge variant={data?.status.connected ? "success" : "danger"}><span aria-hidden="true" className={`size-1.5 rounded-full ${data?.status.connected ? "bg-emerald-600" : "bg-rose-600"}`} />{data?.status.connected ? "Conectado" : "Desconectado"}</Badge><span className="hidden text-xs text-slate-500 sm:block">{data?.status.last_record_at ? `Último registro ${timestampLabel(data.status.last_record_at)}` : data?.status.message ?? "Esperando conexión"}</span></div>
          </section>

          <section aria-label="Resumen del periodo" className="grid grid-cols-1 gap-3 min-[440px]:grid-cols-2 xl:grid-cols-4">
            <Metric title="Entrantes" value={data?.summary.incoming ?? 0} icon={PhoneIncoming} note="Llamadas al conmutador" />
            <Metric title="Atendidas" value={data?.summary.answered ?? 0} icon={Check} note="Confirmadas por el SMDR" />
            <Metric title="Sin respuesta" value={data?.summary.missed ?? 0} icon={PhoneMissed} note="Condición NA reportada" />
            <Metric title="Extensiones activas" value={data?.summary.active_extensions ?? 0} icon={Users} note="Con llamadas entrantes" />
          </section>

          <section className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.8fr)_minmax(280px,.82fr)]">
            <Card>
              <CardHeader className="flex-row items-start justify-between gap-3"><div><CardTitle>Evolución de llamadas</CardTitle><p className="mt-1 text-xs text-slate-500">Entrantes, salientes y sin respuesta por día</p></div><Badge variant="muted">{days} días</Badge></CardHeader>
              <CardContent className="pt-4">
                {chartData.length ? <div className="h-[260px] w-full" role="img" aria-label="Gráfica de volumen diario de llamadas"><ResponsiveContainer width="100%" height="100%"><AreaChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}><defs><linearGradient id="incomingFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#0f8b84" stopOpacity={0.19} /><stop offset="95%" stopColor="#0f8b84" stopOpacity={0.015} /></linearGradient></defs><CartesianGrid stroke="#edf1f3" strokeDasharray="4 4" vertical={false} /><XAxis dataKey="date" tickFormatter={(value: string) => `${value.slice(8, 10)}/${value.slice(5, 7)}`} tickLine={false} axisLine={false} tick={{ fill: "#788590", fontSize: 11 }} minTickGap={28} /><YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fill: "#788590", fontSize: 11 }} width={34} /><Tooltip labelFormatter={(value) => dateLabel(String(value))} contentStyle={{ borderRadius: 10, borderColor: "#dce4e8", fontSize: 12 }} /><Area type="monotone" dataKey="incoming" name="Entrantes" stroke="#087e78" strokeWidth={2.5} fill="url(#incomingFill)" activeDot={{ r: 4 }} /><Area type="monotone" dataKey="outgoing" name="Salientes" stroke="#8a99a5" strokeWidth={1.7} fill="transparent" activeDot={{ r: 3 }} /><Area type="monotone" dataKey="missed" name="Sin respuesta" stroke="#ca7474" strokeWidth={1.7} fill="transparent" activeDot={{ r: 3 }} /></AreaChart></ResponsiveContainer></div> : <div className="grid h-[260px] place-items-center rounded-lg bg-slate-50/80 text-center"><div><div className="mx-auto grid size-10 place-items-center rounded-full bg-white text-slate-400 ring-1 ring-slate-200"><Activity size={18} aria-hidden="true" /></div><p className="mt-3 text-sm font-medium text-slate-700">Sin actividad en este periodo</p><p className="mt-1 text-xs text-slate-500">La gráfica se completará con los registros del PBX.</p></div></div>}
                <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-500"><span className="inline-flex items-center gap-2"><i className="size-2 rounded-full bg-teal-700" />Entrantes</span><span className="inline-flex items-center gap-2"><i className="size-2 rounded-full bg-slate-400" />Salientes</span><span className="inline-flex items-center gap-2"><i className="size-2 rounded-full bg-rose-400" />Sin respuesta</span></div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{ranking === "extensions" ? "Extensiones con más llamadas" : ranking === "dids" ? "Números directos con más llamadas" : "Llamadas por área del menú"}</CardTitle>
                <p className="mt-1 text-xs text-slate-500">Conteos del SMDR para el periodo seleccionado</p>
                <div className="mt-3 flex flex-wrap gap-1 rounded-lg bg-slate-100 p-1" aria-label="Tipo de resumen">
                  <button type="button" onClick={() => setRanking("extensions")} aria-pressed={ranking === "extensions"} className={`rounded-md px-3 py-1.5 text-xs font-medium ${ranking === "extensions" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600"}`}>Extensiones</button>
                  <button type="button" onClick={() => setRanking("dids")} aria-pressed={ranking === "dids"} className={`rounded-md px-3 py-1.5 text-xs font-medium ${ranking === "dids" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600"}`}>Números directos</button>
                  <button type="button" onClick={() => setRanking("menu")} aria-pressed={ranking === "menu"} className={`rounded-md px-3 py-1.5 text-xs font-medium ${ranking === "menu" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600"}`}>Áreas del menú</button>
                </div>
              </CardHeader>
              <CardContent className="pt-4">
                {ranking === "extensions" && topExtensions.length > 0 ? (
                  <ol className="space-y-4">{topExtensions.map((item) => <li key={item.extension}><button type="button" onClick={() => { applyFilters({ ...filters, extension: item.extension, did: undefined, page: 1 }); document.querySelector("#calls")?.scrollIntoView({ behavior: "smooth" }); }} className="w-full text-left"><div className="mb-2 flex items-center justify-between gap-3"><div className="flex min-w-0 items-center gap-2.5"><span className="grid size-7 shrink-0 place-items-center rounded-lg bg-teal-50 text-teal-800"><Phone size={14} /></span><span className="truncate text-sm font-medium text-slate-800">Ext. {item.extension}</span></div><span className="text-sm font-semibold tabular-nums text-slate-800">{number(item.incoming)}</span></div><div className="h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-teal-600" style={{ width: `${Math.max(5, (item.incoming / maxIncoming) * 100)}%` }} /></div><p className="mt-1.5 text-[11px] text-slate-500">{number(item.answered)} atendidas · {number(item.missed)} sin respuesta</p></button></li>)}</ol>
                ) : ranking === "dids" && topDids.length > 0 ? (
                  <ol className="space-y-3">{topDids.map((item) => <li key={item.number}><button type="button" onClick={() => { applyFilters({ ...filters, did: item.number, extension: undefined, page: 1 }); document.querySelector("#calls")?.scrollIntoView({ behavior: "smooth" }); }} className="flex min-h-12 w-full items-center justify-between gap-3 rounded-lg px-2 text-left hover:bg-slate-50"><span className="truncate text-sm font-medium text-slate-800">{item.number}</span><span className="text-sm font-semibold tabular-nums text-slate-700">{number(item.incoming)}</span></button></li>)}</ol>
                ) : ranking === "menu" ? (
                  <div className="space-y-2">
                    <ol className="space-y-3" aria-label="Llamadas entrantes por área del menú">
                      {menuAreas.map((item) => <li key={item.key}>
                        <button type="button" onClick={() => { applyFilters({ ...filters, did: data?.menu_did || undefined, extension: item.extension, direction: "Entrante", page: 1 }); document.querySelector("#calls")?.scrollIntoView({ behavior: "smooth" }); }} aria-label={`Ver llamadas de ${item.area}: ${number(item.incoming)} entrantes, extensión ${item.extension}`} className="group w-full rounded-lg px-2 py-2 text-left hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600">
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex min-w-0 items-center gap-2"><span className="grid size-6 shrink-0 place-items-center rounded-md bg-teal-50 text-xs font-semibold text-teal-800">{item.key}</span><span className="truncate text-sm font-medium text-slate-800">{item.area}</span><span className="hidden shrink-0 text-xs text-slate-400 sm:inline">Ext. {item.extension}</span></div>
                            <span className="shrink-0 text-sm font-semibold tabular-nums text-slate-900">{number(item.incoming)} <span className="text-[11px] font-normal text-slate-500">llamadas</span></span>
                          </div>
                          <div className="ml-8 mt-2 h-2 overflow-hidden rounded-full bg-slate-100" role="img" aria-label={`${number(item.incoming)} llamadas entrantes de un máximo de ${number(maxMenuIncoming)}`}><div className="h-full rounded-full bg-teal-600" style={{ width: `${(item.incoming / maxMenuIncoming) * 100}%` }} /></div>
                          <div className="ml-8 mt-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[10px] tabular-nums text-slate-500"><span className="sm:hidden">Ext. {item.extension}</span><span>{number(item.answered)} atendidas · {number(item.missed)} sin respuesta · {number(item.other)} otro estado</span><span className="font-semibold text-teal-800 group-hover:underline">Ver llamadas</span></div>
                        </button>
                      </li>)}
                    </ol>
                    <p className="pt-1 text-[11px] leading-4 text-slate-500">El detalle filtra llamadas entrantes por DDI y extensión final configurados. SMDR no informa directamente la tecla marcada en el menú.</p>
                  </div>
                ) : (
                  <div className="grid min-h-[245px] place-items-center rounded-lg bg-slate-50/80 px-4 text-center"><div><Users size={20} className="mx-auto text-slate-400" /><p className="mt-3 text-sm font-medium text-slate-700">{ranking === "extensions" ? "Aún no hay llamadas por extensión" : "No hay números directos identificados"}</p><p className="mt-1 text-xs text-slate-500">Se muestran solo destinos reportados por el SMDR.</p></div></div>
                )}
              </CardContent>
            </Card>
          </section>

          <Card id="calls" className="scroll-mt-28">
            <CardHeader className="flex-col gap-4"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex flex-wrap items-center gap-2"><div><CardTitle>Llamadas</CardTitle><p className="mt-1 text-xs text-slate-500">{number(data?.pagination.total ?? 0)} coincidencias · periodo completo: {number(data?.summary.total ?? 0)}</p></div>{activeMenuArea && <span className="rounded-full bg-teal-50 px-2.5 py-1 text-xs font-medium text-teal-800">Área: {activeMenuArea.area}</span>}</div><div className="relative w-full sm:w-72"><Search size={16} aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><label className="sr-only" htmlFor="call-search">Buscar por número, extensión o estado</label><Input id="call-search" name="call-search" autoComplete="off" value={query} onChange={(event) => { setQuery(event.target.value); if (filters.page !== 1) applyFilters({ ...filters, page: 1 }); }} className="pl-9" placeholder="Número, extensión…" /></div></div>
              <div className="flex flex-wrap items-center gap-2">
                <label className="sr-only" htmlFor="filter-extension">Filtrar extensión</label><select id="filter-extension" value={filters.extension ?? ""} onChange={(e) => applyFilters({ ...filters, extension: e.target.value || undefined, did: undefined, page: 1 })} className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 focus-visible:ring-2 focus-visible:ring-teal-600"><option value="">Todas las extensiones</option>{data?.extensions.map((item) => <option key={item.extension} value={item.extension}>Ext. {item.extension}</option>)}</select>
                <label className="sr-only" htmlFor="filter-did">Filtrar número directo</label><select id="filter-did" value={filters.did ?? ""} onChange={(e) => applyFilters({ ...filters, did: e.target.value || undefined, extension: undefined, page: 1 })} className="h-9 max-w-52 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 focus-visible:ring-2 focus-visible:ring-teal-600"><option value="">Todos los números directos</option>{data?.dids.map((item) => <option key={item.number} value={item.number}>{item.number}</option>)}</select>
                <label className="sr-only" htmlFor="filter-direction">Filtrar dirección</label><select id="filter-direction" value={filters.direction ?? ""} onChange={(e) => applyFilters({ ...filters, direction: e.target.value || undefined, page: 1 })} className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 focus-visible:ring-2 focus-visible:ring-teal-600"><option value="">Toda dirección</option><option>Entrante</option><option>Saliente</option><option>Interna</option></select>
                <label className="sr-only" htmlFor="filter-result">Filtrar resultado</label><select id="filter-result" value={filters.result ?? ""} onChange={(e) => applyFilters({ ...filters, result: e.target.value || undefined, page: 1 })} className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 focus-visible:ring-2 focus-visible:ring-teal-600"><option value="">Todo resultado</option><option>Atendida</option><option>Sin respuesta</option><option>Recibida</option><option>Estado no indicado</option><option>Completada</option></select>
                <label className="sr-only" htmlFor="page-size">Filas por página</label><select id="page-size" value={filters.per_page} onChange={(e) => applyFilters({ ...filters, per_page: Number(e.target.value), page: 1 })} className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 focus-visible:ring-2 focus-visible:ring-teal-600"><option value={10}>10 por página</option><option value={25}>25 por página</option><option value={50}>50 por página</option></select>
                {(filters.extension || filters.did || filters.direction || filters.result || query) && <button type="button" onClick={() => { setQuery(""); applyFilters({ days, page: 1, per_page: filters.per_page }); }} className="h-9 rounded-lg px-3 text-sm font-medium text-teal-800 hover:bg-teal-50">Limpiar filtros</button>}
              </div>
            </CardHeader>
            <CardContent className="pt-4">
              <div className="overflow-x-auto rounded-lg border border-slate-100"><Table><TableHeader><TableRow className="hover:bg-transparent"><TableHead>Fecha y hora</TableHead><TableHead>Origen</TableHead><TableHead>Destino</TableHead><TableHead>Extensión</TableHead><TableHead>Tipo / resultado</TableHead><TableHead className="text-right">Duración</TableHead></TableRow></TableHeader><TableBody>
                {calls.length ? calls.map((call) => <TableRow key={call.id}><TableCell className="min-w-[145px] whitespace-nowrap text-slate-600">{callDateTime(call)}</TableCell><TableCell className="max-w-[180px] truncate font-medium text-slate-800" title={call.caller}>{call.caller || "—"}</TableCell><TableCell className="max-w-[190px] truncate text-slate-600" title={call.destination}>{call.destination || "—"}</TableCell><TableCell className="font-medium tabular-nums text-slate-700">{call.extension || "—"}</TableCell><TableCell><div className="flex flex-wrap items-center gap-1.5"><Badge variant="muted">{call.direction}</Badge><Badge variant={statusVariant(call.result)}>{call.result}</Badge></div></TableCell><TableCell className="whitespace-nowrap text-right tabular-nums text-slate-600">{durationLabel(call.duration)}</TableCell></TableRow>) : <TableRow><TableCell colSpan={6} className="h-36 text-center"><div className="mx-auto grid size-10 place-items-center rounded-full bg-slate-100 text-slate-500"><PhoneCall size={18} /></div><p className="mt-3 text-sm font-medium text-slate-700">{query || filters.extension || filters.did || filters.direction || filters.result ? "No hay coincidencias" : "No hay llamadas en este periodo"}</p><p className="mt-1 text-xs text-slate-500">{query ? "Prueba otro número, extensión o estado." : "Los nuevos registros aparecerán aquí al recibirse del PBX."}</p></TableCell></TableRow>}
              </TableBody></Table></div>
              <div className="mt-4 flex flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between"><p className="text-xs text-slate-500">{data?.pagination.total ? `Mostrando ${number((data.pagination.page - 1) * data.pagination.per_page + 1)}–${number(Math.min(data.pagination.page * data.pagination.per_page, data.pagination.total))} de ${number(data.pagination.total)}` : "Mostrando 0 llamadas"}</p><div className="flex items-center gap-2"><Button variant="outline" size="sm" disabled={!data || data.pagination.page <= 1 || refreshing} onClick={() => applyFilters({ ...filters, page: Math.max(1, (data?.pagination.page ?? 1) - 1) })}>Anterior</Button><span className="min-w-24 text-center text-xs tabular-nums text-slate-600">Página {data?.pagination.page ?? 1} de {data?.pagination.total_pages ?? 1}</span><Button variant="outline" size="sm" disabled={!data || data.pagination.page >= data.pagination.total_pages || refreshing} onClick={() => applyFilters({ ...filters, page: Math.min(data?.pagination.total_pages ?? 1, (data?.pagination.page ?? 1) + 1) })}>Siguiente</Button></div></div>
            </CardContent>
          </Card>

          <footer className="flex flex-col justify-between gap-2 pb-2 text-xs text-slate-500 sm:flex-row sm:items-center"><span className="inline-flex items-center gap-1.5"><RadioTower size={13} />Línea Clara · Datos almacenados localmente</span><span>Sesión: {userName}</span></footer>
        </main>
      </div>
    </div>
  );
}
