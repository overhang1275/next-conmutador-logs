import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { auth } from "@/auth";
import { DashboardView } from "@/components/dashboard-view";
import { getDashboard } from "@/lib/rust-api";

function DashboardLoading() {
  return <main className="min-h-screen p-6 sm:p-10" aria-label="Cargando monitor de llamadas"><div className="mx-auto max-w-[1500px] animate-pulse space-y-5 motion-reduce:animate-none"><div className="h-10 w-72 rounded-lg bg-slate-200" /><div className="h-20 rounded-xl bg-white ring-1 ring-slate-200" /><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[0, 1, 2, 3].map((item) => <div key={item} className="h-28 rounded-xl bg-white ring-1 ring-slate-200" />)}</div><div className="grid gap-5 xl:grid-cols-[1.8fr_.82fr]"><div className="h-[340px] rounded-xl bg-white ring-1 ring-slate-200" /><div className="h-[340px] rounded-xl bg-white ring-1 ring-slate-200" /></div></div></main>;
}

function initialNumber(value: string | string[] | undefined, allowed: number[], fallback: number) {
  const parsed = Number(Array.isArray(value) ? value[0] : value);
  return allowed.includes(parsed) ? parsed : fallback;
}

async function AuthenticatedDashboard({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await connection();
  const session = await auth();
  if (!session) redirect("/login");
  const params = await searchParams;
  const initialFilters = {
    days: initialNumber(params.days, [7, 30, 90], 7),
    page: Math.max(1, Number(Array.isArray(params.page) ? params.page[0] : params.page) || 1),
    per_page: initialNumber(params.per_page, [10, 25, 50], 25),
    extension: typeof params.extension === "string" ? params.extension : undefined,
    did: typeof params.did === "string" ? params.did : undefined,
    direction: typeof params.direction === "string" ? params.direction : undefined,
    result: typeof params.result === "string" ? params.result : undefined,
  };

  let initialData = null;
  let initialError = "";
  try {
    initialData = await getDashboard(initialFilters);
  } catch (error) {
    initialError = error instanceof Error ? error.message : "No se pudo consultar el servicio Rust.";
  }

  return <DashboardView initialData={initialData} initialError={initialError} initialFilters={{ ...initialFilters, page: initialData?.pagination.page ?? initialFilters.page }} userName={session.user?.name ?? "Administrador"} />;
}

export default function HomePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <Suspense fallback={<DashboardLoading />}><AuthenticatedDashboard searchParams={searchParams} /></Suspense>;
}
