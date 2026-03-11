import type { PupperfishPlannerMode } from "@tungpastry/pupperfish-framework";

import type { PupperfishUiSignal, PupperfishUiSignalStore, PupperfishUiStatus } from "./types.js";

const DEFAULT_SIGNAL: PupperfishUiSignal = {
  status: "idle",
  confidence: null,
  lowEvidence: false,
  evidenceCount: 0,
  chartsCount: 0,
  hasError: false,
  mode: null,
  updatedAt: "",
};

function normalizeSignal(input: unknown): PupperfishUiSignal {
  if (!input || typeof input !== "object") {
    return DEFAULT_SIGNAL;
  }

  const candidate = input as Partial<PupperfishUiSignal>;
  const confidenceValue =
    typeof candidate.confidence === "number" && Number.isFinite(candidate.confidence)
      ? Math.min(1, Math.max(0, candidate.confidence))
      : null;
  const statusValue: PupperfishUiStatus =
    candidate.status === "listening" ||
    candidate.status === "thinking" ||
    candidate.status === "answering" ||
    candidate.status === "caution"
      ? candidate.status
      : "idle";

  return {
    status: statusValue,
    confidence: confidenceValue,
    lowEvidence: Boolean(candidate.lowEvidence),
    evidenceCount: Number.isFinite(candidate.evidenceCount) ? Math.max(0, Number(candidate.evidenceCount)) : 0,
    chartsCount: Number.isFinite(candidate.chartsCount) ? Math.max(0, Number(candidate.chartsCount)) : 0,
    hasError: Boolean(candidate.hasError),
    mode: typeof candidate.mode === "string" ? (candidate.mode as PupperfishPlannerMode) : null,
    updatedAt: typeof candidate.updatedAt === "string" ? candidate.updatedAt : "",
  };
}

export function createLocalStoragePupperfishUiSignalStore(storageKey: string): PupperfishUiSignalStore {
  return {
    read() {
      if (typeof window === "undefined") {
        return DEFAULT_SIGNAL;
      }

      try {
        const raw = window.localStorage.getItem(storageKey);
        if (!raw) {
          return DEFAULT_SIGNAL;
        }
        return normalizeSignal(JSON.parse(raw));
      } catch {
        return DEFAULT_SIGNAL;
      }
    },
    write(signal) {
      const nextSignal = normalizeSignal({
        ...this.read(),
        ...signal,
        updatedAt: new Date().toISOString(),
      });

      if (typeof window !== "undefined") {
        try {
          window.localStorage.setItem(storageKey, JSON.stringify(nextSignal));
        } catch {
          // ignore
        }
      }

      return nextSignal;
    },
    subscribe(listener) {
      if (typeof window === "undefined") {
        return () => {};
      }

      const onStorage = (event: StorageEvent) => {
        if (!event.key || event.key === storageKey) {
          listener();
        }
      };

      window.addEventListener("storage", onStorage);
      return () => window.removeEventListener("storage", onStorage);
    },
  };
}
