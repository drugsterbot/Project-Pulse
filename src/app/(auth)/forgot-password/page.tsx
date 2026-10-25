import Link from "next/link";
import { ForgotForm } from "./forgot-form";

export const metadata = { title: "Reset your password" };

export default function ForgotPasswordPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Reset your password</h1>
      <p className="mt-1 text-sm text-slate-600">Enter your email and we’ll send a reset link that works for one hour.</p>
      <div className="mt-6"><ForgotForm /></div>
      <p className="mt-4 text-sm"><Link href="/login" className="font-medium text-blue-700 hover:underline">Back to sign in</Link></p>
    </>
  );
}
