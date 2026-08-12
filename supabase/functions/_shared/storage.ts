// Storage helpers for anonymous offer photo uploads (spec §5.3, §28, §34).
// The offer-uploads bucket is PRIVATE; writes happen only through signed
// upload URLs issued here with the service role, and submissions must prove
// possession of the HMAC submit token issued alongside each path.

import { getAdminClient } from "./supabase-admin.ts";
import { ALLOWED_MIME, MAX_FILE_BYTES, uploadSubmitToken } from "./offer-validation.ts";

export const OFFER_BUCKET = "offer-uploads";
export const OFFER_UPLOAD_PREFIX = "offer-drafts";

export interface IssuedUpload {
  path: string;
  storage_token: string;
  submit_token: string;
}

export async function issueOfferUpload(opts: {
  fileType: string;
  sizeBytes: number;
  draftId: string;
  secret: string;
}): Promise<IssuedUpload> {
  const ext = ALLOWED_MIME[opts.fileType.toLowerCase()];
  if (!ext) throw new Error("Unsupported file type.");
  if (!Number.isFinite(opts.sizeBytes) || opts.sizeBytes <= 0 || opts.sizeBytes > MAX_FILE_BYTES) {
    throw new Error("File size out of limits.");
  }

  const path = `${OFFER_UPLOAD_PREFIX}/${opts.draftId}/${crypto.randomUUID()}.${ext}`;
  const { data, error } = await getAdminClient()
    .storage
    .from(OFFER_BUCKET)
    .createSignedUploadUrl(path);
  if (error || !data) {
    throw new Error("Could not prepare the upload.");
  }

  const submitToken = await uploadSubmitToken(opts.secret, path);
  return { path, storage_token: data.token, submit_token: submitToken };
}

export function draftDirOfPath(path: string): { draftId: string; dir: string } | null {
  const parts = path.split("/");
  if (parts.length !== 3 || parts[0] !== OFFER_UPLOAD_PREFIX) return null;
  return { draftId: parts[1], dir: `${parts[0]}/${parts[1]}` };
}

export async function storedFileNames(dir: string): Promise<Set<string>> {
  const { data, error } = await getAdminClient()
    .storage
    .from(OFFER_BUCKET)
    .list(dir, { limit: 100 });
  if (error) throw new Error("Could not verify uploads.");
  return new Set((data ?? []).map((entry) => entry.name));
}
