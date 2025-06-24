import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AppFrappeProvider } from "@/components/providers/frappe-provider";
import { ToastProvider } from "@/components/providers/toast-provider";

const geistSans = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
});

export const metadata: Metadata = {
  title: "ESS System - Employee Self Service",
  description: "Employee Self Service System powered by Frappe",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <ToastProvider>
          <AppFrappeProvider>
            {children}
          </AppFrappeProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
