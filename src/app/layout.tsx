import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ToastProvider } from "@/components/ui/toast";

export const metadata: Metadata = { title: { default: "ProjectPulse", template: "%s · ProjectPulse" }, description: "Projects, tasks, daily reports and team collaboration in one place." };
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#0f1b2d" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body><ToastProvider>{children}</ToastProvider></body>
    </html>
  );
}
