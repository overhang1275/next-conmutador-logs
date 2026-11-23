"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function LoginForm() {
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const result = await signIn("credentials", {
        username: String(form.get("username") ?? ""),
        password: String(form.get("password") ?? ""),
        redirect: false,
        redirectTo: "/",
      });
      if (result?.error) {
        setError("Usuario o contraseña incorrectos.");
        setPending(false);
        return;
      }
      window.location.assign(result?.url ?? "/");
    } catch {
      setError("No se pudo iniciar sesión. Comprueba la conexión local y vuelve a intentarlo.");
      setPending(false);
    }
  }

  return (
    <form className="space-y-5" onSubmit={submit}>
      <div className="space-y-2"><label htmlFor="username" className="text-sm font-medium text-slate-700">Usuario</label><Input id="username" name="username" autoComplete="username" spellCheck={false} required /></div>
      <div className="space-y-2"><label htmlFor="password" className="text-sm font-medium text-slate-700">Contraseña</label><Input id="password" name="password" type="password" autoComplete="current-password" required /></div>
      {error && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>}
      <Button className="w-full" type="submit" disabled={pending}>{pending ? "Validando…" : "Entrar al panel"}</Button>
    </form>
  );
}
