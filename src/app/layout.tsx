import type { Metadata } from "next";
import { Geist, Geist_Mono, Inter } from "next/font/google";
import "./globals.css";
import { ToastProvider } from "@/components/providers/toast-provider";

const geistSans = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
});

// Inter is the Professional theme's sans. Self-hosted through next/font (no
// render-blocking Google Fonts request), so the opt-in design costs no latency.
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "ESS System - Employee Self Service",
  description: "Employee Self Service System",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        {/*
          Apply the saved UI design BEFORE first paint.

          This runs as a blocking script rather than a React effect for two
          reasons: it avoids a flash of the default design, and — critically —
          it never reads localStorage during render, which is what causes
          hydration mismatches (React #418). React does not own the `data-ui`
          attribute, so the server and client trees stay identical.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('ess_ui_theme');if(t==='pro'){document.documentElement.setAttribute('data-ui','pro')}}catch(e){}})();`,
          }}
        />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} ${inter.variable} antialiased`}>
        <ToastProvider>
          {children}
        </ToastProvider>
      </body>
    </html>
  );
}
