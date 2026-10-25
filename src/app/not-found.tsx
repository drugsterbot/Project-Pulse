import Link from "next/link";
import { buttonClass } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
      <p className="text-sm font-medium text-blue-700">404</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">We can’t find that page</h1>
      <p className="mt-2 max-w-sm text-slate-600">It may have been moved, deleted, or you may not have access to it.</p>
      <Link href="/dashboard" className={buttonClass("primary", "md", "mt-6")}>Back to dashboard</Link>
    </div>
  );
}
