import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "E-Rechnung-Check",
  description:
    "Check German e-invoices (XRechnung, ZUGFeRD) with the official KoSIT rules, understand every error in plain German or English, and convert PDF invoices into XRechnung.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="de">
      <body className="min-h-dvh bg-bg text-ink antialiased">{children}</body>
    </html>
  );
}
