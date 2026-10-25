import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { format, formatDistanceToNowStrict } from "date-fns";

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));

export const DAY_MS = 86_400_000;

/** yyyy-mm-dd for a Date (UTC based, matches @db.Date columns). */
export const isoDate = (d: Date) => d.toISOString().slice(0, 10);
/** Parse yyyy-mm-dd into a UTC-midnight Date. */
export const parseDateOnly = (s: string) => new Date(`${s}T00:00:00.000Z`);
export const todayUTC = () => parseDateOnly(isoDate(new Date()));
export const addDays = (d: Date, n: number) => new Date(d.getTime() + n * DAY_MS);
/** Monday-based start of week (UTC). */
export const startOfWeek = (d: Date) => {
  const x = parseDateOnly(isoDate(d));
  const dow = (x.getUTCDay() + 6) % 7;
  return addDays(x, -dow);
};
export const isWorkday = (d: Date) => ![0, 6].includes(d.getUTCDay());

export const fmtDate = (d?: Date | string | null) => (d ? format(new Date(d), "d MMM yyyy") : "—");
export const fmtShortDate = (d?: Date | string | null) => (d ? format(new Date(d), "d MMM") : "—");
export const fmtDateTime = (d?: Date | string | null) => (d ? format(new Date(d), "d MMM yyyy, HH:mm") : "—");
export const timeAgo = (d: Date | string) => formatDistanceToNowStrict(new Date(d), { addSuffix: true });
export const fmtHours = (h?: number | null) => `${(Math.round((h ?? 0) * 10) / 10).toString()}h`;
export const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("");
export const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);
export const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
export const groupBy = <T, K extends string>(xs: T[], key: (x: T) => K) =>
  xs.reduce((acc, x) => ((acc[key(x)] ||= []).push(x), acc), {} as Record<K, T[]>);
export const uniq = <T,>(xs: T[]) => [...new Set(xs)];
export const bytes = (n: number) => (n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`);
