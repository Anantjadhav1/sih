"use client";

import { useEffect, useState } from "react";
import { Camera, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isAuthError } from "@/lib/apiError";
import { GT_CATEGORIES, GT_MAX_BYTES, sha256Hex, submitObservation } from "@/lib/groundTruth";
import { shortHash } from "@/lib/ledger";
import { useRole } from "@/lib/roles";

interface Receipt {
  blockIndex: number;
  browserSha: string;
  serverSha: string;
}

/**
 * "Report what you see": pick a spot on the map, attach a photo, and its
 * fingerprint is sealed on the blockchain. Open to every role - citizen
 * evidence is only useful if citizens can submit it.
 */
export default function CitizenReportPanel({
  pickMode,
  draftLocation,
  onStart,
  onCancel,
  onSubmitted,
}: {
  pickMode: boolean;
  draftLocation: [number, number] | null;
  onStart: () => void;
  onCancel: () => void;
  onSubmitted: () => void;
}) {
  const { token, signOut } = useRole();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [browserSha, setBrowserSha] = useState<string | null>(null);
  const [category, setCategory] = useState<string>(GT_CATEGORIES[0]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);

  // Release the preview's object URL when the photo changes or we unmount
  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function reset() {
    setFile(null);
    setBrowserSha(null);
    setNote("");
    setError(null);
  }

  async function choose(f: File | null) {
    setError(null);
    setBrowserSha(null);
    if (!f) return setFile(null);
    if (!["image/jpeg", "image/png", "image/webp"].includes(f.type)) {
      setFile(null);
      return setError("Please choose a JPEG, PNG or WebP photo.");
    }
    if (f.size > GT_MAX_BYTES) {
      setFile(null);
      return setError("Photos must be under 5 MB.");
    }
    setFile(f);
    setBrowserSha(await sha256Hex(f));
  }

  async function submit() {
    if (!file || !draftLocation || !token) return;
    setBusy(true);
    setError(null);
    try {
      const res = await submitObservation({
        file,
        lat: draftLocation[0],
        lng: draftLocation[1],
        category,
        note,
        token,
      });
      setReceipt({
        blockIndex: res.block.index,
        browserSha: browserSha ?? "",
        serverSha: res.block.data.photo_sha256,
      });
      reset();
      onSubmitted();
    } catch (e) {
      // The server refused the pass (expired or invalid) - sign in again
      if (isAuthError(e)) return signOut();
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-2.5 rounded-lg border border-primary/30 bg-primary/5 p-3">
      <p className="flex items-center gap-1.5 text-xs font-semibold">
        <Camera className="h-3.5 w-3.5 text-primary" />
        Report what you see on the ground
      </p>

      {receipt && !pickMode && (
        <div className="rounded-md border border-border bg-background/40 px-3 py-2 text-[11px]">
          <p className="font-medium text-primary">✓ Sealed in Block #{receipt.blockIndex}</p>
          <p className="mt-0.5 leading-relaxed text-muted-foreground">
            Your browser and the server both fingerprinted the photo as{" "}
            <span className="font-mono text-foreground">{shortHash(receipt.serverSha)}</span>
            {receipt.browserSha === receipt.serverSha ? " - an exact match." : " (mismatch!)"}
          </p>
        </div>
      )}

      {!pickMode ? (
        <>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Seen flooding or a building on a lake edge? Pin a photo. Its fingerprint goes on the
            blockchain, so it can&rsquo;t be swapped later.
          </p>
          <Button
            size="sm"
            className="h-8 w-full gap-1.5 text-[11px]"
            onClick={() => {
              setReceipt(null);
              onStart();
            }}
          >
            <MapPin className="h-3.5 w-3.5" />
            Add a photo
          </Button>
        </>
      ) : !draftLocation ? (
        <>
          <p className="text-[11px] font-medium">Click the map where the photo was taken.</p>
          <Button size="sm" variant="secondary" className="h-8 w-full text-[11px]" onClick={onCancel}>
            Cancel
          </Button>
        </>
      ) : (
        <div className="space-y-2.5">
          <p className="text-[11px] text-muted-foreground">
            Location{" "}
            <span className="font-mono text-foreground">
              {draftLocation[0].toFixed(4)}, {draftLocation[1].toFixed(4)}
            </span>{" "}
            &middot; click the map again to move it
          </p>

          <label className="block">
            <span className="sr-only">Photo</span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => choose(e.target.files?.[0] ?? null)}
              className="block w-full text-[11px] text-muted-foreground file:mr-2 file:rounded-md file:border-0 file:bg-secondary file:px-2.5 file:py-1.5 file:text-[11px] file:font-medium file:text-foreground"
            />
          </label>

          {preview && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="Selected photo" className="h-28 w-full rounded-md object-cover" />
          )}
          {browserSha && (
            <p className="text-[10px] leading-relaxed text-muted-foreground">
              Fingerprint, computed in your browser:{" "}
              <span className="font-mono text-foreground">{shortHash(browserSha)}</span>
            </p>
          )}

          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            aria-label="What does the photo show?"
            className="h-8 w-full rounded-md border border-border bg-surface-2 px-2 text-[11px]"
          >
            {GT_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          <input
            value={note}
            onChange={(e) => setNote(e.target.value.slice(0, 200))}
            placeholder="Short note (optional)"
            aria-label="Note"
            className="h-8 w-full rounded-md border border-border bg-surface-2 px-2.5 text-[11px] outline-none focus:border-primary/50"
          />

          <div className="grid grid-cols-2 gap-2">
            <Button
              size="sm"
              className="h-8 text-[11px]"
              disabled={!file || !browserSha || busy}
              onClick={submit}
            >
              {busy ? "Sealing…" : "Submit"}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              className="h-8 text-[11px]"
              disabled={busy}
              onClick={() => {
                reset();
                onCancel();
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {error && <p className="text-[11px] text-destructive">{error}</p>}
    </section>
  );
}
