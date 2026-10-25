import Link from "next/link";
import { ResetForm } from "./reset-form";

export const metadata = { title: "Choose a new password" };

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Choose a new password</h1>
      <p className="mt-1 text-sm text-slate-600">Use at least 10 characters with upper and lower case letters and a number.</p>
      <div className="mt-6">
        {token ? <ResetForm token={token} /> : <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-900">This link is missing its token. <Link href="/forgot-password" className="font-medium underline">Request a new one</Link>.</p>}
      </div>
    </>
  );
}
