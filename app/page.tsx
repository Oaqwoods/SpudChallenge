import type { Metadata } from "next";
import { ChallengeProvider } from "@/components/challenge-provider";
import { Header } from "@/components/header";
import { Hero } from "@/components/hero";
import { CountdownSection } from "@/components/countdown";
import { CurrentItem } from "@/components/current-item";
import { ScoreboardSection } from "@/components/scoreboard";
import { TradeJourney } from "@/components/trade-journey";
import { HowItWorks } from "@/components/how-it-works";
import RulesSection from "@/components/rules";
import { FaqSection } from "@/components/faq";
import { FollowSection } from "@/components/follow-section";
import { Footer } from "@/components/footer";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

export default function Home() {
  return (
    <div id="top">
      <Header />
      <main>
        <ChallengeProvider>
          <Hero />
          <CountdownSection />
          <CurrentItem />
          <ScoreboardSection />
          <TradeJourney />
        </ChallengeProvider>
        <HowItWorks />
        <RulesSection />
        <FaqSection />
        <FollowSection />
      </main>
      <Footer />
    </div>
  );
}
