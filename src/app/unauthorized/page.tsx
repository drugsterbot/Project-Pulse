import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { buttonClass } from "@/components/ui/button";

export const metadata = { title: "No access" };

export default function Unauthorized() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-red-50 text-red-600"><ShieldAlert className="size-6" aria-hidden /></div>
      <h1 className="text-2xl font-semibold tracking-tight">You don’t have access to this page</h1>
      <p className="mt-2 max-w-md text-slate-600">Your role doesn’t include this area. If you think that’s a mistake, ask a project manager or administrator to update your access.</p>
      <Link href="/dashboard" className={buttonClass("primary", "md", "mt-6")}>Go to dashboard</Link>
    </div>
  );
}
