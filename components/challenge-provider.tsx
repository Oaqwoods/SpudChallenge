"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { EMPTY_DATA, type ChallengeData } from "@/lib/challenge";
import { fetchChallengeData } from "@/lib/fetch-challenge";

interface ChallengeContextValue extends ChallengeData {
  loading: boolean;
  refresh: () => void;
}

const ChallengeContext = createContext<ChallengeContextValue>({
  ...EMPTY_DATA,
  loading: true,
  refresh: () => {},
});

const REFETCH_AFTER_MS = 30_000;

export function ChallengeProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<ChallengeData>(EMPTY_DATA);
  const [loading, setLoading] = useState(true);
  const activeRef = useRef(true);
  const lastFetchRef = useRef(0);

  const load = useCallback(async () => {
    lastFetchRef.current = Date.now();
    const result = await fetchChallengeData();
    if (activeRef.current) {
      setData(result);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    activeRef.current = true;
    load();

    // Admin changes to challenge timing/settings propagate without a reload:
    // refetch (throttled) when the visitor returns to the tab.
    const onVisibilityChange = () => {
      if (
        document.visibilityState === "visible" &&
        Date.now() - lastFetchRef.current > REFETCH_AFTER_MS
      ) {
        load();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      activeRef.current = false;
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [load]);

  return (
    <ChallengeContext.Provider value={{ ...data, loading, refresh: load }}>
      {children}
    </ChallengeContext.Provider>
  );
}

export function useChallenge(): ChallengeContextValue {
  return useContext(ChallengeContext);
}
