import Link from "next/link";
import { Logo } from "@/components/logo";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const dev = process.env.NODE_ENV !== "production";
  return (
    <>
      <div className="mb-8 lg:hidden"><Logo /></div>
      <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
      <p className="mt-1 text-sm text-slate-600">Use the email and password from your administrator.</p>
      <div className="mt-6"><LoginForm next={next} /></div>
      <p className="mt-4 text-sm"><Link href="/forgot-password" className="font-medium text-blue-700 hover:underline">Forgot your password?</Link></p>
      {dev && (
        <details className="mt-8 rounded-lg border border-dashed border-slate-300 p-3 text-xs text-slate-600">
          <summary className="cursor-pointer font-medium text-slate-700">Demo accounts (development only)</summary>
          <p className="mt-2">Password for all: <code className="rounded bg-slate-100 px-1">ProjectPulse#2026</code></p>
          <ul className="mt-1 space-y-0.5">
            <li>superadmin@projectpulse.dev</li><li>admin@projectpulse.dev</li><li>mumtaz.pm@ppulse.dev</li><li>mumtaz.lead@projectpulse.dev</li><li>aisha@projectpulse.dev</li><li>client@ppulse.dev</li>
          </ul>
        </details>
      )}
    </>
  );
}
