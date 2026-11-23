import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getMenuConfig, saveMenuConfig } from "@/lib/rust-api";

export async function GET() {
  if (!(await auth())) return NextResponse.json({ error: "Tu sesión venció. Vuelve a iniciar sesión." }, { status: 401 });
  try {
    return NextResponse.json(await getMenuConfig());
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo consultar la configuración de áreas." }, { status: 503 });
  }
}

export async function PUT(request: Request) {
  if (!(await auth())) return NextResponse.json({ error: "Tu sesión venció. Vuelve a iniciar sesión." }, { status: 401 });
  try {
    return NextResponse.json(await saveMenuConfig(await request.json()));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo guardar la configuración de áreas." }, { status: 400 });
  }
}
