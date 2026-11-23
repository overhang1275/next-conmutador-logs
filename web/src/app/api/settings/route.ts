import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getRustSettings, saveRustSettings } from "@/lib/rust-api";

export async function GET() {
  if (!(await auth())) return NextResponse.json({ error: "Tu sesión venció. Vuelve a iniciar sesión." }, { status: 401 });
  try {
    return NextResponse.json(await getRustSettings());
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo consultar la configuración." }, { status: 503 });
  }
}

export async function PUT(request: Request) {
  if (!(await auth())) return NextResponse.json({ error: "Tu sesión venció. Vuelve a iniciar sesión." }, { status: 401 });
  try {
    const settings = await request.json();
    return NextResponse.json(await saveRustSettings(settings));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo guardar la configuración." }, { status: 400 });
  }
}
