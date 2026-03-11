"use client";

import type { PupperfishUiStatus } from "./types.js";

type ConfidenceTier = "none" | "high" | "medium" | "low";

type PupperfishDockProps = {
  status: PupperfishUiStatus;
  confidence: number | null;
  lowEvidence?: boolean;
  compact?: boolean;
  label?: string;
  className?: string;
};

const HIGH_CONFIDENCE_THRESHOLD = 0.75;
const MEDIUM_CONFIDENCE_THRESHOLD = 0.45;

export function resolveConfidenceTier(confidence: number | null): ConfidenceTier {
  if (typeof confidence !== "number" || !Number.isFinite(confidence)) {
    return "none";
  }

  if (confidence >= HIGH_CONFIDENCE_THRESHOLD) {
    return "high";
  }

  if (confidence >= MEDIUM_CONFIDENCE_THRESHOLD) {
    return "medium";
  }

  return "low";
}

export function formatPupperfishStatusLabel(status: PupperfishUiStatus): string {
  if (status === "idle") {
    return "Idle";
  }
  if (status === "listening") {
    return "Listening";
  }
  if (status === "thinking") {
    return "Thinking";
  }
  if (status === "answering") {
    return "Answering";
  }
  return "Caution";
}

export function PupperfishDock({
  status,
  confidence,
  lowEvidence = false,
  compact = false,
  label = "Pupperfish",
  className,
}: PupperfishDockProps) {
  const confidenceTier = resolveConfidenceTier(confidence);
  const rootClassName = [
    "zen-pf-dock",
    `zen-pf-dock--${status}`,
    compact ? "zen-pf-dock--compact" : "",
    lowEvidence ? "zen-pf-dock--low-evidence" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={rootClassName} aria-label={`Pupperfish status ${formatPupperfishStatusLabel(status)}`}>
      <span className={`zen-pf-dock__ring zen-pf-dock__ring--${confidenceTier}`} aria-hidden="true">
        <span className="zen-pf-dock__fish">🐡</span>
      </span>
      <span className="zen-pf-dock__content">
        <span className="zen-pf-dock__title">{label}</span>
        <span className="zen-pf-dock__status">{formatPupperfishStatusLabel(status)}</span>
      </span>
      <span className="zen-pf-dock__meta">
        {typeof confidence === "number" ? <span>{Math.round(confidence * 100)}%</span> : <span>-</span>}
        {lowEvidence ? <span className="zen-pf-dock__signal">Low evidence</span> : null}
      </span>
    </div>
  );
}
