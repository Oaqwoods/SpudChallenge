"use client";

// Trade completion + publish (playbook prompt 11). The actual publish is a
// single transactional RPC (migration 6) — all-or-nothing, serialized on the
// settings row, authorized by RLS/is_admin(). This form separates public
// content from private notes, previews the public card, and requires an
// explicit real-transfer confirmation before publishing.

import { useEffect, useState, type ChangeEvent } from "react";
import Link from "next/link";
import { formatUsd } from "@/lib/format";
import { getSupabase } from "@/lib/supabase";
import { toSettings, type ChallengeSettings } from "@/lib/challenge";
import { toAdminOffer, type AdminOfferRow, type OfferStatus } from "@/lib/admin-offers";
import {
  MAX_PUBLIC_IMAGES,
  buildDraftEmail,
  validateCompletion,
  type BtcSide,
} from "@/lib/publish-trade";
import { Panel } from "@/components/ui";

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const COMPLETABLE: ReadonlyArray<OfferStatus> = ["selected", "meetup_scheduled"];

const inputClass =
  "w-full border-[3px] border-edge bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-accent";
const labelClass = "font-display text-[8px] uppercase text-faded sm:text-[9px]";

interface PhotoState {
  id: string;
  file: File;
  previewUrl: string;
  status: "uploading" | "uploaded" | "error";
  path?: string;
}

type FormState =
  | { phase: "loading" }
  | { phase: "unconfigured" }
  | { phase: "error"; message: string }
  | { phase: "not_completable"; status: OfferStatus | null }
  | { phase: "ready"; offer: AdminOfferRow; settings: ChallengeSettings };

function nowLocalInput(): string {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

async function fetchCompletionContext(offerId: string): Promise<FormState> {
  const supabase = getSupabase();
  if (!supabase) return { phase: "unconfigured" };
  const [offerRes, settingsRes] = await Promise.all([
    supabase.from("offers").select("*").eq("id", offerId).maybeSingle(),
    supabase.from("challenge_settings").select("*").eq("id", 1).maybeSingle(),
  ]);
  const error = offerRes.error ?? settingsRes.error;
  if (error) {
    return { phase: "error", message: `Could not load this page (${error.message}).` };
  }
  const offer = offerRes.data ? toAdminOffer(offerRes.data as Record<string, unknown>) : null;
  if (!offer) return { phase: "not_completable", status: null };
  if (!COMPLETABLE.includes(offer.status)) {
    return { phase: "not_completable", status: offer.status };
  }
  const settings = settingsRes.data
    ? toSettings(settingsRes.data as Record<string, unknown>)
    : null;
  if (!settings) return { phase: "error", message: "Challenge settings are missing." };
  return { phase: "ready", offer, settings };
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className={labelClass}>{label}</span>
      {children}
    </div>
  );
}

export function CompleteTradeForm({ offerId }: { offerId: string }) {
  const [state, setState] = useState<FormState>({ phase: "loading" });

  // Trade facts
  const [outgoingItem, setOutgoingItem] = useState("");
  const [outgoingValue, setOutgoingValue] = useState("");
  const [incomingItem, setIncomingItem] = useState("");
  const [incomingValue, setIncomingValue] = useState("");
  const [incomingDescription, setIncomingDescription] = useState("");
  const [valuationMethod, setValuationMethod] = useState("");
  const [valuationEvidence, setValuationEvidence] = useState("");
  const [completedAt, setCompletedAt] = useState(nowLocalInput());
  const [generalLocation, setGeneralLocation] = useState("");

  // Public content
  const [publicStory, setPublicStory] = useState("");
  const [participantName, setParticipantName] = useState("");
  const [publicityConfirmed, setPublicityConfirmed] = useState(false);
  const [photos, setPhotos] = useState<PhotoState[]>([]);
  const [photoNotice, setPhotoNotice] = useState("");

  // Private
  const [privateNotes, setPrivateNotes] = useState("");

  // Bitcoin exception
  const [btcSide, setBtcSide] = useState<BtcSide | null>(null);
  const [btcAmount, setBtcAmount] = useState("");
  const [btcUsdValue, setBtcUsdValue] = useState("");
  const [btcValuedAt, setBtcValuedAt] = useState("");
  const [btcValuationSource, setBtcValuationSource] = useState("");
  const [btcWalletAddress, setBtcWalletAddress] = useState("");
  const [btcTransactionId, setBtcTransactionId] = useState("");

  const [confirmed, setConfirmed] = useState(false);
  const [message, setMessage] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [published, setPublished] = useState<{ tradeNumber: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const initialLoad = async () => {
      const next = await fetchCompletionContext(offerId);
      if (cancelled) return;
      setState(next);
      if (next.phase === "ready") {
        // The item given away is the challenge's current item.
        setOutgoingItem(next.settings.current_item_name);
        setOutgoingValue(String(next.settings.current_item_value));
      }
    };
    void initialLoad();
    return () => {
      cancelled = true;
    };
  }, [offerId]);

  const addFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    const fileList = event.target.files;
    event.target.value = "";
    if (!fileList || fileList.length === 0) return;
    setPhotoNotice("");
    const supabase = getSupabase();
    if (!supabase) {
      setPhotoNotice("Uploads are not configured yet.");
      return;
    }

    let current = [...photos];
    for (const file of Array.from(fileList)) {
      if (current.length >= MAX_PUBLIC_IMAGES) {
        setPhotoNotice(`Up to ${MAX_PUBLIC_IMAGES} public images.`);
        break;
      }
      if (!ACCEPTED_TYPES.includes(file.type)) {
        setPhotoNotice("Only JPG, PNG, or WebP images are accepted.");
        continue;
      }
      if (file.size > MAX_FILE_BYTES) {
        setPhotoNotice("Each image must be 10 MB or smaller.");
        continue;
      }
      const id = crypto.randomUUID();
      const ext = file.type === "image/jpeg" ? "jpg" : file.type === "image/png" ? "png" : "webp";
      const path = `completed/${id}.${ext}`;
      const pending: PhotoState = {
        id,
        file,
        previewUrl: URL.createObjectURL(file),
        status: "uploading",
      };
      current = [...current, pending];
      setPhotos(current);

      const { error: uploadError } = await supabase.storage
        .from("trade-media")
        .upload(path, file, { contentType: file.type });
      current = current.map((p) =>
        p.id === id
          ? { ...p, status: uploadError ? ("error" as const) : ("uploaded" as const), path }
          : p,
      );
      setPhotos(current);
    }
  };

  const removePhoto = (id: string) => {
    setPhotos((prev) => {
      const target = prev.find((p) => p.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((p) => p.id !== id);
    });
  };

  if (state.phase === "loading") {
    return (
      <Panel className="p-8 text-center" aria-hidden="true">
        <p className="font-display text-xs text-faded">LOADING…</p>
      </Panel>
    );
  }
  if (state.phase === "unconfigured" || state.phase === "error") {
    return (
      <Panel className="p-8 text-center" role="alert">
        <p className="font-display text-xs text-accent">UNAVAILABLE</p>
        <p className="mt-4 text-sm text-faded">
          {state.phase === "unconfigured"
            ? "Admin is not configured yet (missing Supabase configuration)."
            : state.message}
        </p>
        <Link href="/admin/" className="mt-6 inline-block text-sm text-accent underline">
          ← Back to the dashboard
        </Link>
      </Panel>
    );
  }
  if (state.phase === "not_completable") {
    return (
      <Panel className="p-8 text-center">
        <p className="font-display text-xs text-accent">CANNOT COMPLETE THIS OFFER</p>
        <p className="mt-4 text-sm leading-relaxed text-faded">
          {state.status === null
            ? "This offer was not found."
            : `Only offers that are selected or have a meetup scheduled can be completed. This offer is currently “${state.status}”.`}
        </p>
        <Link href="/admin/" className="mt-6 inline-block text-sm text-accent underline">
          ← Back to the dashboard
        </Link>
      </Panel>
    );
  }

  const { offer, settings } = state;
  const nextTradeNumber = settings.current_trade_number + 1;
  const outgoingNum = Number(outgoingValue);
  const incomingNum = Number(incomingValue);

  const handlePublish = async () => {
    if (publishing || published) return;
    setMessage("");

    if (photos.some((p) => p.status === "uploading")) {
      setMessage("Please wait for the images to finish uploading.");
      return;
    }
    if (photos.some((p) => p.status === "error")) {
      setMessage("Remove the failed image(s) and add them again.");
      return;
    }

    const draft = {
      outgoingItem,
      incomingItem,
      outgoingValue: outgoingNum,
      incomingValue: incomingNum,
      valuationMethod,
      valuationEvidence,
      completedAt,
      generalLocation,
      publicStory,
      publicParticipantName: participantName,
      publicityReleaseConfirmed: publicityConfirmed,
      mediaCount: photos.length,
      btcSide,
      btcAmount: btcAmount.trim() === "" ? null : Number(btcAmount),
      btcUsdValue: btcUsdValue.trim() === "" ? null : Number(btcUsdValue),
      btcValuedAt: btcValuedAt || null,
      btcValuationSource: btcValuationSource,
      confirmed,
    };
    const problem = validateCompletion(draft);
    if (problem) {
      setMessage(problem);
      return;
    }

    const supabase = getSupabase();
    if (!supabase) return;

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? window.location.origin;
    const email = buildDraftEmail({
      tradeNumber: nextTradeNumber,
      outgoingItem: outgoingItem.trim(),
      outgoingValue: outgoingNum,
      incomingItem: incomingItem.trim(),
      incomingValue: incomingNum,
      story: publicStory.trim() || null,
      siteUrl,
    });

    setPublishing(true);
    const { data, error } = await supabase.rpc("publish_trade", {
      p_offer_id: offer.id,
      p_outgoing_item: outgoingItem.trim(),
      p_incoming_item: incomingItem.trim(),
      p_outgoing_value: outgoingNum,
      p_incoming_value: incomingNum,
      p_valuation_method: valuationMethod.trim(),
      p_valuation_evidence: valuationEvidence.trim() || null,
      p_completed_at: new Date(completedAt).toISOString(),
      p_general_location: generalLocation.trim(),
      p_public_story: publicStory.trim() || null,
      p_public_participant_name: participantName.trim() || null,
      p_publicity_release_confirmed: publicityConfirmed,
      p_private_completion_notes: privateNotes.trim() || null,
      p_incoming_item_description: incomingDescription.trim() || null,
      p_media: photos
        .filter((p) => p.status === "uploaded" && p.path)
        .map((p, index) => ({
          storage_path: p.path,
          alt_text: incomingItem.trim() || `Trade ${nextTradeNumber} image`,
          sort_order: index,
        })),
      p_btc_side: btcSide,
      p_btc_amount: draft.btcAmount,
      p_btc_usd_value: draft.btcUsdValue,
      p_btc_valued_at: draft.btcValuedAt ? new Date(draft.btcValuedAt).toISOString() : null,
      p_btc_valuation_source: btcValuationSource.trim() || null,
      p_btc_wallet_address: btcWalletAddress.trim() || null,
      p_btc_transaction_id: btcTransactionId.trim() || null,
      p_draft_subject: email.subject,
      p_draft_body_html: email.body_html,
    });
    setPublishing(false);

    if (error) {
      setMessage(`Publish failed — ${error.message}`);
      return;
    }
    const result = data as { trade_number?: number } | null;
    setPublished({ tradeNumber: result?.trade_number ?? nextTradeNumber });
  };

  if (published) {
    return (
      <Panel className="p-8 text-center" role="status">
        <p className="font-display text-sm text-mint">TRADE #{published.tradeNumber} PUBLISHED</p>
        <p className="mt-4 text-sm leading-relaxed text-foreground">
          The homepage current item and the trade journey now show the new
          trade. A draft email broadcast was prepared — review it before
          sending anything.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link href="/" className="border-[3px] border-accent bg-accent px-4 py-2 font-display text-[9px] uppercase tracking-wider text-black hover:bg-transparent hover:text-accent sm:text-[10px]">
            View public site
          </Link>
          <Link href="/admin/" className="border-[3px] border-edge px-4 py-2 font-display text-[9px] uppercase tracking-wider text-faded hover:border-accent hover:text-accent sm:text-[10px]">
            Back to dashboard
          </Link>
        </div>
      </Panel>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void handlePublish();
      }}
      noValidate
      className="flex flex-col gap-6"
    >
      <Panel className="p-4">
        <p className={labelClass}>Completing offer from</p>
        <p className="mt-2 font-display text-xs text-accent">{offer.item_name}</p>
        <p className="mt-1 text-xs text-faded">
          Claimed {formatUsd(offer.claimed_value)} · {offer.name} · {offer.city}, {offer.state}
        </p>
      </Panel>

      <Panel className="p-4">
        <p className={labelClass}>What changed hands</p>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <Field label="Item given away (required)">
            <input className={inputClass} value={outgoingItem} maxLength={200}
              onChange={(e) => setOutgoingItem(e.target.value)} />
          </Field>
          <Field label="Outgoing value USD (required)">
            <input type="number" min="0" step="1" className={inputClass} value={outgoingValue}
              onChange={(e) => setOutgoingValue(e.target.value)} />
          </Field>
          <Field label="Item received (required)">
            <input className={inputClass} value={incomingItem} maxLength={200}
              onChange={(e) => setIncomingItem(e.target.value)} />
          </Field>
          <Field label="Incoming verified/estimated value USD (required)">
            <input type="number" min="0" step="1" className={inputClass} value={incomingValue}
              onChange={(e) => setIncomingValue(e.target.value)} />
          </Field>
          <div className="sm:col-span-2">
            <Field label="New current-item description (optional)">
              <textarea rows={2} className={inputClass} value={incomingDescription} maxLength={500}
                onChange={(e) => setIncomingDescription(e.target.value)} />
            </Field>
          </div>
        </div>
      </Panel>

      <Panel className="p-4">
        <p className={labelClass}>Valuation, time and place</p>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <Field label="Valuation method (required)">
            <input className={inputClass} value={valuationMethod} maxLength={200}
              placeholder="e.g. comparable sold listings" onChange={(e) => setValuationMethod(e.target.value)} />
          </Field>
          <Field label="Valuation evidence (optional — makes valuation verified)">
            <input className={inputClass} value={valuationEvidence} maxLength={500}
              placeholder="link or summary" onChange={(e) => setValuationEvidence(e.target.value)} />
          </Field>
          <Field label="Completed date/time (required)">
            <input type="datetime-local" className={inputClass} value={completedAt}
              onChange={(e) => setCompletedAt(e.target.value)} />
          </Field>
          <Field label="Public general location (required — city/state or broader)">
            <input className={inputClass} value={generalLocation} maxLength={200}
              placeholder="e.g. Austin, TX" onChange={(e) => setGeneralLocation(e.target.value)} />
          </Field>
        </div>
      </Panel>

      <Panel className="border-accent p-4">
        <p className="font-display text-[9px] uppercase text-accent">Public content</p>
        <p className="mt-1 text-xs text-faded">
          Everything in this block can appear on the public site.
        </p>
        <div className="mt-3 grid gap-4">
          <Field label="Public comment / short story (optional)">
            <textarea rows={3} className={inputClass} value={publicStory} maxLength={2000}
              onChange={(e) => setPublicStory(e.target.value)} />
          </Field>
          <Field label="Public participant name (optional)">
            <input className={inputClass} value={participantName} maxLength={200}
              onChange={(e) => setParticipantName(e.target.value)} />
          </Field>
          {participantName.trim() ? (
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-1 accent-accent" checked={publicityConfirmed}
                onChange={(e) => setPublicityConfirmed(e.target.checked)} />
              Publicity consent/release for this name was obtained (required to publish a name).
            </label>
          ) : null}
          <div className="flex flex-col gap-2">
            <span className={labelClass}>
              Public images (up to {MAX_PUBLIC_IMAGES} — these appear on the public site)
            </span>
            <input type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden"
              id="trade-images" onChange={addFiles} />
            <label htmlFor="trade-images"
              className="cursor-pointer border-[3px] border-dashed border-edge px-4 py-6 text-center text-sm text-faded transition-colors hover:border-accent hover:text-accent">
              {photos.length >= MAX_PUBLIC_IMAGES ? "Image limit reached" : "Add public images (JPG / PNG / WebP, ≤ 10 MB each)"}
            </label>
            {photoNotice ? <p role="alert" className="text-xs text-alert">{photoNotice}</p> : null}
            {photos.length > 0 ? (
              <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                {photos.map((p) => (
                  <li key={p.id} className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.previewUrl} alt="Public trade upload"
                      className={`aspect-square w-full border-[3px] object-cover ${
                        p.status === "error" ? "border-alert" : p.status === "uploaded" ? "border-mint" : "border-edge"
                      }`} />
                    <button type="button" onClick={() => removePhoto(p.id)} aria-label="Remove image"
                      className="absolute -right-2 -top-2 border-[3px] border-edge bg-panel px-1.5 text-xs text-alert">
                      ×
                    </button>
                    <p className="mt-1 text-[10px] text-faded">
                      {p.status === "uploading" ? "Uploading…" : p.status === "error" ? "Failed" : "Uploaded"}
                    </p>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
      </Panel>

      <Panel className="border-alert p-4">
        <p className="font-display text-[9px] uppercase text-alert">Private — never published</p>
        <div className="mt-3 grid gap-4">
          <Field label="Private completion notes (exact meetup details, logistics)">
            <textarea rows={3} className={inputClass} value={privateNotes} maxLength={4000}
              onChange={(e) => setPrivateNotes(e.target.value)} />
          </Field>
        </div>
        <p className="mt-2 text-xs text-faded">
          Keep exact addresses, meetup logistics and internal decisions here —
          never in the public story.
        </p>
      </Panel>

      <Panel className="p-4">
        <p className={labelClass}>Bitcoin exception</p>
        <p className="mt-1 text-xs text-faded">
          Only when the incoming or outgoing asset is Bitcoin. The recorded
          USD fair-market value becomes the frozen public challenge value for
          that side. Never enter private keys, seed phrases or exchange
          credentials — they are never collected.
        </p>
        <div className="mt-3 flex flex-col gap-2">
          <fieldset className="flex flex-wrap gap-4 border-[3px] border-edge p-3 text-sm">
            <legend className="px-1 font-display text-[8px] uppercase text-faded">BTC involved?</legend>
            {([["incoming", "BTC received"], ["outgoing", "BTC given away"]] as const).map(([side, label]) => (
              <label key={side} className="flex items-center gap-2">
                <input type="radio" name="btc-side" className="accent-accent"
                  checked={btcSide === side}
                  onChange={() => setBtcSide(btcSide === side ? null : side)} />
                {label}
              </label>
            ))}
            <label className="flex items-center gap-2">
              <input type="radio" name="btc-side" className="accent-accent" checked={btcSide === null}
                onChange={() => setBtcSide(null)} />
              No BTC in this trade
            </label>
          </fieldset>
          {btcSide !== null ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="BTC amount (required)">
                <input type="number" min="0" step="any" className={inputClass} value={btcAmount}
                  onChange={(e) => setBtcAmount(e.target.value)} />
              </Field>
              <Field label="USD fair-market value at completion (required)">
                <input type="number" min="0" step="1" className={inputClass} value={btcUsdValue}
                  onChange={(e) => setBtcUsdValue(e.target.value)} />
              </Field>
              <Field label="Valuation timestamp (required)">
                <input type="datetime-local" className={inputClass} value={btcValuedAt}
                  onChange={(e) => setBtcValuedAt(e.target.value)} />
              </Field>
              <Field label="Valuation source (required)">
                <input className={inputClass} value={btcValuationSource} maxLength={200}
                  placeholder="e.g. Coinbase spot at 12:05 CT" onChange={(e) => setBtcValuationSource(e.target.value)} />
              </Field>
              <Field label="Private wallet address (optional — never public)">
                <input className={inputClass} value={btcWalletAddress} maxLength={200}
                  onChange={(e) => setBtcWalletAddress(e.target.value)} />
              </Field>
              <Field label="Private transaction ID (optional — never public)">
                <input className={inputClass} value={btcTransactionId} maxLength={200}
                  onChange={(e) => setBtcTransactionId(e.target.value)} />
              </Field>
            </div>
          ) : null}
        </div>
      </Panel>

      <Panel className="p-4">
        <p className={labelClass}>Public preview</p>
        <div className="mt-3 border-[3px] border-edge bg-background p-4">
          <p className="font-display text-[10px] text-accent">
            TRADE #{nextTradeNumber}: {Number.isFinite(outgoingNum) ? formatUsd(outgoingNum) : "$?"} →{" "}
            {Number.isFinite(incomingNum) ? formatUsd(incomingNum) : "$?"}
          </p>
          <p className="mt-2 font-display text-xs text-foreground">
            {incomingItem.trim() || "Item received"}
          </p>
          <p className="mt-1 text-xs text-faded">
            {generalLocation.trim() || "General location"} ·{" "}
            {valuationEvidence.trim() ? "Value verified" : "Value estimated"} ·{" "}
            {valuationMethod.trim() || "Valuation method"}
          </p>
          {publicStory.trim() ? (
            <p className="mt-2 text-sm leading-relaxed text-foreground">{publicStory}</p>
          ) : null}
          {photos.length > 0 ? (
            <p className="mt-2 text-xs text-faded">{photos.length} public image(s) attached.</p>
          ) : null}
        </div>
        <p className="mt-2 text-xs text-faded">
          This is what the public trade card / current item will show. The
          homepage updates automatically on publish — no code edits.
        </p>
      </Panel>

      <div className="flex flex-col gap-2 border-[3px] border-edge p-3 text-sm">
        <label className="flex items-start gap-2">
          <input type="checkbox" className="mt-1 accent-accent" checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)} />
          I confirm the real-world/legal transfer has actually completed (or
          otherwise qualifies under the challenge rules).
        </label>
      </div>

      {message ? (
        <p role="alert" className="border-[3px] border-alert px-3 py-2 text-sm text-alert">
          {message}
        </p>
      ) : null}

      <button type="submit" disabled={publishing}
        className="border-[3px] border-accent bg-accent px-5 py-4 font-display text-[10px] uppercase tracking-wider text-black transition-colors hover:bg-transparent hover:text-accent disabled:cursor-not-allowed disabled:opacity-60 sm:text-xs">
        {publishing ? "Publishing…" : `Publish trade #${nextTradeNumber}`}
      </button>

      <p className="text-xs leading-relaxed text-faded">
        Publishing is a single all-or-nothing operation: the trade record,
        public images, current-item update, offer completion and a draft email
        are written together, or not at all. Nothing is auto-emailed.
      </p>
    </form>
  );
}
