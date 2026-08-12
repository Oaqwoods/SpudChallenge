"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { EMPTY_DATA, type ChallengeData } from "@/lib/challenge";
import { fetchChallengeData } from "@/lib/fetch-challenge";

interface ChallengeContextValue extends ChallengeData {
  loading: boolean;
}

const ChallengeContext = createContext<ChallengeContextValue>({
  ...EMPTY_DATA,
  loading: true,
});

const REFETCH_AFTER_MS = 30_000;

export function ChallengeProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<ChallengeData>(EMPTY_DATA);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    let lastFetch = 0;

    const load = async () => {
      lastFetch = Date.now();
      const result = await fetchChallengeData();
      if (active) {
        setData(result);
        setLoading(false);
      }
    };

    load();

    // Admin changes to challenge timing/settings propagate without a reload:
    // refetch (throttled) when the visitor returns to the tab.
    const onVisibilityChange = () => {
      if (
        document.visibilityState === "visible" &&
        Date.now() - lastFetch > REFETCH_AFTER_MS
      ) {
        load();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      active = false;
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  return (
    <ChallengeContext.Provider value={{ ...data, loading }}>
      {children}
    </ChallengeContext.Provider>
  );
}

export function useChallenge(): ChallengeContextValue {
  return useContext(ChallengeContext);
}
