import { cn } from "@/lib/utils";
import type { ButtonHTMLAttributes } from "react";

const variants = {
  primary: "bg-blue-600 text-white hover:bg-blue-700 shadow-xs",
  secondary: "bg-white text-slate-800 ring-1 ring-inset ring-slate-300 hover:bg-slate-50",
  ghost: "text-slate-700 hover:bg-slate-100",
  danger: "bg-red-600 text-white hover:bg-red-700 shadow-xs",
  success: "bg-green-600 text-white hover:bg-green-700 shadow-xs",
  subtle: "bg-blue-50 text-blue-700 hover:bg-blue-100",
} as const;
const sizes = { sm: "h-8 px-2.5 text-xs gap-1.5", md: "h-9 px-3.5 text-sm gap-2", icon: "h-9 w-9 justify-center" } as const;
export type ButtonVariant = keyof typeof variants;

export const buttonClass = (variant: ButtonVariant = "primary", size: keyof typeof sizes = "md", extra?: string) =>
  cn("inline-flex items-center justify-center whitespace-nowrap rounded-md font-medium transition-colors disabled:pointer-events-none disabled:opacity-50", variants[variant], sizes[size], extra);

export function Button({ variant = "primary", size = "md", className, type = "button", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: keyof typeof sizes }) {
  return <button type={type} className={buttonClass(variant, size, className)} {...props} />;
}
