"use client";

import Image from "next/image";
import { useChallenge } from "@/components/challenge-provider";
import { DEFAULT_SETTINGS, type PublicTrade } from "@/lib/challenge";
import { publicMediaUrl } from "@/lib/supabase";
import { formatDate, formatSignedUsd, formatUsd } from "@/lib/format";
import { Panel, SectionHeading } from "@/components/ui";

function TradeCard({ trade }: { trade: PublicTrade }) {
  const { mediaByTrade } = useChallenge();
  const media = (mediaByTrade[trade.id] ?? []).slice(0, 3);
  const delta = trade.incoming_value - trade.outgoing_value;

  return (
    <Panel className="p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-display text-xs text-accent">TRADE #{trade.trade_number}</h3>
        <p className="text-xs text-faded">{formatDate(trade.completed_at)}</p>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
        <div>
          <p className="font-display text-[8px] uppercase text-faded">Gave</p>
          <p className="mt-1 text-sm text-foreground">{trade.outgoing_item}</p>
          <p className="text-xs text-faded">{formatUsd(trade.outgoing_value)}</p>
        </div>
        <p aria-hidden="true" className="hidden font-display text-accent sm:block">
          →
        </p>
        <div>
          <p className="font-display text-[8px] uppercase text-faded">Received</p>
          <p className="mt-1 text-sm text-foreground">{trade.incoming_item}</p>
          <p className="text-xs text-mint">{formatUsd(trade.incoming_value)}</p>
        </div>
      </div>
      <p className="mt-3 font-display text-[9px] sm:text-[10px]">
        <span className="text-faded">VALUE CHANGE </span>
        <span className={delta >= 0 ? "text-mint" : "text-alert"}>
          {formatSignedUsd(delta)}
        </span>
      </p>
      {trade.btc_amount != null ? (
        <p className="mt-3 text-xs text-faded">
          BTC {trade.btc_amount} · valued {formatUsd(trade.btc_usd_value ?? 0)} at
          completion{trade.btc_valuation_source ? ` via ${trade.btc_valuation_source}` : ""} (frozen)
        </p>
      ) : null}
      <p className="mt-3 text-xs text-faded">
        Valuation: {trade.valuation_method} ·{" "}
        <span className={trade.valuation_status === "verified" ? "text-mint" : "text-accent"}>
          {trade.valuation_status === "verified" ? "VERIFIED" : "ESTIMATED"}
        </span>
        {trade.general_location ? ` · ${trade.general_location}` : ""}
      </p>
      {trade.public_story ? (
        <p className="mt-3 text-sm leading-relaxed text-foreground">{trade.public_story}</p>
      ) : null}
      {trade.public_participant_name ? (
        <p className="mt-2 text-xs text-faded">Traded with {trade.public_participant_name}</p>
      ) : null}
      {media.length > 0 ? (
        <div className="mt-4 grid grid-cols-3 gap-2">
          {media.map((m) => (
            <Image
              key={m.id}
              src={publicMediaUrl(m.storage_path)}
              alt={m.alt_text ?? `${trade.incoming_item} photo`}
              width={400}
              height={300}
              className="aspect-[4/3] w-full border-[3px] border-edge object-cover"
            />
          ))}
        </div>
      ) : null}
    </Panel>
  );
}

export function TradeJourney() {
  const { settings, trades, loading } = useChallenge();
  const s = settings ?? DEFAULT_SETTINGS;

  const chain = ["$1", ...trades.map((t) => t.incoming_item)];

  return (
    <section id="journey" aria-labelledby="journey-heading" className="mx-auto max-w-3xl px-4 py-8">
      <SectionHeading id="journey-heading">Trade Journey</SectionHeading>
      <div className="mt-4 overflow-x-auto border-[3px] border-edge bg-panel px-4 py-3">
        <p className="whitespace-nowrap font-display text-[10px] sm:text-xs">
          {chain.map((item, i) => (
            <span key={i}>
              {i > 0 ? (
                <span aria-hidden="true" className="text-faded">
                  {" "}
                  →{" "}
                </span>
              ) : null}
              <span
                className={
                  i === chain.length - 1 && trades.length > 0 ? "text-accent" : "text-foreground"
                }
              >
                {item}
              </span>
            </span>
          ))}
          <span aria-hidden="true" className="text-faded">
            {" "}
            →{" "}
          </span>
          <span className="text-accent">???</span>
        </p>
      </div>
      <div className="mt-4 flex flex-col gap-4">
        {!loading && trades.length === 0 ? (
          <Panel className="px-5 py-8 text-center">
            <p className="font-display text-xs text-faded">NO COMPLETED TRADES YET</p>
            <p className="mt-3 text-sm text-faded">
              Trade #1 opens when the clock starts. The journey will appear here.
            </p>
          </Panel>
        ) : (
          trades.map((t) => <TradeCard key={t.id} trade={t} />)
        )}
      </div>
      {loading ? (
        <Panel className="mt-4 px-5 py-8 text-center" aria-hidden="true">
          <p className="font-display text-xs text-faded">LOADING…</p>
        </Panel>
      ) : null}
      <p className="mt-3 text-xs text-faded">
        Goal: {formatUsd(s.target_value)}. Only completed and published trades appear here.
      </p>
    </section>
  );
}
