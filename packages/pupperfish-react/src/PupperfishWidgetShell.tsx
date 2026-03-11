"use client";

import { useCallback, useEffect, useState } from "react";

import { PupperfishDock, formatPupperfishStatusLabel } from "./PupperfishDock.js";
import type { PupperfishBranding, PupperfishUiSignal, PupperfishUiSignalStore } from "./types.js";

type PupperfishWidgetShellProps = {
  signalStore: PupperfishUiSignalStore;
  branding: PupperfishBranding;
};

export function PupperfishWidgetShell({ signalStore, branding }: PupperfishWidgetShellProps) {
  const [open, setOpen] = useState(false);
  const [signal, setSignal] = useState<PupperfishUiSignal>(() => signalStore.read());

  const refreshSignal = useCallback(() => {
    setSignal(signalStore.read());
  }, [signalStore]);

  useEffect(() => {
    refreshSignal();
    const unsubscribe = signalStore.subscribe(refreshSignal);
    const intervalId = window.setInterval(refreshSignal, 10000);

    return () => {
      unsubscribe();
      window.clearInterval(intervalId);
    };
  }, [refreshSignal, signalStore]);

  const launcherLabel = branding.launcherLabel ?? `🐡 ${branding.assistantName}`;
  const fullPageHref = branding.fullPageHref ?? "/pupperfish";
  const fullPageCta = branding.fullPageCta ?? "Mở chatbot đầy đủ";

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
        Trạng thái gần nhất: <strong>{formatPupperfishStatusLabel(signal.status)}</strong>
        {signal.mode ? ` · ${signal.mode.toUpperCase()}` : ""}
      </p>
      <p className="zen-pupperfish-widget__summary">
        Last answer signal: {signal.evidenceCount > 0 ? `có evidence (${signal.evidenceCount})` : "chưa có evidence mạnh"}
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
