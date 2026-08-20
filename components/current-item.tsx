"use client";

import Image from "next/image";
import { useChallenge } from "@/components/challenge-provider";
import { DEFAULT_SETTINGS } from "@/lib/challenge";
import { publicMediaUrl } from "@/lib/supabase";
import { formatDate, formatUsd } from "@/lib/format";
import { Panel, SectionHeading } from "@/components/ui";
import { OfferCta } from "@/components/ctas";
import { SharePanel } from "@/components/share-panel";

export function CurrentItem() {
  const { settings, trades } = useChallenge();
  const s = settings ?? DEFAULT_SETTINGS;
  const lastTrade = trades.length > 0 ? trades[trades.length - 1] : null;

  const valueSource = lastTrade
    ? `${lastTrade.valuation_method} · ${lastTrade.valuation_status === "verified" ? "Verified" : "Estimated"}`
    : "Verified starting stake";
  const acquired = lastTrade ? formatDate(lastTrade.completed_at) : "Day 0";
  const frozenBtcValue = lastTrade?.btc_amount != null;

  return (
    <section id="current" aria-labelledby="current-heading" className="mx-auto max-w-3xl px-4 py-8">
      <SectionHeading id="current-heading">Current Item</SectionHeading>
      <Panel className="mt-4 overflow-hidden">
        <div className="grid sm:grid-cols-[240px_1fr]">
          <div className="flex aspect-square items-center justify-center border-b-[3px] border-edge bg-background sm:border-b-0 sm:border-r-[3px]">
            {s.current_item_image_path ? (
              <Image
                src={publicMediaUrl(s.current_item_image_path)}
                alt={s.current_item_name}
                width={640}
                height={640}
                className="h-full w-full object-cover"
              />
            ) : (
              <span aria-hidden="true" className="font-display text-6xl text-accent">
                $
              </span>
            )}
          </div>
          <div className="flex flex-col gap-3 p-5">
            <h3 className="font-display text-sm leading-relaxed text-foreground sm:text-base">
              {s.current_item_name}
            </h3>
            {s.current_item_description ? (
              <p className="text-sm leading-relaxed text-faded">{s.current_item_description}</p>
            ) : null}
            <p className="font-display text-2xl text-mint sm:text-3xl">
              {formatUsd(s.current_item_value)}
            </p>
            {frozenBtcValue ? (
              <p className="text-xs text-faded">
                BTC value frozen at fair-market value on completion — it does not
                move with the market.
              </p>
            ) : null}
            <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="font-display text-[8px] uppercase text-faded">Trade #</dt>
                <dd className="text-foreground">{s.current_trade_number}</dd>
              </div>
              <div>
                <dt className="font-display text-[8px] uppercase text-faded">Acquired</dt>
                <dd className="text-foreground">{acquired}</dd>
              </div>
              <div>
                <dt className="font-display text-[8px] uppercase text-faded">Location</dt>
                <dd className="text-foreground">{s.current_item_general_location ?? "—"}</dd>
              </div>
              <div>
                <dt className="font-display text-[8px] uppercase text-faded">Value Established</dt>
                <dd className="text-foreground">{valueSource}</dd>
              </div>
            </dl>
            <div className="mt-2">
              <OfferCta />
            </div>
          </div>
        </div>
        <SharePanel />
      </Panel>
    </section>
  );
}
