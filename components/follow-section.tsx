import { SectionHeading } from "@/components/ui";

export function FollowSection() {
  return (
    <section id="follow" aria-labelledby="follow-heading" className="mx-auto max-w-3xl px-4 py-8">
      <SectionHeading id="follow-heading">Follow Every Trade</SectionHeading>
      <div className="mt-4 border-[3px] border-dashed border-edge bg-panel p-6 text-center">
        <p className="font-display text-xs leading-relaxed text-accent">FOLLOW THE CHALLENGE</p>
        <p className="mt-3 text-sm leading-relaxed text-faded">
          Get every completed trade by email, or tell us you might have something
          to trade when the challenge starts.
        </p>
        <p className="mt-3 text-xs text-faded">
          Email signup goes live with the prelaunch release.
        </p>
      </div>
    </section>
  );
}
