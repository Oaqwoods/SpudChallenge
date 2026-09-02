"use client";

import { useRef, useState, type ChangeEvent, type FormEvent } from "react";
import Link from "next/link";
import { TrackOnMount } from "@/components/analytics-tracker";
import { useChallenge } from "@/components/challenge-provider";
import { useNow } from "@/hooks/use-now";
import { track } from "@/lib/analytics";
import { DEFAULT_SETTINGS, getPhase } from "@/lib/challenge";
import { buildMetaRequestMetadata, fireMetaConversion } from "@/lib/meta";
import { callEdgeFunction, EdgeFunctionError, getSupabase } from "@/lib/supabase";
import { readUtm } from "@/lib/utm";
import { formatUsd } from "@/lib/format";
import { Panel } from "@/components/ui";

const MAX_PHOTOS = 5;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const CONDITIONS = ["Excellent", "Good", "Fair", "Needs work"];

interface PhotoState {
  id: string;
  file: File;
  previewUrl: string;
  status: "uploading" | "uploaded" | "error";
  path?: string;
  submitToken?: string;
  error?: string;
}

interface UploadIssueResponse {
  path: string;
  storage_token: string;
  submit_token: string;
}

// text-base on phones: iOS Safari zooms the page when focusing inputs
// smaller than 16px.
const inputClass =
  "w-full border-[3px] border-edge bg-background px-3 py-2.5 text-base text-foreground outline-none focus:border-accent sm:py-2 sm:text-sm";
const labelClass = "font-display text-[8px] uppercase text-faded sm:text-[9px]";

function GatePanel({ title, body }: { title: string; body: string }) {
  return (
    <Panel className="p-8 text-center">
      <p className="font-display text-sm text-accent">{title}</p>
      <p className="mt-4 text-sm leading-relaxed text-faded">{body}</p>
      <Link href="/" className="mt-6 inline-block text-sm text-accent underline">
        ← Back to the challenge
      </Link>
    </Panel>
  );
}

export function OfferForm() {
  const { settings, loading, refresh } = useChallenge();
  const now = useNow(30000);
  const s = settings ?? DEFAULT_SETTINGS;

  const draftIdRef = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [itemName, setItemName] = useState("");
  const [itemDescription, setItemDescription] = useState("");
  const [claimedValue, setClaimedValue] = useState("");
  const [condition, setCondition] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [zip, setZip] = useState("");
  const [inPerson, setInPerson] = useState<"" | "yes" | "no">("");
  const [travelDistance, setTravelDistance] = useState("");
  const [serialOrModel, setSerialOrModel] = useState("");
  const [compUrl, setCompUrl] = useState("");
  const [whyGoodTrade, setWhyGoodTrade] = useState("");
  const [ownershipConfirmed, setOwnershipConfirmed] = useState(false);
  const [notAcceptanceAck, setNotAcceptanceAck] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [website, setWebsite] = useState("");

  const [photos, setPhotos] = useState<PhotoState[]>([]);
  const [photoNotice, setPhotoNotice] = useState("");

  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error" | "stale">(
    "idle",
  );
  const [message, setMessage] = useState("");
  // Server-reported phase at submission time: prelaunch submissions get the
  // "collected, not accepted" confirmation instead of the active one.
  const [acceptedPrelaunch, setAcceptedPrelaunch] = useState(false);

  const getDraftId = () => {
    if (!draftIdRef.current) draftIdRef.current = crypto.randomUUID();
    return draftIdRef.current;
  };

  if (loading) {
    return (
      <Panel className="p-8 text-center" aria-hidden="true">
        <p className="font-display text-xs text-faded">LOADING…</p>
      </Panel>
    );
  }

  const phase = now !== null ? getPhase(settings, now) : "prelaunch";
  // Prompt 39: prelaunch submissions are collected for Trade #1, so the form
  // is open during prelaunch AND active. Complete and paused stay gated.
  if (phase === "complete") {
    return (
      <GatePanel title="OFFERS CLOSED" body="The 21-day challenge is complete. Thanks for following the journey." />
    );
  }
  if (s.offers_paused) {
    return (
      <GatePanel
        title="OFFERS PAUSED"
        body="Offer submissions are briefly paused. Please check back soon."
      />
    );
  }

  if (status === "success") {
    if (acceptedPrelaunch) {
      return (
        <Panel className="p-8 text-center" role="status">
          <p className="font-display text-sm text-mint">OFFER RECEIVED</p>
          <p className="mt-4 text-sm leading-relaxed text-foreground">
            Your potential Trade #{s.current_trade_number + 1} offer has been
            saved. The challenge has not started yet, and submitting an offer
            does not mean it has been accepted.
          </p>
          <p className="mt-3 text-xs leading-relaxed text-faded">
            No trade will be selected or agreed to until the challenge
            officially begins. Do not transfer or ship anything before then.
          </p>
          <Link href="/" className="mt-6 inline-block text-sm text-accent underline">
            ← Back to the challenge
          </Link>
        </Panel>
      );
    }
    return (
      <Panel className="p-8 text-center" role="status">
        <p className="font-display text-sm text-mint">OFFER RECEIVED</p>
        <p className="mt-4 text-sm leading-relaxed text-foreground">
          Do not transfer, ship, or hand over anything unless we directly
          confirm the trade.
        </p>
        <p className="mt-3 text-xs leading-relaxed text-faded">
          Submission is not acceptance. We review every offer and may contact
          you for verification.
        </p>
        <Link href="/" className="mt-6 inline-block text-sm text-accent underline">
          ← Back to the challenge
        </Link>
      </Panel>
    );
  }

  const addFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    const fileList = event.target.files;
    event.target.value = "";
    if (!fileList || fileList.length === 0) return;
    setPhotoNotice("");

    const supabase = getSupabase();
    if (!supabase) {
      setPhotoNotice("Photo uploads are not available yet.");
      return;
    }

    let current = [...photos];
    for (const file of Array.from(fileList)) {
      if (current.length >= MAX_PHOTOS) {
        setPhotoNotice(`Up to ${MAX_PHOTOS} photos.`);
        break;
      }
      if (!ACCEPTED_TYPES.includes(file.type)) {
        setPhotoNotice("Only JPG, PNG, or WebP images of the item are accepted.");
        continue;
      }
      if (file.size > MAX_FILE_BYTES) {
        setPhotoNotice("Each photo must be 10 MB or smaller.");
        continue;
      }

      const photoId = crypto.randomUUID();
      const previewUrl = URL.createObjectURL(file);
      const pending: PhotoState = { id: photoId, file, previewUrl, status: "uploading" };
      current = [...current, pending];
      setPhotos(current);

      try {
        const issued = await callEdgeFunction<UploadIssueResponse>("offer-upload", {
          draft_id: getDraftId(),
          file_type: file.type,
          file_size: file.size,
        });
        const { error: uploadError } = await supabase.storage
          .from("offer-uploads")
          .uploadToSignedUrl(issued.path, issued.storage_token, file);
        if (uploadError) throw uploadError;

        current = current.map((p) =>
          p.id === photoId
            ? { ...p, status: "uploaded" as const, path: issued.path, submitToken: issued.submit_token }
            : p,
        );
      } catch {
        current = current.map((p) =>
          p.id === photoId
            ? { ...p, status: "error" as const, error: "Upload failed — remove and retry." }
            : p,
        );
      }
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

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (status === "submitting") return;
    setMessage("");
    setStatus("idle");

    const normalizedEmail = email.trim().toLowerCase();
    if (!name.trim()) return void setMessage("Please enter your name.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return void setMessage("Please enter a valid email address.");
    }
    if (!itemName.trim()) return void setMessage("Please enter the item name.");
    if (!itemDescription.trim()) return void setMessage("Please describe the item.");
    const value = Number(claimedValue);
    if (!Number.isFinite(value) || value <= 0) {
      return void setMessage("Please enter a realistic approximate value.");
    }
    if (!condition) return void setMessage("Please select the item condition.");
    if (!city.trim()) return void setMessage("Please enter your city.");
    if (!state.trim()) return void setMessage("Please enter your state.");
    if (inPerson === "") {
      return void setMessage("Please tell us whether you can trade in person.");
    }
    if (compUrl.trim() && !/^https?:\/\/[^\s/$.?#].[^\s]*$/i.test(compUrl.trim())) {
      return void setMessage("The comparable-value link must be a valid http(s) URL.");
    }
    if (!whyGoodTrade.trim()) {
      return void setMessage("Please tell us why this is a good next trade.");
    }
    if (!ownershipConfirmed || !notAcceptanceAck || !termsAccepted) {
      return void setMessage("Please confirm ownership, acknowledgement, and the terms.");
    }
    if (photos.some((p) => p.status === "uploading")) {
      return void setMessage("Please wait for your photos to finish uploading.");
    }
    if (photos.some((p) => p.status === "error")) {
      return void setMessage("Remove the failed photo(s) and try adding them again.");
    }

    setStatus("submitting");
    try {
      // Optional, consent-gated Meta measurement metadata (prompt 40). The
      // same event_id is reused by the browser Pixel Lead AFTER the backend
      // confirms success, so Meta can deduplicate Pixel + Conversions API.
      // (trade_offer maps to the Meta standard event "Lead".)
      const meta = buildMetaRequestMetadata();
      const result = await callEdgeFunction<{ ok?: boolean; prelaunch?: boolean }>(
        "submit-offer",
        {
          name: name.trim(),
          email: normalizedEmail,
          phone: phone.trim() || null,
          offered_against_trade_number: s.current_trade_number,
          item_name: itemName.trim(),
          item_description: itemDescription.trim(),
          claimed_value: value,
          condition,
          city: city.trim(),
          state: state.trim(),
          zip: zip.trim() || null,
          in_person: inPerson === "yes",
          travel_distance: travelDistance.trim() || null,
          serial_or_model: serialOrModel.trim() || null,
          comp_url: compUrl.trim() || null,
          why_good_trade: whyGoodTrade.trim(),
          ownership_confirmed: true,
          not_acceptance_ack: true,
          terms_accepted: true,
          photos: photos
            .filter((p) => p.status === "uploaded" && p.path && p.submitToken)
            .map((p) => ({ path: p.path, submit_token: p.submitToken })),
          website,
          ...(meta ? { meta } : {}),
          ...readUtm(),
        },
      );
      setAcceptedPrelaunch(result.prelaunch === true);
      setStatus("success");
      track("offer_submitted");
      if (meta) fireMetaConversion("trade_offer", meta.event_id);
    } catch (err) {
      if (
        err instanceof EdgeFunctionError &&
        err.status === 409 &&
        err.payload?.code === "current_item_changed"
      ) {
        // The challenge advanced mid-fill: refresh the authoritative item and
        // ask the visitor to review it before resubmitting (spec §26).
        refresh();
        setStatus("stale");
        setMessage(
          "The current trade changed while you were filling this out — please review the new item before submitting. Your answers are kept.",
        );
        return;
      }
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    }
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      <TrackOnMount event="offer_started" />
      {/* Honeypot — hidden from people, tempting to bots. */}
      <div className="hidden" aria-hidden="true">
        <label>
          Website
          <input
            type="text"
            tabIndex={-1}
            autoComplete="off"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
          />
        </label>
      </div>

      {phase === "prelaunch" ? (
        <Panel className="border-accent p-4">
          <p className="font-display text-[10px] uppercase tracking-wider text-accent sm:text-xs">
            Submit a Trade #{s.current_trade_number + 1} Offer
          </p>
          <p className="mt-2 text-sm leading-relaxed text-foreground">
            Think you have something worth trading for my{" "}
            {formatUsd(s.starting_value)}? Submit it now.
          </p>
          <p className="mt-2 text-xs leading-relaxed text-faded">
            Pre-launch offers are being collected, but no trade will be
            selected or agreed to until the challenge officially begins.
          </p>
        </Panel>
      ) : null}

      <Panel className="p-4">
        <p className="font-display text-[9px] uppercase text-faded">You&apos;re offering a trade for</p>
        <p className="mt-2 font-display text-xs text-accent sm:text-sm">
          {s.current_item_name} — {formatUsd(s.current_item_value)}
        </p>
        <p className="mt-1 text-xs text-faded">
          {phase === "prelaunch"
            ? `Trade #${s.current_trade_number} / Trade #${s.current_trade_number + 1} opportunity`
            : `Trade #${s.current_trade_number}`}
        </p>
      </Panel>

      {status === "stale" ? (
        <p role="alert" className="border-[3px] border-accent bg-panel px-3 py-2 text-sm text-accent">
          {message}
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label htmlFor="offer-name" className={labelClass}>Name (required)</label>
          <input id="offer-name" className={inputClass} value={name} maxLength={200}
            autoComplete="name" onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="offer-email" className={labelClass}>Email (required)</label>
          <input id="offer-email" type="email" className={inputClass} value={email} maxLength={254}
            autoComplete="email" onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="offer-phone" className={labelClass}>Phone (optional)</label>
          <input id="offer-phone" type="tel" className={inputClass} value={phone} maxLength={32}
            autoComplete="tel" onChange={(e) => setPhone(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="offer-item" className={labelClass}>Item name (required)</label>
          <input id="offer-item" className={inputClass} value={itemName} maxLength={200}
            onChange={(e) => setItemName(e.target.value)} />
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="offer-description" className={labelClass}>Item description (required)</label>
        <textarea id="offer-description" className={inputClass} rows={4} value={itemDescription}
          maxLength={5000} onChange={(e) => setItemDescription(e.target.value)} />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="offer-value" className={labelClass}>Approx. value USD (required)</label>
          <input id="offer-value" type="number" min="1" step="1" className={inputClass}
            value={claimedValue} onChange={(e) => setClaimedValue(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="offer-condition" className={labelClass}>Condition (required)</label>
          <select id="offer-condition" className={inputClass} value={condition}
            onChange={(e) => setCondition(e.target.value)}>
            <option value="">Select…</option>
            {CONDITIONS.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="offer-serial" className={labelClass}>Serial / model / VIN (optional)</label>
          <input id="offer-serial" className={inputClass} value={serialOrModel} maxLength={200}
            onChange={(e) => setSerialOrModel(e.target.value)} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="offer-city" className={labelClass}>City (required)</label>
          <input id="offer-city" className={inputClass} value={city} maxLength={100}
            autoComplete="address-level2" onChange={(e) => setCity(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="offer-state" className={labelClass}>State (required)</label>
          <input id="offer-state" className={inputClass} value={state} maxLength={100}
            autoComplete="address-level1" onChange={(e) => setState(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="offer-zip" className={labelClass}>ZIP (optional)</label>
          <input id="offer-zip" className={inputClass} value={zip} maxLength={16}
            autoComplete="postal-code" onChange={(e) => setZip(e.target.value)} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <fieldset className="flex flex-col gap-2 border-[3px] border-edge p-3">
          <legend className="px-1 font-display text-[8px] uppercase text-faded sm:text-[9px]">
            Can you trade in person? (required)
          </legend>
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" name="in-person" checked={inPerson === "yes"}
              onChange={() => setInPerson("yes")} className="accent-accent" />
            Yes
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" name="in-person" checked={inPerson === "no"}
              onChange={() => setInPerson("no")} className="accent-accent" />
            No
          </label>
        </fieldset>
        <div className="flex flex-col gap-1">
          <label htmlFor="offer-travel" className={labelClass}>How far can you travel? (optional)</label>
          <input id="offer-travel" className={inputClass} value={travelDistance} maxLength={200}
            placeholder="e.g. 50 miles around Austin, TX" onChange={(e) => setTravelDistance(e.target.value)} />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <span className={labelClass}>Item photos (optional, up to {MAX_PHOTOS} — item photos only, no documents)</span>
        <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" multiple
          className="hidden" onChange={addFiles} />
        <button type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={photos.length >= MAX_PHOTOS}
          className="border-[3px] border-dashed border-edge px-4 py-6 text-sm text-faded transition-colors hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-60">
          {photos.length >= MAX_PHOTOS ? "Photo limit reached" : "Add photos (JPG / PNG / WebP, ≤ 10 MB each)"}
        </button>
        {photoNotice ? <p role="alert" className="text-xs text-alert">{photoNotice}</p> : null}
        {photos.length > 0 ? (
          <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {photos.map((p) => (
              <li key={p.id} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.previewUrl} alt="Offer item upload" loading="lazy" decoding="async"
                  className={`aspect-square w-full border-[3px] object-cover ${
                    p.status === "error" ? "border-alert" : p.status === "uploaded" ? "border-mint" : "border-edge"
                  }`} />
                <button type="button" onClick={() => removePhoto(p.id)}
                  aria-label="Remove photo"
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

      <div className="flex flex-col gap-1">
        <label htmlFor="offer-comp" className={labelClass}>Comparable value link (optional)</label>
        <input id="offer-comp" type="url" className={inputClass} value={compUrl} maxLength={2048}
          placeholder="https://…" onChange={(e) => setCompUrl(e.target.value)} />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="offer-why" className={labelClass}>Why is this a good next trade? (required)</label>
        <textarea id="offer-why" className={inputClass} rows={3} value={whyGoodTrade}
          maxLength={2000} onChange={(e) => setWhyGoodTrade(e.target.value)} />
      </div>

      <div className="flex flex-col gap-2 border-[3px] border-edge p-3 text-sm">
        <label className="flex items-start gap-2">
          <input type="checkbox" className="mt-1 accent-accent" checked={ownershipConfirmed}
            onChange={(e) => setOwnershipConfirmed(e.target.checked)} />
          I own this item and can legally transfer it.
        </label>
        <label className="flex items-start gap-2">
          <input type="checkbox" className="mt-1 accent-accent" checked={notAcceptanceAck}
            onChange={(e) => setNotAcceptanceAck(e.target.checked)} />
          I understand that submitting an offer is not acceptance of a trade.
        </label>
        <label className="flex items-start gap-2">
          <input type="checkbox" className="mt-1 accent-accent" checked={termsAccepted}
            onChange={(e) => setTermsAccepted(e.target.checked)} />
          I accept the{" "}
          <Link href="/terms/" className="text-accent underline">Terms of Participation</Link>.
        </label>
        <p className="pl-6 text-xs text-faded">
          How your offer data is handled:{" "}
          <Link href="/privacy/" className="text-accent underline">Privacy Policy</Link>.
        </p>
      </div>

      {status === "error" ? (
        <p role="alert" className="border-[3px] border-alert px-3 py-2 text-sm text-alert">
          {message}
        </p>
      ) : null}

      <button type="submit" disabled={status === "submitting"}
        className="border-[3px] border-accent bg-accent px-5 py-4 font-display text-[10px] uppercase tracking-wider text-black transition-colors hover:bg-transparent hover:text-accent disabled:cursor-not-allowed disabled:opacity-60 sm:text-xs">
        {status === "submitting" ? "Submitting…" : "Submit Offer"}
      </button>

      <p className="text-xs leading-relaxed text-faded">
        Don&apos;t ship or hand over anything until we directly confirm. Offers
        are private — they never appear publicly.
      </p>
    </form>
  );
}
