/**
 * Citizen ground-truth photos (backend: /api/ground-truth).
 * Anyone can submit; each photo's fingerprint is sealed on the ledger.
 */
import { apiError } from "@/lib/apiError";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";

export const GT_CATEGORIES = [
  "Flooding",
  "New construction",
  "Encroachment on water body",
  "Farmland",
  "Tree cutting",
  "Other",
] as const;

export const GT_MAX_BYTES = 5 * 1024 * 1024;

export interface Observation {
  block_index: number;
  timestamp: string;
  lat: number;
  lng: number;
  category: string;
  note: string;
  photo_file: string;
  recorded_by: string;
  /** Fingerprint sealed on the ledger */
  sealed_sha256: string | null;
  /** Does the stored photo still hash to the sealed fingerprint? */
  photo_intact: boolean;
  /** Does the block itself still pass verification? */
  block_intact: boolean;
}

export function photoUrl(file: string): string {
  return `${API_BASE}/api/ground-truth/photo/${file}`;
}

export async function fetchObservations(): Promise<Observation[]> {
  const res = await fetch(`${API_BASE}/api/ground-truth`);
  if (!res.ok) throw new Error("Could not load citizen photos.");
  return (await res.json()).observations;
}

/**
 * SHA-256 of the file, computed in the browser before upload. Shown next to
 * the server's result so the person can see both sides arrive at the same
 * fingerprint - the core idea of hashing, made visible.
 */
export async function sha256Hex(file: File): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    // Data URL is "data:<type>;base64,<payload>" - keep only the payload
    reader.onload = () => resolve(String(reader.result).split(",", 2)[1] ?? "");
    reader.onerror = () => reject(new Error("Could not read the photo."));
    reader.readAsDataURL(file);
  });
}

export async function submitObservation(args: {
  file: File;
  lat: number;
  lng: number;
  category: string;
  note: string;
  /** Signed pass from sign-in; the server reads who submitted it from this */
  token: string;
}): Promise<{ observation: Observation; block: { index: number; hash: string; nonce: number; data: { photo_sha256: string } } }> {
  const res = await fetch(`${API_BASE}/api/ground-truth`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${args.token}`,
    },
    body: JSON.stringify({
      image_base64: await toBase64(args.file),
      lat: args.lat,
      lng: args.lng,
      category: args.category,
      note: args.note,
    }),
  });
  if (!res.ok) throw await apiError(res, "Upload failed");
  return res.json();
}
