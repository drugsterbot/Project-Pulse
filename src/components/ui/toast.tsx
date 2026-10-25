"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { CheckCircle2, AlertCircle, X } from "lucide-react";

type Toast = { id: number; message: string; tone: "success" | "error" };
const Ctx = createContext<{ toast: (message: string, tone?: Toast["tone"]) => void }>({ toast: () => {} });
export const useToast = () => useContext(Ctx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const toast = useCallback((message: string, tone: Toast["tone"] = "success") => {
    const id = Date.now() + Math.random();
    setItems((xs) => [...xs.slice(-3), { id, message, tone }]);
    setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), tone === "error" ? 7000 : 4000);
  }, []);
  return (
    <Ctx.Provider value={{ toast }}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[100] flex flex-col items-center gap-2 px-4 sm:items-end sm:pr-6" aria-live="polite" role="status">
        {items.map((t) => (
          <div key={t.id} className="toast-in pointer-events-auto flex max-w-md items-start gap-2.5 rounded-lg bg-ink px-4 py-3 text-sm text-white shadow-lg">
            {t.tone === "success" ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-green-400" aria-hidden /> : <AlertCircle className="mt-0.5 size-4 shrink-0 text-red-400" aria-hidden />}
            <span className="flex-1">{t.message}</span>
            <button aria-label="Dismiss" onClick={() => setItems((xs) => xs.filter((x) => x.id !== t.id))} className="text-slate-400 hover:text-white"><X className="size-4" /></button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
