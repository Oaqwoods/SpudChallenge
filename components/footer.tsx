import Link from "next/link";
import { MetaConsentSettingsLink } from "@/components/meta-consent";
import { SpudMascot } from "@/components/spud-mascot";

const LEGAL_LINKS: Array<[string, string]> = [
  ["/rules/", "Public Rules"],
  ["/terms/", "Terms of Participation"],
  ["/privacy/", "Privacy Policy"],
];

export function Footer() {
  return (
    <footer className="border-t-[3px] border-edge">
      <div className="mx-auto flex max-w-5xl flex-col items-center gap-4 px-4 py-8 text-center">
        <SpudMascot decorative className="w-12" />
        <p className="font-display text-xs text-accent">$1 → $5M</p>
        <p className="text-xs text-faded">$1 → $5,000,000 in 21 Days · 21 Days. Only Trades.</p>
        <nav aria-label="Legal" className="flex flex-wrap justify-center gap-x-4 gap-y-2 text-xs">
          {LEGAL_LINKS.map(([href, label]) => (
            <Link key={href} href={href} className="text-faded underline hover:text-accent">
              {label}
            </Link>
          ))}
          <MetaConsentSettingsLink />
        </nav>
        <p className="max-w-md text-[11px] leading-relaxed text-faded">
          Not a marketplace. Offers are reviewed manually, trades happen offline,
          and completed trades are final.
        </p>
        <p className="text-[11px] text-faded">A Trade Challenge by Spud</p>
      </div>
    </footer>
  );
}
