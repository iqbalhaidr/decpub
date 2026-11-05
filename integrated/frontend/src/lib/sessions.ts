/** Daftar naskah milik pengguna beserta status on-chain-nya (untuk /author, /author/revise, /author/disclose). */
import { api } from "./api";
import type { ManuscriptRow, OwnerDetail } from "./types";

export interface OwnSession {
  manuscript: ManuscriptRow;
  /** Null bila naskah belum diajukan atau sesi belum terbaca. */
  detail: OwnerDetail | null;
  error?: string;
}

export async function loadOwnSessions(): Promise<OwnSession[]> {
  const rows = (await api.get<ManuscriptRow[]>("/manuscripts")).data;
  return Promise.all(
    rows.map(async (manuscript): Promise<OwnSession> => {
      if (!manuscript.submittedAt) return { manuscript, detail: null };
      try {
        return { manuscript, detail: (await api.get<OwnerDetail>(`/flows/sessions/${manuscript.sessionId}`)).data };
      } catch (e) {
        return { manuscript, detail: null, error: (e as Error).message };
      }
    }),
  );
}

export const statusOf = (s: OwnSession): string => s.detail?.session?.status ?? (s.manuscript.submittedAt ? "(tidak terbaca)" : "belum diajukan");
