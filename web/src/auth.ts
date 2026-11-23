import { createHash, timingSafeEqual } from "node:crypto";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";

function matches(actual: string, expected: string) {
  const actualHash = createHash("sha256").update(actual).digest();
  const expectedHash = createHash("sha256").update(expected).digest();
  return timingSafeEqual(actualHash, expectedHash);
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: {
        username: { label: "Usuario", type: "text" },
        password: { label: "Contraseña", type: "password" },
      },
      async authorize(credentials) {
        const username = String(credentials?.username ?? "");
        const password = String(credentials?.password ?? "");
        const expectedUsername = process.env.DASHBOARD_USER ?? "";
        const expectedPassword = process.env.DASHBOARD_PASSWORD ?? "";
        if (!expectedUsername || !expectedPassword) return null;
        if (!matches(username, expectedUsername) || !matches(password, expectedPassword)) return null;
        return { id: "local-admin", name: expectedUsername };
      },
    }),
  ],
});
