import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Línea Clara · Monitor de llamadas",
  description: "Monitoreo local de llamadas del Panasonic KX-NS500",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="es"><body>{children}</body></html>;
}
