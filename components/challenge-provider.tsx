"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { fetchChallengeData, EMPTY_DATA, type ChallengeData } from "@/lib/challenge";

interface ChallengeContextValue extends ChallengeData {
  loading: boolean;
}

const ChallengeContext = createContext<ChallengeContextValue>({
  ...EMPTY_DATA,
  loading: true,
});

export function ChallengeProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<ChallengeData>(EMPTY_DATA);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    fetchChallengeData()
      .then((result) => {
        if (active) setData(result);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
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
