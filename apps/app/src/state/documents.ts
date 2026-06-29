/**
 * Per-case document store (REQUIREMENTS §7). Loads a case's documents on demand
 * and persists confirmed entries through the repository.
 */

import { create } from "zustand";
import { DocumentRepository, type DocumentRecord, type DocumentDraft } from "@/domain/document";
import { useSession } from "./session";

function repo(): DocumentRepository {
  return new DocumentRepository(useSession.getState().client);
}

interface DocumentsState {
  byCase: Record<string, DocumentRecord[]>;
  loadCase: (caseId: string) => Promise<void>;
  saveConfirmed: (caseId: string, drafts: DocumentDraft[]) => Promise<void>;
  addManual: (caseId: string, draft: DocumentDraft) => Promise<void>;
  update: (caseId: string, id: string, patch: Partial<DocumentRecord>) => Promise<void>;
  remove: (caseId: string, id: string) => Promise<void>;
  getOriginal: (blobRef: string) => Promise<Uint8Array | null>;
}

export const useDocuments = create<DocumentsState>((set, get) => ({
  byCase: {},

  async loadCase(caseId) {
    const list = await repo().listForCase(caseId);
    set((s) => ({ byCase: { ...s.byCase, [caseId]: list } }));
  },

  async saveConfirmed(caseId, drafts) {
    if (drafts.length === 0) return;
    await repo().addConfirmed(caseId, drafts);
    await get().loadCase(caseId);
  },

  async addManual(caseId, draft) {
    await repo().addManual(caseId, draft);
    await get().loadCase(caseId);
  },

  async update(caseId, id, patch) {
    await repo().update(id, patch);
    await get().loadCase(caseId);
  },

  async remove(caseId, id) {
    await repo().remove(id);
    await get().loadCase(caseId);
  },

  async getOriginal(blobRef) {
    return repo().getOriginal(blobRef);
  },
}));
