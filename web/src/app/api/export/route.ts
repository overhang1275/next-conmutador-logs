import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getRawExport } from "@/lib/rust-api";

export async function GET() {
  if (!(await auth())) return new NextResponse("No autenticado", { status: 401 });
  try {
    const response = await getRawExport();
    if (!response.ok) return new NextResponse("No se pudo exportar", { status: response.status });
    return new NextResponse(await response.text(), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": "attachment; filename=llamadas-smdr.csv",
      },
    });
  } catch {
    return new NextResponse("No hay conexión con el servicio Rust", { status: 503 });
  }
}
