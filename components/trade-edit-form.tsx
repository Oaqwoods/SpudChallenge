"use client";

// Safe edit of a published trade (playbook PROMPT 27). Corrects typos,
// photos, the story, participant name/location and — with an explicit
// confirmation step — historical values. All writes go through the
// update_published_trade RPC (migration 12): one transaction, admin-gated,
// server-enforced value-change confirmation, BTC FMV lock, and homepage
// re-sync when the corrected trade is the current item.

import { useEffect, useState, type ChangeEvent } from "react";
import Link from "next/link";
import { getSupabase, publicMediaUrl } from "@/lib/supabase";
import { formatUsd } from "@/lib/format";
import { formatDateTime } from "@/lib/time";
import { toSettings } from "@/lib/challenge";
import { MAX_PUBLIC_IMAGES } from "@/lib/publish-trade";
import {
  toAdminTrade,
  toAdminTradeMedia,
  tradeValuesChanged,
  validateTradeEdit,
  type AdminTradeMedia,
  type AdminTradeRow,
} from "@/lib/admin-trades";
import { Panel } from "@/components/ui";

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];

const inputClass =
  "w-full border-[3px] border-edge bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-accent disabled:cursor-not-allowed disabled:opacity-60";
const labelClass = "font-display text-[8px] uppercase text-faded sm:text-[9px]";

interface MediaItem {
  key: string;
  storage_path: string;
  alt_text: string | null;
  previewUrl: string;
  status: "existing" | "uploading" | "uploaded" | "error";
}

type FormState =
  | { phase: "loading" }
  | { phase: "unconfigured" }
  | { phase: "error"; message: string }
  | { phase: "ready"; trade: AdminTradeRow; isCurrentTrade: boolean };

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className={labelClass}>{label}</span>
      {children}
    </div>
  );
}

async function fetchTradeForEdit(tradeId: string): Promise<FormState> {
  const supabase = getSupabase();
  if (!supabase) return { phase: "unconfigured" };
  const [tradeRes, settingsRes] = await Promise.all([
    supabase.from("trades").select("*").eq("id", tradeId).maybeSingle(),
    supabase.from("challenge_settings").select("*").eq("id", 1).maybeSingle(),
  ]);
  const error = tradeRes.error ?? settingsRes.error;
  if (error) {
    return { phase: "error", message: `Could not load this trade (${error.message}).` };
  }
  const trade = tradeRes.data ? toAdminTrade(tradeRes.data as Record<string, unknown>) : null;
  if (!trade) return { phase: "error", message: "Trade not found." };
  const settings = settingsRes.data
    ? toSettings(settingsRes.data as Record<string, unknown>)
    : null;
  const isCurrentTrade = settings !== null && settings.current_trade_number === trade.trade_number;
  return { phase: "ready", trade, isCurrentTrade };
}

async function fetchTradeMedia(tradeId: string): Promise<AdminTradeMedia[]> {
  const supabase = getSupabase();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("trade_media")
    .select("*")
    .eq("trade_id", tradeId)
    .order("sort_order", { ascending: true });
  if (error) return [];
  return ((data ?? []) as unknown as Record<string, unknown>[])
    .map(toAdminTradeMedia)
    .filter((m): m is AdminTradeMedia => m !== null);
}

export function TradeEditForm({ tradeId }: { tradeId: string }) {
  const [state, setState] = useState<FormState>({ phase: "loading" });

  const [outgoingItem, setOutgoingItem] = useState("");
  const [outgoingValue, setOutgoingValue] = useState("");
  const [incomingItem, setIncomingItem] = useState("");
  const [incomingValue, setIncomingValue] = useState("");
  const [incomingDescription, setIncomingDescription] = useState("");
  const [valuationMethod, setValuationMethod] = useState("");
  const [valuationEvidence, setValuationEvidence] = useState("");
  const [generalLocation, setGeneralLocation] = useState("");

  const [publicStory, setPublicStory] = useState("");
  const [participantName, setParticipantName] = useState("");
  const [publicityConfirmed, setPublicityConfirmed] = useState(false);
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [photoNotice, setPhotoNotice] = useState("");

  const [confirmValueChange, setConfirmValueChange] = useState(false);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<{ tradeNumber: number; currentItemSynced: boolean } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const initialLoad = async () => {
      const next = await fetchTradeForEdit(tradeId);
      if (cancelled) return;
      setState(next);
      if (next.phase !== "ready") return;
      const { trade } = next;
      setOutgoingItem(trade.outgoing_item);
      setOutgoingValue(String(trade.outgoing_value));
      setIncomingItem(trade.incoming_item);
      setIncomingValue(String(trade.incoming_value));
      setValuationMethod(trade.valuation_method);
      setValuationEvidence(trade.valuation_evidence ?? "");
      setGeneralLocation(trade.general_location);
      setPublicStory(trade.public_story ?? "");
      setParticipantName(trade.public_participant_name ?? "");
      setPublicityConfirmed(trade.publicity_release_confirmed);
      const existing = await fetchTradeMedia(tradeId);
      if (!cancelled) {
        setMedia(
          existing.map((m) => ({
            key: m.id,
            storage_path: m.storage_path,
            alt_text: m.alt_text,
            previewUrl: publicMediaUrl(m.storage_path),
            status: "existing" as const,
          })),
        );
      }
    };
    void initialLoad();
    return () => {
      cancelled = true;
    };
  }, [tradeId]);

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

    let current = [...media];
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
      const pending: MediaItem = {
        key: id,
        storage_path: path,
        alt_text: null,
        previewUrl: URL.createObjectURL(file),
        status: "uploading",
      };
      current = [...current, pending];
      setMedia(current);

      const { error: uploadError } = await supabase.storage
        .from("trade-media")
        .upload(path, file, { contentType: file.type });
      current = current.map((item) =>
        item.key === id ? { ...item, status: uploadError ? ("error" as const) : ("uploaded" as const) } : item,
      );
      setMedia(current);
    }
  };

  const removeMedia = (key: string) => {
    setMedia((prev) => {
      const target = prev.find((m) => m.key === key);
      // Revoke object URLs we created for new uploads; public URLs need none.
      if (target && target.status !== "existing") URL.revokeObjectURL(target.previewUrl);
      return prev.filter((m) => m.key !== key);
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
        <Link href="/admin/trades/" className="mt-6 inline-block text-sm text-accent underline">
          ← Back to trades
        </Link>
      </Panel>
    );
  }

  const { trade, isCurrentTrade } = state;
  const outgoingNum = Number(outgoingValue);
  const incomingNum = Number(incomingValue);
  const isBtcTrade = trade.btc_amount !== null;

  const draft = {
    outgoingItem,
    outgoingValue: outgoingNum,
    incomingItem,
    incomingValue: incomingNum,
    valuationMethod,
    valuationEvidence,
    generalLocation,
    publicStory,
    publicParticipantName: participantName,
    publicityReleaseConfirmed: publicityConfirmed,
  };
  const valuesChanged = tradeValuesChanged(trade, draft);

  const handleSave = async () => {
    if (saving || saved) return;
    setMessage("");

    if (media.some((m) => m.status === "uploading")) {
      setMessage("Please wait for the images to finish uploading.");
      return;
    }
    if (media.some((m) => m.status === "error")) {
      setMessage("Remove the failed image(s) and add them again.");
      return;
    }

    const problem = validateTradeEdit(trade, draft);
    if (problem) {
      setMessage(problem);
      return;
    }
    if (valuesChanged && !confirmValueChange) {
      setMessage("Confirm the historical value change before saving.");
      return;
    }

    const supabase = getSupabase();
    if (!supabase) return;

    setSaving(true);
    const { data, error } = await supabase.rpc("update_published_trade", {
      p_trade_id: trade.id,
      p_outgoing_item: outgoingItem.trim(),
      p_incoming_item: incomingItem.trim(),
      p_outgoing_value: outgoingNum,
      p_incoming_value: incomingNum,
      p_valuation_method: valuationMethod.trim(),
      p_valuation_evidence: valuationEvidence.trim() || null,
      p_general_location: generalLocation.trim(),
      p_public_story: publicStory.trim() || null,
      p_public_participant_name: participantName.trim() || null,
      p_publicity_release_confirmed: publicityConfirmed,
      p_incoming_item_description: incomingDescription.trim() || null,
      p_media: media.map((m, index) => ({
        storage_path: m.storage_path,
        alt_text: m.alt_text ?? (incomingItem.trim() || `Trade ${trade.trade_number} image`),
        sort_order: index,
      })),
      p_confirm_value_change: valuesChanged,
    });
    setSaving(false);

    if (error) {
      setMessage(`Save failed — ${error.message}`);
      return;
    }
    const result = data as { trade_number?: number; current_item_synced?: boolean } | null;
    setSaved({
      tradeNumber: result?.trade_number ?? trade.trade_number,
      currentItemSynced: Boolean(result?.current_item_synced),
    });
  };

  if (saved) {
    return (
      <Panel className="p-8 text-center" role="status">
        <p className="font-display text-sm text-mint">TRADE #{saved.tradeNumber} UPDATED</p>
        <p className="mt-4 text-sm leading-relaxed text-foreground">
          The correction is live on the public site.
          {saved.currentItemSynced
            ? " The homepage current item was updated to match."
            : ""}
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link href="/admin/trades/" className="border-[3px] border-accent bg-accent px-4 py-2 font-display text-[9px] uppercase tracking-wider text-black hover:bg-transparent hover:text-accent sm:text-[10px]">
            Back to trades
          </Link>
          <Link href="/" className="border-[3px] border-edge px-4 py-2 font-display text-[9px] uppercase tracking-wider text-faded hover:border-accent hover:text-accent sm:text-[10px]">
            View public site
          </Link>
        </div>
      </Panel>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void handleSave();
      }}
      noValidate
      className="flex flex-col gap-6"
    >
      <Panel className="border-accent p-4">
        <p className="font-display text-[9px] uppercase text-accent">
          Editing published trade #{trade.trade_number}
        </p>
        <p className="mt-2 text-xs leading-relaxed text-faded">
          Changes go live on the public site the moment you save. Completed
          {trade.completed_at ? ` ${formatDateTime(trade.completed_at)}` : ""} ·{" "}
          {isCurrentTrade
            ? "This is the CURRENT item on the homepage — item, value, location and first photo changes sync to it automatically."
            : "This is a historical trade; the homepage current item is unaffected."}
        </p>
      </Panel>

      <Panel className="p-4">
        <p className={labelClass}>What changed hands</p>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <Field label="Item given away (required)">
            <input className={inputClass} value={outgoingItem} maxLength={200}
              onChange={(e) => setOutgoingItem(e.target.value)} />
          </Field>
          <Field label={isBtcTrade ? "Outgoing value USD (locked — BTC FMV record)" : "Outgoing value USD (required)"}>
            <input type="number" min="0" step="1" className={inputClass} value={outgoingValue}
              disabled={isBtcTrade} onChange={(e) => setOutgoingValue(e.target.value)} />
          </Field>
          <Field label="Item received (required)">
            <input className={inputClass} value={incomingItem} maxLength={200}
              onChange={(e) => setIncomingItem(e.target.value)} />
          </Field>
          <Field label={isBtcTrade ? "Incoming value USD (locked — BTC FMV record)" : "Incoming value USD (required)"}>
            <input type="number" min="0" step="1" className={inputClass} value={incomingValue}
              disabled={isBtcTrade} onChange={(e) => setIncomingValue(e.target.value)} />
          </Field>
          {isCurrentTrade ? (
            <div className="sm:col-span-2">
              <Field label="Homepage current-item description (optional — applies on save)">
                <textarea rows={2} className={inputClass} value={incomingDescription} maxLength={500}
                  placeholder="Leave blank to keep the existing description"
                  onChange={(e) => setIncomingDescription(e.target.value)} />
              </Field>
            </div>
          ) : null}
        </div>
        {isBtcTrade ? (
          <p className="mt-3 text-xs leading-relaxed text-faded">
            BTC trade: {trade.btc_amount} BTC · frozen USD fair-market value{" "}
            {trade.btc_usd_value !== null ? formatUsd(trade.btc_usd_value) : "—"}
            {trade.btc_valuation_source ? ` · ${trade.btc_valuation_source}` : ""}. The frozen
            value is tax/recordkeeping data and cannot be edited here; text
            and photos remain editable.
          </p>
        ) : null}
      </Panel>

      {valuesChanged ? (
        <Panel className="border-alert p-4">
          <p className="font-display text-[9px] uppercase text-alert">Historical value change</p>
          <p className="mt-2 text-sm leading-relaxed text-foreground">
            You are changing the recorded public values of trade #{trade.trade_number}:
            outgoing {formatUsd(trade.outgoing_value)} → {Number.isFinite(outgoingNum) ? formatUsd(outgoingNum) : "?"} ·
            incoming {formatUsd(trade.incoming_value)} → {Number.isFinite(incomingNum) ? formatUsd(incomingNum) : "?"}.
            This rewrites published challenge history
            {isCurrentTrade ? " and the homepage current item." : "."}
          </p>
          <label className="mt-3 flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1 accent-accent" checked={confirmValueChange}
              onChange={(e) => setConfirmValueChange(e.target.checked)} />
            I confirm this historical value change is correct and should be saved.
          </label>
        </Panel>
      ) : null}

      <Panel className="p-4">
        <p className={labelClass}>Valuation and place</p>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <Field label="Valuation method (required)">
            <input className={inputClass} value={valuationMethod} maxLength={200}
              onChange={(e) => setValuationMethod(e.target.value)} />
          </Field>
          <Field label="Valuation evidence (optional — makes valuation verified)">
            <input className={inputClass} value={valuationEvidence} maxLength={500}
              onChange={(e) => setValuationEvidence(e.target.value)} />
          </Field>
          <Field label="Public general location (required)">
            <input className={inputClass} value={generalLocation} maxLength={200}
              onChange={(e) => setGeneralLocation(e.target.value)} />
          </Field>
        </div>
      </Panel>

      <Panel className="border-accent p-4">
        <p className="font-display text-[9px] uppercase text-accent">Public content</p>
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
              Public images (up to {MAX_PUBLIC_IMAGES} — saving replaces the whole photo set)
            </span>
            <input type="file" accept="image/jpeg,image/png,image.webp" multiple className="hidden"
              id="edit-trade-images" onChange={addFiles} />
            <label htmlFor="edit-trade-images"
              className="cursor-pointer border-[3px] border-dashed border-edge px-4 py-6 text-center text-sm text-faded transition-colors hover:border-accent hover:text-accent">
              {media.length >= MAX_PUBLIC_IMAGES ? "Image limit reached" : "Add public images (JPG / PNG / WebP, ≤ 10 MB each)"}
            </label>
            {photoNotice ? <p role="alert" className="text-xs text-alert">{photoNotice}</p> : null}
            {media.length > 0 ? (
              <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                {media.map((m) => (
                  <li key={m.key} className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={m.previewUrl} alt={m.alt_text ?? "Public trade image"} loading="lazy" decoding="async"
                      className={`aspect-square w-full border-[3px] object-cover ${
                        m.status === "error" ? "border-alert" : m.status === "uploading" ? "border-edge" : "border-mint"
                      }`} />
                    <button type="button" onClick={() => removeMedia(m.key)} aria-label="Remove image"
                      className="absolute -right-2 -top-2 border-[3px] border-edge bg-panel px-1.5 text-xs text-alert">
                      ×
                    </button>
                    <p className="mt-1 text-[10px] text-faded">
                      {m.status === "uploading" ? "Uploading…" : m.status === "error" ? "Failed" : m.status === "existing" ? "Published" : "Uploaded"}
                    </p>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
      </Panel>

      <Panel className="p-4">
        <p className={labelClass}>Record (read-only here)</p>
        <p className="mt-2 text-xs leading-relaxed text-faded">
          {trade.public_participant_name ? `Participant: ${trade.public_participant_name} · ` : ""}
          Published {trade.published_at ? formatDateTime(trade.published_at) : "—"} ·
          last updated {trade.updated_at ? formatDateTime(trade.updated_at) : "—"}.
        </p>
        {trade.private_completion_notes ? (
          <p className="mt-2 text-xs leading-relaxed text-faded">
            Private completion notes (visible to admins only): {trade.private_completion_notes}
          </p>
        ) : null}
      </Panel>

      {message ? (
        <p role="alert" className="border-[3px] border-alert px-3 py-2 text-sm text-alert">
          {message}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={saving || (valuesChanged && !confirmValueChange)}
          className="border-[3px] border-accent bg-accent px-6 py-3 font-display text-[10px] uppercase tracking-wider text-black transition-colors hover:bg-transparent hover:text-accent disabled:cursor-not-allowed disabled:opacity-50 sm:text-xs"
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
        <Link
          href="/admin/trades/"
          className="border-[3px] border-edge px-6 py-3 font-display text-[10px] uppercase tracking-wider text-faded transition-colors hover:border-accent hover:text-accent sm:text-xs"
        >
          Cancel
        </Link>
        {valuesChanged && !confirmValueChange ? (
          <span className="text-xs text-alert">Confirm the value change to enable saving.</span>
        ) : null}
      </div>
    </form>
  );
}
