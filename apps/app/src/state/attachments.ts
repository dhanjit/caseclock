/**
 * Per-case image attachments store (REQUIREMENTS §10). Loads a case's thumbnails
 * on demand (the gallery / mind-map open), and adds/removes through the repository.
 * Originals are fetched lazily via getOriginal() for the lightbox.
 */

import { create } from "zustand";
import { AttachmentRepository, type AttachmentThumb, type NewAttachment, type AttachmentKind } from "@/domain/attachment";
import { useSession } from "./session";

function repo(): AttachmentRepository {
  return new AttachmentRepository(useSession.getState().client);
}

interface AttachmentsState {
  byCase: Record<string, AttachmentThumb[]>;
  loadCase: (caseId: string) => Promise<void>;
  addImages: (items: NewAttachment[]) => Promise<void>;
  remove: (caseId: string, id: string) => Promise<void>;
  retag: (caseId: string, id: string, patch: { kind?: AttachmentKind; refId?: string | null; caption?: string | null }) => Promise<void>;
  getOriginal: (blobRef: string) => Promise<Uint8Array | null>;
}

export const useAttachments = create<AttachmentsState>((set, get) => ({
  byCase: {},

  async loadCase(caseId) {
    const list = await repo().listForCase(caseId);
    set((s) => ({ byCase: { ...s.byCase, [caseId]: list } }));
  },

  async addImages(items) {
    if (items.length === 0) return;
    await repo().addMany(items);
    await get().loadCase(items[0].caseId);
  },

  async remove(caseId, id) {
    await repo().remove(id);
    await get().loadCase(caseId);
  },

  async retag(caseId, id, patch) {
    await repo().update(id, patch);
    await get().loadCase(caseId);
  },

  async getOriginal(blobRef) {
    return repo().getOriginal(blobRef);
  },
}));
