"use client";

/** Pintu halaman penulis (akun penulis, atau penelaah yang mengajukan naskah). Lihat `RoleGate`. */
import type { ReactNode } from "react";
import RoleGate from "@/components/RoleGate";
import type { AuthorCtx } from "@/lib/author";

export default function AuthorGate({ children }: { children: (ctx: AuthorCtx) => ReactNode }) {
  return <RoleGate roles={["author", "reviewer"]} label="penulis">{children}</RoleGate>;
}
