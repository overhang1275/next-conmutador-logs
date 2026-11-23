import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { ArrowLeft, Settings2 } from "lucide-react";
import { auth } from "@/auth";
import { MenuAreaSettingsForm } from "@/components/menu-area-settings-form";
import { SettingsForm } from "@/components/settings-form";
import { getMenuConfig, getRustSettings } from "@/lib/rust-api";

async function AuthenticatedSettings() {
  await connection();
  const session = await auth();
  if (!session) redirect("/login");
  let settings = null;
  let error = "";
  try { settings = await getRustSettings(); }
  catch (caught) { error = caught instanceof Error ? caught.message : "No se pudo consultar el servicio Rust."; }
  let menuConfig = null;
  let menuError = "";
  try { menuConfig = await getMenuConfig(); }
  catch (caught) { menuError = caught instanceof Error ? caught.message : "No se pudo consultar la configuración de áreas."; }
  return <main className="mx-auto min-h-screen max-w-4xl space-y-6 px-4 py-8 sm:px-8">
    <Link href="/" className="inline-flex min-h-10 items-center gap-2 rounded-md text-sm font-medium text-teal-800 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"><ArrowLeft size={16} />Volver al tablero</Link>
    <header className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-5 sm:p-7"><div className="grid size-12 place-items-center rounded-xl bg-teal-50 text-teal-800"><Settings2 /></div><div><p className="text-sm text-slate-500">Conexión SMDR</p><h1 className="text-2xl font-semibold tracking-tight text-slate-900">Configuración del conmutador</h1></div></header>
    {error && <p role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">{error} Asegúrate de que el servicio Rust esté ejecutándose.</p>}
    {settings && <SettingsForm initialSettings={settings} />}
    {menuError && <p role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">{menuError} Asegúrate de que el servicio Rust esté actualizado.</p>}
    {menuConfig && <MenuAreaSettingsForm initialConfig={menuConfig} />}
    <p className="text-xs leading-5 text-slate-500">La configuración aplica al colector SMDR; no modifica el enrutamiento, extensiones ni troncales del Panasonic.</p>
  </main>;
}

export default function SettingsPage() {
  return <Suspense fallback={<main className="min-h-screen p-8" aria-label="Cargando configuración"><div className="mx-auto h-56 max-w-4xl animate-pulse rounded-xl bg-white ring-1 ring-slate-200 motion-reduce:animate-none" /></main>}><AuthenticatedSettings /></Suspense>;
}
