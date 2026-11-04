import type { ReactNode } from "react";
import { AuthProvider } from "@/lib/auth";
import Nav from "@/components/Nav";
import "./globals.css";

export const metadata = { title: "DecPub - publikasi ilmiah triple-blind" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="id">
      <body>
        <AuthProvider>
          <Nav />
          <hr />
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
