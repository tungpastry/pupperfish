"use client";

import { useCallback, useEffect, useState } from "react";

import { PupperfishDock, formatPupperfishStatusLabel } from "./PupperfishDock.js";
import type { PupperfishBranding, PupperfishUiSignal, PupperfishUiSignalStore } from "./types.js";

type PupperfishWidgetShellProps = {
  signalStore: PupperfishUiSignalStore;
  branding: PupperfishBranding;
};

function formatElapsedDuration(totalSeconds: number | null | undefined): string {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds ?? 0));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;

  return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}

export function PupperfishWidgetShell({ signalStore, branding }: PupperfishWidgetShellProps) {
  const [open, setOpen] = useState(false);
  const [signal, setSignal] = useState<PupperfishUiSignal>(() => signalStore.read());

  const refreshSignal = useCallback(() => {
    setSignal(signalStore.read());
  }, [signalStore]);

  useEffect(() => {
    refreshSignal();
    const unsubscribe = signalStore.subscribe(refreshSignal);
    const intervalId = window.setInterval(refreshSignal, signal.pendingVisible ? 1000 : 10000);

    return () => {
      unsubscribe();
      window.clearInterval(intervalId);
    };
  }, [refreshSignal, signal.pendingVisible, signalStore]);

  const launcherLabel = branding.launcherLabel ?? `🐡 ${branding.assistantName}`;
  const fullPageHref = branding.fullPageHref ?? "/pupperfish";
  const fullPageCta = branding.fullPageCta ?? "Mở chatbot đầy đủ";
  const pendingSummary = signal.pendingVisible
    ? `${signal.pendingMessage ?? "Pupperfish đang xử lý..."}${signal.pendingPlannerMode ? ` · ${signal.pendingPlannerMode.toUpperCase()}` : ""}`
    : null;
  const pendingTimer = signal.pendingVisible ? `⏱ ${formatElapsedDuration(signal.pendingElapsedSec)}` : null;

  if (!open) {
    return (
      <button
        type="button"
        className="zen-pupperfish-launcher"
        onClick={() => {
          refreshSignal();
          setOpen(true);
        }}
        aria-label={`Mở trợ lý ${branding.assistantName}`}
      >
        <PupperfishDock
          status={signal.status}
          confidence={signal.confidence}
          lowEvidence={signal.lowEvidence}
          compact
          label={launcherLabel}
          className="zen-pupperfish-launcher__dock"
        />
      </button>
    );
  }

  return (
    <aside className="zen-pupperfish-widget" aria-label="Pupperfish widget">
      <div className="zen-pupperfish-widget__head">
        <PupperfishDock
          status={signal.status}
          confidence={signal.confidence}
          lowEvidence={signal.lowEvidence}
          label={launcherLabel}
          className="zen-pupperfish-widget__dock"
        />
        <button type="button" className="zen-icon-btn" onClick={() => setOpen(false)} aria-label={`Đóng widget ${branding.assistantName}`}>
          Đóng
        </button>
      </div>

      <p className="zen-pupperfish-widget__summary">
        {signal.pendingVisible ? (
          <>
            <strong>{pendingSummary}</strong>
            {signal.pendingSlow ? " · query lâu hơn bình thường" : ""}
          </>
        ) : (
          <>
            Trạng thái gần nhất: <strong>{formatPupperfishStatusLabel(signal.status)}</strong>
            {signal.mode ? ` · ${signal.mode.toUpperCase()}` : ""}
          </>
        )}
      </p>
      <p className="zen-pupperfish-widget__summary">
        {signal.pendingVisible
          ? pendingTimer
          : `Last answer signal: ${signal.evidenceCount > 0 ? `có evidence (${signal.evidenceCount})` : "chưa có evidence mạnh"}`}
      </p>

      <div className="zen-pupperfish-widget__actions">
        <a className="zen-btn zen-btn--secondary" href={fullPageHref} aria-label={fullPageCta}>
          {fullPageCta}
        </a>
        <button type="button" className="zen-chip" onClick={refreshSignal} aria-label="Làm mới trạng thái widget">
          Refresh
        </button>
      </div>
    </aside>
  );
}
