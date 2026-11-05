import type { ProgressSummary } from "@/lib/types";

/** Ringkasan langkah sistem yang dijalankan server setelah sebuah aksi (polos). */
export default function ProgressNote({ progress }: { progress?: ProgressSummary | null }) {
  if (!progress) return null;
  return (
    <p>
      Langkah sistem: status {progress.status ?? "?"}
      {progress.actions?.length ? `; dikerjakan: ${progress.actions.join(", ")}` : ""}
      {progress.blocked ? `; TERTUNDA: ${progress.blocked}` : ""}.
    </p>
  );
}
