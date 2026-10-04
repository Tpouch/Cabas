import type { Metadata } from "next";
import { LoginForm } from "@/components/auth/login-form";
import { LogoMark } from "@/components/brand/logo-mark";
import { safeNextPath } from "@/lib/auth/access";
import { loginAction } from "@/server/actions/auth";

export const metadata: Metadata = { title: "Connexion" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <div className="grid w-full max-w-sm gap-6">
        <div className="flex items-center justify-center gap-3">
          <LogoMark className="size-12" />
          <h1 className="text-3xl">cabas</h1>
        </div>
        <LoginForm action={loginAction} next={safeNextPath(next)} />
      </div>
    </main>
  );
}
