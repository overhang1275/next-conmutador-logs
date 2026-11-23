import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getDashboard, type DashboardQuery } from "@/lib/rust-api";

export async function GET(request: Request) {
  if (!(await auth())) return NextResponse.json({ error: "Tu sesión venció. Vuelve a iniciar sesión." }, { status: 401 });
  const params = new URL(request.url).searchParams;
  const query: DashboardQuery = Object.fromEntries(["days", "page", "per_page", "extension", "did", "direction", "result"]
    .flatMap((key) => params.has(key) ? [[key, ["days", "page", "per_page"].includes(key) ? Number(params.get(key)) : params.get(key)!]] : []));
  try {
    return NextResponse.json(await getDashboard(query));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo consultar el servicio Rust." },
      { status: 503 },
    );
  }
}

export async function POST(request: Request) {
  if (!(await auth())) return NextResponse.json({ error: "Tu sesión venció. Vuelve a iniciar sesión." }, { status: 401 });
  try {
    const query = await request.json() as DashboardQuery;
    return NextResponse.json(await getDashboard(query));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo consultar el servicio Rust." }, { status: 503 });
  }
}
