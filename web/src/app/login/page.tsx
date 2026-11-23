import { RadioTower, ShieldCheck } from "lucide-react";
import { LoginForm } from "@/components/login-form";

export default function LoginPage() {
  return (
    <>
    <a href="#login-main" className="sr-only z-50 rounded-md bg-white px-4 py-2 text-sm font-semibold text-teal-900 shadow focus:not-sr-only focus:fixed focus:left-4 focus:top-4">Saltar al contenido</a>
    <main id="login-main" className="grid min-h-screen place-items-center px-5 py-12">
      <div className="w-full max-w-[430px]">
        <div className="mb-8 flex items-center gap-3">
          <div className="grid size-12 place-items-center rounded-2xl bg-teal-700 text-white shadow-sm"><RadioTower size={23} aria-hidden="true" /></div>
          <div><p className="text-lg font-semibold tracking-tight">Línea Clara</p><p className="text-sm text-slate-500">Monitor de llamadas</p></div>
        </div>
        <section className="rounded-2xl border border-slate-200 bg-white p-7 shadow-sm sm:p-9">
          <div className="mb-7">
            <div className="mb-4 grid size-10 place-items-center rounded-xl bg-teal-50 text-teal-800"><ShieldCheck size={20} aria-hidden="true" /></div>
            <h1 className="text-2xl font-semibold tracking-tight">Iniciar sesión</h1>
            <p className="mt-2 text-sm leading-6 text-slate-500">Accede al panel privado de llamadas de tu conmutador.</p>
          </div>
          <LoginForm />
        </section>
        <p className="mt-5 text-center text-xs text-slate-500">Acceso local protegido · Panasonic KX‑NS500</p>
      </div>
    </main>
    </>
  );
}
