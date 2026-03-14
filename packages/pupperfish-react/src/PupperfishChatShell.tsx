"use client";
/* eslint-disable @next/next/no-img-element */

import { FormEvent, KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { PupperfishEvidenceItem, PupperfishPlannerMode, PupperfishRetrieveResult } from "@tungpastry/pupperfish-framework";

import { PupperfishChartViewer } from "./PupperfishChartViewer.js";
import { PupperfishDock, formatPupperfishStatusLabel, resolveConfidenceTier } from "./PupperfishDock.js";
import { TradeImageGalleryManager } from "./TradeImageGalleryManager.js";
import type {
  ActiveMessageSelection,
  AssistantRenderMeta,
  PupperfishBranding,
  PupperfishClient,
  PupperfishComposerSubmitMode,
  PupperfishEvidenceTab,
  PendingAssistantState,
  PupperfishUiSignalStore,
  PupperfishUiStatus,
  QueryPhase,
} from "./types.js";

type ChatRole = "user" | "assistant";

type ChatMessage = {
  id: string;
  role: ChatRole;
  text: string;
  createdAt: string;
  confidence?: number;
  assumptions: string[];
  evidence: PupperfishEvidenceItem[];
  renderMeta?: AssistantRenderMeta;
  requestUid?: string;
};

const MODE_OPTIONS: Array<{ value: PupperfishPlannerMode; label: string }> = [
  { value: "hybrid", label: "Hybrid" },
  { value: "sql", label: "Logs" },
  { value: "summary", label: "Summaries" },
  { value: "memory", label: "Memory" },
  { value: "image", label: "Images" },
];

const LOW_CONFIDENCE_THRESHOLD = 0.45;
const PENDING_ASSISTANT_HEADER = "🐡 Pupperfish đang xử lý...";
const DEFAULT_PROMPT_HISTORY_STORAGE_KEY = "pupperfish-prompt-history-v1";
const DEFAULT_PROMPT_HISTORY_LIMIT = 50;
const PHASE_TRANSITIONS: Array<{ phase: QueryPhase; delayMs: number }> = [
  { phase: "routing", delayMs: 150 },
  { phase: "retrieving", delayMs: 700 },
  { phase: "generating", delayMs: 2200 },
];

const MODE_LABELS: Record<PupperfishPlannerMode, string> = {
  hybrid: "Hybrid",
  sql: "Logs",
  summary: "Summaries",
  memory: "Memory",
  image: "Images",
};

function nowIso(): string {
  return new Date().toISOString();
}

function formatElapsedDuration(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;

  return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}

function resolvePhaseCopy(phase: QueryPhase, plannerMode: PupperfishPlannerMode | null): string {
  if (phase === "submitting") {
    return "Đang gửi truy vấn...";
  }

  if (phase === "routing") {
    if (plannerMode === "sql") {
      return "Đang chọn planner log phù hợp...";
    }
    if (plannerMode === "summary") {
      return "Đang chọn planner summary phù hợp...";
    }
    if (plannerMode === "memory") {
      return "Đang chọn planner memory phù hợp...";
    }
    if (plannerMode === "image") {
      return "Đang chọn planner chart/image phù hợp...";
    }
    return "Đang chọn planner phù hợp...";
  }

  if (phase === "retrieving") {
    if (plannerMode === "sql") {
      return "Đang tìm log liên quan...";
    }
    if (plannerMode === "summary") {
      return "Đang truy xuất summaries...";
    }
    if (plannerMode === "memory") {
      return "Đang truy xuất memory...";
    }
    if (plannerMode === "image") {
      return "Đang đối chiếu chart/image...";
    }
    return "Đang phối hợp nhiều nguồn dữ liệu...";
  }

  if (phase === "generating") {
    if (plannerMode === "sql") {
      return "Đang tổng hợp kết quả từ log...";
    }
    if (plannerMode === "summary") {
      return "Đang gom các tóm tắt liên quan...";
    }
    if (plannerMode === "memory") {
      return "Đang kiểm tra trí nhớ liên quan...";
    }
    if (plannerMode === "image") {
      return "Đang đọc dữ liệu hình ảnh liên quan...";
    }
    return "Đang soạn câu trả lời...";
  }

  if (phase === "error") {
    return "Có lỗi khi xử lý truy vấn. Bạn thử gửi lại câu hỏi nhé.";
  }

  return "";
}

function resolveSlowCopy(elapsedSec: number): string | null {
  if (elapsedSec >= 20) {
    return "Đang hoàn tất bước cuối...";
  }
  if (elapsedSec >= 12) {
    return "Truy vấn đang mất lâu hơn bình thường.";
  }
  if (elapsedSec >= 8) {
    return "Pupperfish vẫn đang xử lý...";
  }
  return null;
}

function createIdlePendingAssistantState(): PendingAssistantState {
  return {
    visible: false,
    phase: "idle",
    plannerMode: null,
    startedAt: null,
    elapsedSec: 0,
    header: PENDING_ASSISTANT_HEADER,
    message: "",
    isSlow: false,
    requestId: null,
    errorMessage: null,
  };
}

function clampPromptHistoryLimit(limit: number): number {
  if (!Number.isFinite(limit)) {
    return DEFAULT_PROMPT_HISTORY_LIMIT;
  }

  return Math.max(1, Math.floor(limit));
}

function readPromptHistory(storageKey: string, limit: number): string[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter((item) => item.length > 0)
      .slice(0, limit);
  } catch {
    return [];
  }
}

function writePromptHistory(storageKey: string, promptHistory: string[]): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    if (promptHistory.length < 1) {
      window.localStorage.removeItem(storageKey);
      return;
    }

    window.localStorage.setItem(storageKey, JSON.stringify(promptHistory));
  } catch {
    // Ignore storage failures. Prompt history is a progressive enhancement.
  }
}

function isTextareaCaretAtStart(textarea: HTMLTextAreaElement): boolean {
  return textarea.selectionStart === 0 && textarea.selectionEnd === 0;
}

function isTextareaCaretAtEnd(textarea: HTMLTextAreaElement): boolean {
  const length = textarea.value.length;
  return textarea.selectionStart === length && textarea.selectionEnd === length;
}

function buildPendingAssistantState(
  requestId: string,
  phase: QueryPhase,
  plannerMode: PupperfishPlannerMode | null,
  startedAtMs: number,
  errorMessage?: string | null,
): PendingAssistantState {
  const elapsedSec = startedAtMs > 0 ? Math.max(0, Math.floor((Date.now() - startedAtMs) / 1000)) : 0;
  const slowCopy = resolveSlowCopy(elapsedSec);

  return {
    visible: phase !== "idle" && phase !== "done",
    phase,
    plannerMode,
    startedAt: startedAtMs > 0 ? new Date(startedAtMs).toISOString() : null,
    elapsedSec,
    header: PENDING_ASSISTANT_HEADER,
    message: errorMessage ?? resolvePhaseCopy(phase, plannerMode),
    isSlow: Boolean(slowCopy),
    requestId,
    errorMessage: errorMessage ?? null,
  };
}

function requestFormSubmit(form: HTMLFormElement | null): void {
  if (!form) {
    return;
  }

  if (typeof form.requestSubmit === "function") {
    form.requestSubmit();
    return;
  }

  form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
}

type ComposerSubmitKeyOptions = {
  submitMode: PupperfishComposerSubmitMode;
  key: string;
  shiftKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  isComposing: boolean;
  hasContent: boolean;
  busy: boolean;
};

export function shouldSubmitComposerKey({
  submitMode,
  key,
  shiftKey,
  ctrlKey,
  metaKey,
  altKey,
  isComposing,
  hasContent,
  busy,
}: ComposerSubmitKeyOptions): boolean {
  if (key !== "Enter" || isComposing || !hasContent || busy) {
    return false;
  }

  if (submitMode === "meta-enter-to-submit") {
    return (ctrlKey || metaKey) && !shiftKey && !altKey;
  }

  return !shiftKey && !ctrlKey && !metaKey && !altKey;
}

function createClientMessageId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function buildAssistantRenderMeta(payload: PupperfishRetrieveResult): AssistantRenderMeta {
  const evidenceCount = Array.isArray(payload.evidence) ? payload.evidence.length : 0;
  const chartsCount = Array.isArray(payload.evidence) ? payload.evidence.filter((item) => item.kind === "image").length : 0;
  const confidence = typeof payload.confidence === "number" && Number.isFinite(payload.confidence) ? payload.confidence : null;

  return {
    confidence,
    assumptions: Array.isArray(payload.assumptions) ? payload.assumptions : [],
    evidenceCount,
    chartsCount,
    lowConfidence: typeof confidence === "number" ? confidence < LOW_CONFIDENCE_THRESHOLD : false,
    lowEvidence: evidenceCount < 1,
  };
}

function evidencePreview(item: PupperfishEvidenceItem): string {
  if (item.kind === "log") {
    return `${item.dateText} ${item.timeText}\n${item.activity}\n${item.outcome}`;
  }

  if (item.kind === "summary") {
    return `${item.summaryDate} ${item.scope}\n${item.summaryText}`;
  }

  if (item.kind === "memory") {
    return `${item.memoryType}\n${item.memoryText}`;
  }

  return `${item.chartLabel}\n${item.symbol ?? ""} ${item.timeframe ?? ""}`;
}

export type PupperfishChatShellProps = {
  client: PupperfishClient;
  branding: PupperfishBranding;
  signalStore?: PupperfishUiSignalStore;
  composerSubmitMode?: PupperfishComposerSubmitMode;
  promptHistoryEnabled?: boolean;
  promptHistoryStorageKey?: string;
  promptHistoryLimit?: number;
};

export function PupperfishChatShell({
  client,
  branding,
  signalStore,
  composerSubmitMode = "enter-to-submit",
  promptHistoryEnabled = true,
  promptHistoryStorageKey = DEFAULT_PROMPT_HISTORY_STORAGE_KEY,
  promptHistoryLimit = DEFAULT_PROMPT_HISTORY_LIMIT,
}: PupperfishChatShellProps) {
  const [query, setQuery] = useState("");
  const [promptHistory, setPromptHistory] = useState<string[]>(() =>
    promptHistoryEnabled
      ? readPromptHistory(promptHistoryStorageKey, clampPromptHistoryLimit(promptHistoryLimit))
      : [],
  );
  const [historyIndex, setHistoryIndex] = useState<number | null>(null);
  const [draftBeforeHistoryNav, setDraftBeforeHistoryNav] = useState<string | null>(null);
  const [mode, setMode] = useState<PupperfishPlannerMode>("hybrid");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<PupperfishUiStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [activeSelection, setActiveSelection] = useState<ActiveMessageSelection>({ messageId: null, tab: "evidence" });
  const [savedAnswers, setSavedAnswers] = useState<ChatMessage[]>([]);
  const [copyStateById, setCopyStateById] = useState<Record<string, "idle" | "done" | "error">>({});
  const [assumptionsOpenById, setAssumptionsOpenById] = useState<Record<string, boolean>>({});
  const [isRailOpen, setIsRailOpen] = useState(true);
  const [isMobileRail, setIsMobileRail] = useState(false);
  const [uploadEntryInput, setUploadEntryInput] = useState("");
  const [uploadEntryUid, setUploadEntryUid] = useState<string | null>(null);
  const [uploadEntryLoading, setUploadEntryLoading] = useState(false);
  const [uploadEntryError, setUploadEntryError] = useState<string | null>(null);
  const [uploadEntryMeta, setUploadEntryMeta] = useState<Awaited<ReturnType<PupperfishClient["getLog"]>> | null>(null);
  const [chartViewerIndex, setChartViewerIndex] = useState(0);
  const [chartViewerOpen, setChartViewerOpen] = useState(false);
  const [pendingAssistant, setPendingAssistant] = useState<PendingAssistantState>(() => createIdlePendingAssistantState());
  const pendingRequestIdRef = useRef<string | null>(null);
  const pendingPlannerModeRef = useRef<PupperfishPlannerMode | null>(null);
  const pendingStartAtRef = useRef(0);
  const pendingPhaseRef = useRef<QueryPhase>("idle");
  const pendingPhaseTimeoutsRef = useRef<number[]>([]);
  const pendingElapsedIntervalRef = useRef<number | null>(null);
  const normalizedPromptHistoryLimit = useMemo(() => clampPromptHistoryLimit(promptHistoryLimit), [promptHistoryLimit]);

  useEffect(() => {
    if (!promptHistoryEnabled) {
      setPromptHistory([]);
      setHistoryIndex(null);
      setDraftBeforeHistoryNav(null);
      return;
    }

    setPromptHistory(readPromptHistory(promptHistoryStorageKey, normalizedPromptHistoryLimit));
    setHistoryIndex(null);
    setDraftBeforeHistoryNav(null);
  }, [promptHistoryEnabled, promptHistoryStorageKey, normalizedPromptHistoryLimit]);

  useEffect(() => {
    if (!promptHistoryEnabled) {
      return;
    }

    writePromptHistory(promptHistoryStorageKey, promptHistory.slice(0, normalizedPromptHistoryLimit));
  }, [promptHistory, promptHistoryEnabled, promptHistoryStorageKey, normalizedPromptHistoryLimit]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const mediaQuery = window.matchMedia("(max-width: 980px)");
    const sync = () => setIsMobileRail(mediaQuery.matches);

    sync();

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", sync);
      return () => mediaQuery.removeEventListener("change", sync);
    }

    mediaQuery.addListener(sync);
    return () => mediaQuery.removeListener(sync);
  }, []);

  useEffect(() => {
    if (isMobileRail) {
      setIsRailOpen(false);
    }
  }, [isMobileRail]);

  const assistantMessages = useMemo(() => messages.filter((item) => item.role === "assistant"), [messages]);

  const activeAssistant = useMemo(() => {
    if (assistantMessages.length < 1) {
      return null;
    }

    if (activeSelection.messageId) {
      const matched = assistantMessages.find((item) => item.id === activeSelection.messageId);
      if (matched) {
        return matched;
      }
    }

    return assistantMessages[assistantMessages.length - 1] ?? null;
  }, [assistantMessages, activeSelection.messageId]);

  const activeEvidence = useMemo(() => activeAssistant?.evidence ?? [], [activeAssistant]);
  const activeCharts = useMemo(() => activeEvidence.filter((item) => item.kind === "image"), [activeEvidence]);
  const activeChartViewerItems = useMemo(
    () =>
      activeCharts.map((item) => ({
        id: item.id,
        imageUid: item.imageUid,
        fileUrl: item.fileUrl,
        chartLabel: item.chartLabel,
        dateText: item.dateText,
        timeText: item.timeText,
        symbol: item.symbol,
        timeframe: item.timeframe,
        note: item.note,
        fileName: item.fileName,
      })),
    [activeCharts],
  );
  const activeRenderMeta = activeAssistant?.renderMeta ?? null;
  const activeEvidenceCount = activeRenderMeta?.evidenceCount ?? 0;
  const activeChartsCount = activeRenderMeta?.chartsCount ?? 0;
  const activeConfidence = activeRenderMeta?.confidence ?? null;
  const activeLowEvidence = activeRenderMeta?.lowEvidence ?? false;
  const composerHint = useMemo(
    () =>
      composerSubmitMode === "meta-enter-to-submit"
        ? promptHistoryEnabled
          ? "Ctrl/Cmd+Enter để hỏi · Enter để xuống dòng · ↑/↓ để gọi lại prompt gần đây"
          : "Ctrl/Cmd+Enter để hỏi · Enter để xuống dòng"
        : promptHistoryEnabled
          ? "Enter để hỏi · Shift+Enter để xuống dòng · ↑/↓ để gọi lại prompt gần đây"
          : "Enter để hỏi · Shift+Enter để xuống dòng",
    [composerSubmitMode, promptHistoryEnabled],
  );

  const evidenceLogEntryUids = useMemo(() => {
    const uids = new Set<string>();
    for (const item of activeEvidence) {
      if (item.kind === "log") {
        uids.add(item.entryUid);
      }
    }
    return Array.from(uids);
  }, [activeEvidence]);

  useEffect(() => {
    signalStore?.write({
      status,
      confidence: activeConfidence,
      lowEvidence: activeLowEvidence,
      evidenceCount: activeEvidenceCount,
      chartsCount: activeChartsCount,
      hasError: Boolean(error) || pendingAssistant.phase === "error",
      mode,
      pendingVisible: pendingAssistant.visible,
      pendingPhase: pendingAssistant.visible || pendingAssistant.phase === "error" ? pendingAssistant.phase : null,
      pendingPlannerMode: pendingAssistant.visible ? pendingAssistant.plannerMode : null,
      pendingMessage: pendingAssistant.visible || pendingAssistant.phase === "error" ? pendingAssistant.message : null,
      pendingElapsedSec:
        pendingAssistant.visible || pendingAssistant.phase === "error" ? pendingAssistant.elapsedSec : null,
      pendingSlow: pendingAssistant.isSlow,
    });
  }, [signalStore, status, activeConfidence, activeLowEvidence, activeEvidenceCount, activeChartsCount, error, mode, pendingAssistant]);

  const clearPendingTimers = useCallback(() => {
    for (const timeoutId of pendingPhaseTimeoutsRef.current) {
      window.clearTimeout(timeoutId);
    }
    pendingPhaseTimeoutsRef.current = [];

    if (pendingElapsedIntervalRef.current !== null) {
      window.clearInterval(pendingElapsedIntervalRef.current);
      pendingElapsedIntervalRef.current = null;
    }
  }, []);

  const syncPendingAssistant = useCallback(
    (requestId: string, phase: QueryPhase, errorMessage?: string | null) => {
      if (pendingRequestIdRef.current !== requestId) {
        return;
      }

      pendingPhaseRef.current = phase;
      setPendingAssistant(
        buildPendingAssistantState(requestId, phase, pendingPlannerModeRef.current, pendingStartAtRef.current, errorMessage),
      );
    },
    [],
  );

  const resetPendingAssistant = useCallback(() => {
    pendingRequestIdRef.current = null;
    pendingPlannerModeRef.current = null;
    pendingStartAtRef.current = 0;
    pendingPhaseRef.current = "idle";
    clearPendingTimers();
    setPendingAssistant(createIdlePendingAssistantState());
  }, [clearPendingTimers]);

  const beginPendingAssistant = useCallback(
    (requestId: string, plannerMode: PupperfishPlannerMode) => {
      clearPendingTimers();
      pendingRequestIdRef.current = requestId;
      pendingPlannerModeRef.current = plannerMode;
      pendingStartAtRef.current = Date.now();
      pendingPhaseRef.current = "submitting";
      setPendingAssistant(buildPendingAssistantState(requestId, "submitting", plannerMode, pendingStartAtRef.current));

      pendingPhaseTimeoutsRef.current = PHASE_TRANSITIONS.map(({ phase, delayMs }) =>
        window.setTimeout(() => {
          syncPendingAssistant(requestId, phase);
        }, delayMs),
      );

      pendingElapsedIntervalRef.current = window.setInterval(() => {
        syncPendingAssistant(requestId, pendingPhaseRef.current);
      }, 1000);
    },
    [clearPendingTimers, syncPendingAssistant],
  );

  useEffect(() => () => clearPendingTimers(), [clearPendingTimers]);

  useEffect(() => {
    setChartViewerOpen(false);
    setChartViewerIndex(0);
  }, [activeAssistant?.id]);

  const commitPromptToHistory = useCallback(
    (prompt: string) => {
      if (!promptHistoryEnabled) {
        return;
      }

      const normalizedPrompt = prompt.trim();
      if (!normalizedPrompt) {
        return;
      }

      setPromptHistory((previous) => {
        if (previous[0] === normalizedPrompt) {
          return previous;
        }

        return [normalizedPrompt, ...previous].slice(0, normalizedPromptHistoryLimit);
      });
      setHistoryIndex(null);
      setDraftBeforeHistoryNav(null);
    },
    [normalizedPromptHistoryLimit, promptHistoryEnabled],
  );

  const setActiveTab = useCallback((tab: PupperfishEvidenceTab) => {
    setActiveSelection((previous) => ({
      ...previous,
      tab,
    }));
  }, []);

  const activateAssistantMessage = useCallback(
    (messageId: string) => {
      setActiveSelection((previous) => ({
        ...previous,
        messageId,
      }));
      if (!isMobileRail) {
        setIsRailOpen(true);
      }
    },
    [isMobileRail],
  );

  async function copyText(messageId: string, text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      setCopyStateById((previous) => ({
        ...previous,
        [messageId]: "done",
      }));
    } catch {
      setCopyStateById((previous) => ({
        ...previous,
        [messageId]: "error",
      }));
    } finally {
      window.setTimeout(() => {
        setCopyStateById((previous) => ({
          ...previous,
          [messageId]: "idle",
        }));
      }, 1000);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const normalized = query.trim();
    if (!normalized || busy) {
      return;
    }
    const requestId = createClientMessageId();

    const userMessage: ChatMessage = {
      id: createClientMessageId(),
      role: "user",
      text: normalized,
      createdAt: nowIso(),
      assumptions: [],
      evidence: [],
    };

    setMessages((previous) => [...previous, userMessage]);
    commitPromptToHistory(normalized);
    setQuery("");
    setBusy(true);
    setError(null);
    setStatus("thinking");
    beginPendingAssistant(requestId, mode);

    try {
      const result = await client.retrieve({
        query: normalized,
        mode,
        topK: 10,
      });

      const renderMeta = buildAssistantRenderMeta(result);
      const assistantMessage: ChatMessage = {
        id: createClientMessageId(),
        role: "assistant",
        text: result.answer,
        createdAt: nowIso(),
        confidence: renderMeta.confidence ?? undefined,
        assumptions: renderMeta.assumptions,
        evidence: result.evidence,
        renderMeta,
        requestUid: result.requestUid,
      };

      setMessages((previous) => [...previous, assistantMessage]);
      setActiveSelection((previous) => {
        const shouldAutoSwitchTab = previous.tab === "evidence" || previous.tab === "charts";
        return {
          messageId: assistantMessage.id,
          tab: shouldAutoSwitchTab ? (renderMeta.chartsCount > 0 ? "charts" : "evidence") : previous.tab,
        };
      });

      if ((renderMeta.evidenceCount > 0 || renderMeta.chartsCount > 0) && !isMobileRail) {
        setIsRailOpen(true);
      }

      resetPendingAssistant();
      const nextStatus: PupperfishUiStatus = renderMeta.lowConfidence ? "caution" : "answering";
      setStatus(nextStatus);
      window.setTimeout(() => {
        setStatus((previous) => (previous === nextStatus ? "idle" : previous));
      }, 900);
    } catch (cause) {
      const errorMessage = cause instanceof Error ? cause.message : "Lỗi truy vấn Pupperfish.";
      clearPendingTimers();
      syncPendingAssistant(requestId, "error", "Có lỗi khi xử lý truy vấn. Bạn thử gửi lại câu hỏi nhé.");
      setStatus("caution");
      setError(errorMessage);
    } finally {
      setBusy(false);
    }
  }

  const handleComposerKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      const nativeKeyboardEvent = event.nativeEvent as globalThis.KeyboardEvent & { isComposing?: boolean };
      const isComposing = Boolean(nativeKeyboardEvent.isComposing);

      if (promptHistoryEnabled && !busy && !isComposing && promptHistory.length > 0) {
        if (event.key === "ArrowUp" && isTextareaCaretAtStart(event.currentTarget)) {
          event.preventDefault();
          setHistoryIndex((previous) => {
            if (previous === null) {
              setDraftBeforeHistoryNav(query);
              setQuery(promptHistory[0] ?? "");
              return 0;
            }

            const nextIndex = Math.min(previous + 1, promptHistory.length - 1);
            setQuery(promptHistory[nextIndex] ?? "");
            return nextIndex;
          });
          return;
        }

        if (event.key === "ArrowDown" && historyIndex !== null && isTextareaCaretAtEnd(event.currentTarget)) {
          event.preventDefault();

          if (historyIndex <= 0) {
            setHistoryIndex(null);
            setQuery(draftBeforeHistoryNav ?? "");
            return;
          }

          const nextIndex = historyIndex - 1;
          setHistoryIndex(nextIndex);
          setQuery(promptHistory[nextIndex] ?? "");
          return;
        }
      }

      if (
        !shouldSubmitComposerKey({
          submitMode: composerSubmitMode,
          key: event.key,
          shiftKey: event.shiftKey,
          ctrlKey: event.ctrlKey,
          metaKey: event.metaKey,
          altKey: event.altKey,
          isComposing,
          hasContent: Boolean(query.trim()),
          busy,
        })
      ) {
        return;
      }

      event.preventDefault();
      requestFormSubmit(event.currentTarget.form);
    },
    [busy, composerSubmitMode, draftBeforeHistoryNav, historyIndex, promptHistory, promptHistoryEnabled, query],
  );

  async function loadUploadEntryDetail(entryUid: string): Promise<void> {
    const normalized = entryUid.trim();
    if (!normalized) {
      setUploadEntryMeta(null);
      setUploadEntryError("Hãy nhập entryUid hợp lệ.");
      return;
    }

    setUploadEntryLoading(true);
    setUploadEntryError(null);

    try {
      const detail = await client.getLog(normalized);
      setUploadEntryMeta(detail);
      setUploadEntryUid(normalized);
    } catch (cause) {
      setUploadEntryMeta(null);
      setUploadEntryUid(null);
      setUploadEntryError(cause instanceof Error ? cause.message : "Không tải được log detail theo entryUid.");
    } finally {
      setUploadEntryLoading(false);
    }
  }

  const assistantLabel = branding.assistantTitle ?? `🐡 ${branding.assistantName}`;
  const headline = branding.headline ?? "Living UI / Status Instrument";
  const pendingSlowCopy = resolveSlowCopy(pendingAssistant.elapsedSec);
  const subtitle =
    branding.subtitle ??
    (pendingAssistant.visible
      ? `${pendingAssistant.message} · ⏱ ${formatElapsedDuration(pendingAssistant.elapsedSec)}${
          pendingAssistant.plannerMode ? ` · ${MODE_LABELS[pendingAssistant.plannerMode]}` : ""
        }`
      : `Mode hiện tại: ${mode}. Trạng thái: ${formatPupperfishStatusLabel(status)}.`);
  const productLabel = branding.productLabel ?? `${branding.assistantName} (Zen Pro)`;
  const homeHref = branding.homeHref ?? "/";
  const homeCta = branding.homeCta ?? "Về ứng dụng";

  return (
    <main className="zen-pupperfish-page zen-pupperfish-page--dark">
      <header className="zen-pupperfish-page__head">
        <div>
          <p className="zen-kicker">
            <span className="zen-pf-inline">
              <span className="zen-pf-emoji zen-pf-emoji--prefix" aria-hidden="true">
                🐡
              </span>
              <span>{productLabel}</span>
            </span>
          </p>
          <h1>{headline}</h1>
          <p className="zen-muted">{subtitle}</p>
        </div>
        <a className="zen-btn zen-btn--secondary" href={homeHref}>
          {homeCta}
        </a>
      </header>

      <section
        className={`zen-pupperfish-layout ${isRailOpen ? "zen-pupperfish-layout--rail-open" : "zen-pupperfish-layout--rail-closed"}`}
      >
        <article className="zen-pupperfish-chat">
          <div className="zen-pf-chat-head">
            <PupperfishDock
              status={status}
              confidence={activeConfidence}
              lowEvidence={activeLowEvidence}
              label={assistantLabel}
              className="zen-pf-chat-head__dock"
            />
            <div className="zen-pf-chat-head__actions">
              <button
                type="button"
                className="zen-chip"
                onClick={() => setIsRailOpen((previous) => !previous)}
                aria-label={isRailOpen ? "Ẩn Evidence Rail" : "Hiện Evidence Rail"}
              >
                {isRailOpen ? "Ẩn Rail" : "Hiện Rail"}
              </button>
            </div>
          </div>

          <div className="zen-pupperfish-chat__messages" aria-live="polite">
            {messages.length < 1 ? <p className="zen-muted">Bắt đầu bằng một câu hỏi về log, summary, memory hoặc chart.</p> : null}

            {messages.map((message) => {
              const isAssistant = message.role === "assistant";
              const isActiveAssistant = isAssistant && message.id === activeAssistant?.id;
              const renderMeta = message.renderMeta;
              const messageConfidence = renderMeta?.confidence ?? null;
              const hasEvidence = Boolean(renderMeta && renderMeta.evidenceCount > 0);
              const chartCount = renderMeta?.chartsCount ?? 0;
              const sourceCount = renderMeta?.evidenceCount ?? 0;
              const confidenceTier = resolveConfidenceTier(messageConfidence);
              const assumptionsOpen = Boolean(assumptionsOpenById[message.id]);
              const copyState = copyStateById[message.id] ?? "idle";

              return (
                <article
                  key={message.id}
                  className={[
                    "zen-pf-message",
                    isAssistant ? "zen-pf-message--assistant" : "zen-pf-message--user",
                    isActiveAssistant ? "zen-pf-message--active" : "",
                    hasEvidence ? "zen-pf-message--with-evidence" : "",
                    renderMeta?.lowEvidence ? "zen-pf-message--low-evidence" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  onClick={() => {
                    if (isAssistant) {
                      activateAssistantMessage(message.id);
                    }
                  }}
                >
                  <p className="zen-pf-message__meta">
                    <strong>
                      {isAssistant ? (
                        <span className="zen-pf-inline">
                          <span className="zen-pf-emoji zen-pf-emoji--prefix" aria-hidden="true">
                            🐡
                          </span>
                          <span>{branding.assistantName}</span>
                        </span>
                      ) : (
                        "Bạn"
                      )}
                    </strong>
                    <span>{new Date(message.createdAt).toLocaleTimeString("vi-VN")}</span>
                    {isAssistant && typeof messageConfidence === "number" ? (
                      <span className={`zen-pf-confidence zen-pf-confidence--${confidenceTier}`}>
                        Confidence {(messageConfidence * 100).toFixed(0)}%
                      </span>
                    ) : null}
                    {renderMeta?.lowEvidence ? <span className="zen-pf-low-evidence-chip">Low evidence</span> : null}
                  </p>
                  <pre className="zen-pf-message__text">{message.text}</pre>

                  {isAssistant && message.assumptions.length > 0 ? (
                    <div className="zen-pf-assumptions">
                      <button
                        type="button"
                        className="zen-chip"
                        onClick={(event) => {
                          event.stopPropagation();
                          setAssumptionsOpenById((previous) => ({
                            ...previous,
                            [message.id]: !previous[message.id],
                          }));
                        }}
                      >
                        Assumptions {message.assumptions.length}
                      </button>
                      {assumptionsOpen ? (
                        <div className="zen-pf-assumptions__list">
                          {message.assumptions.map((item) => (
                            <span key={`${message.id}-${item}`} className="zen-chip zen-chip--ghost">
                              {item}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  {isAssistant ? (
                    <div className="zen-pf-message__actions">
                      <button
                        type="button"
                        className="zen-chip"
                        onClick={(event) => {
                          event.stopPropagation();
                          activateAssistantMessage(message.id);
                          setActiveTab("evidence");
                          setIsRailOpen(true);
                        }}
                      >
                        Sources {sourceCount}
                      </button>
                      <button
                        type="button"
                        className="zen-chip"
                        onClick={(event) => {
                          event.stopPropagation();
                          activateAssistantMessage(message.id);
                          setActiveTab("charts");
                          setIsRailOpen(true);
                        }}
                        disabled={chartCount < 1}
                      >
                        Charts {chartCount}
                      </button>
                      <button
                        type="button"
                        className="zen-chip"
                        onClick={(event) => {
                          event.stopPropagation();
                          setSavedAnswers((previous) =>
                            previous.some((item) => item.id === message.id) ? previous : [message, ...previous],
                          );
                        }}
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        className="zen-chip"
                        onClick={(event) => {
                          event.stopPropagation();
                          void copyText(message.id, message.text);
                        }}
                      >
                        {copyState === "done" ? "Đã copy" : copyState === "error" ? "Copy lỗi" : "Copy"}
                      </button>
                    </div>
                  ) : null}
                </article>
              );
            })}

            {pendingAssistant.visible ? (
              <article
                className={[
                  "zen-pf-message",
                  "zen-pf-message--assistant",
                  "zen-pf-message--pending",
                  pendingAssistant.phase === "error" ? "zen-pf-message--pending-error" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                role={pendingAssistant.phase === "error" ? "alert" : undefined}
              >
                <p className="zen-pf-message__meta">
                  <strong>
                    <span className="zen-pf-inline">
                      <span className="zen-pf-emoji zen-pf-emoji--prefix" aria-hidden="true">
                        🐡
                      </span>
                      <span>{branding.assistantName}</span>
                    </span>
                  </strong>
                  <span className="zen-pf-pending__phase">{pendingAssistant.phase.toUpperCase()}</span>
                  {pendingAssistant.plannerMode ? (
                    <span className="zen-pf-pending__mode">{MODE_LABELS[pendingAssistant.plannerMode]}</span>
                  ) : null}
                </p>
                <div className="zen-pf-pending">
                  <p className="zen-pf-pending__header">{pendingAssistant.header}</p>
                  <p className="zen-pf-pending__body">{pendingAssistant.message}</p>
                  {pendingSlowCopy ? <p className="zen-pf-pending__slow">{pendingSlowCopy}</p> : null}
                  <p className="zen-pf-pending__timer">{`⏱ Đã xử lý: ${formatElapsedDuration(pendingAssistant.elapsedSec)}`}</p>
                </div>
              </article>
            ) : null}
          </div>

          <form className="zen-pupperfish-chat__composer" onSubmit={handleSubmit}>
            <label htmlFor="pupperfish-mode">
              <span>Planner mode</span>
              <select
                id="pupperfish-mode"
                className="zen-select"
                value={mode}
                onChange={(event) => setMode(event.target.value as PupperfishPlannerMode)}
                disabled={busy}
              >
                {MODE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label htmlFor="pupperfish-query" className="zen-pf-composer__query">
              <span>Câu hỏi</span>
              <textarea
                id="pupperfish-query"
                className="zen-input"
                rows={3}
                value={query}
                aria-describedby="pupperfish-query-hint"
                enterKeyHint={composerSubmitMode === "enter-to-submit" ? "send" : "enter"}
                onChange={(event) => {
                  const nextValue = event.target.value;
                  if (historyIndex !== null) {
                    setHistoryIndex(null);
                  }
                  setQuery(nextValue);
                  if (!busy) {
                    setStatus(nextValue.trim() ? "listening" : "idle");
                  }
                }}
                onKeyDown={handleComposerKeyDown}
                placeholder="Ví dụ: Tóm tắt các log NewYork hôm nay và điểm cần chú ý"
                disabled={busy}
              />
              <p id="pupperfish-query-hint" className="zen-helper-text">
                {composerHint}
              </p>
            </label>

            <button type="submit" className="zen-btn" disabled={busy || !query.trim()} aria-label={`Hỏi ${branding.assistantName}`}>
              {busy ? (
                "Đang truy vấn..."
              ) : (
                <span className="zen-pf-inline">
                  <span>{`Hỏi ${branding.assistantName}`}</span>
                  <span className="zen-pf-emoji zen-pf-emoji--suffix" aria-hidden="true">
                    🐡
                  </span>
                </span>
              )}
            </button>
          </form>

          {error && pendingAssistant.phase !== "error" ? <p className="zen-inline-error">{error}</p> : null}
        </article>

        {isMobileRail && isRailOpen ? (
          <button
            type="button"
            className="zen-pf-rail-backdrop"
            onClick={() => setIsRailOpen(false)}
            aria-label="Đóng Evidence Rail"
          />
        ) : null}

        <aside
          className={[
            "zen-pupperfish-rail",
            isRailOpen ? "zen-pupperfish-rail--open" : "zen-pupperfish-rail--closed",
            isMobileRail ? "zen-pupperfish-rail--sheet" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          aria-label="Evidence rail"
        >
          <div className="zen-pf-rail__head">
            <div>
              <p className="zen-kicker">Evidence Rail</p>
              <p className="zen-muted">
                {activeAssistant
                  ? `Message ${new Date(activeAssistant.createdAt).toLocaleTimeString("vi-VN")}`
                  : "Chưa có assistant message active."}
              </p>
            </div>
            {isMobileRail ? (
              <button type="button" className="zen-chip" onClick={() => setIsRailOpen(false)}>
                Đóng
              </button>
            ) : null}
          </div>

          <div className="zen-pf-tabs" role="tablist" aria-label="Evidence tabs">
            {(["evidence", "charts", "uploads", "saved"] as PupperfishEvidenceTab[]).map((tab) => (
              <button
                key={tab}
                type="button"
                className={`zen-pf-tab${activeSelection.tab === tab ? " is-active" : ""}`}
                onClick={() => setActiveTab(tab)}
                role="tab"
                aria-selected={activeSelection.tab === tab}
              >
                {tab === "evidence" ? "Evidence" : tab === "charts" ? "Charts" : tab === "uploads" ? "Uploads" : "Saved"}
              </button>
            ))}
          </div>

          {activeSelection.tab === "evidence" ? (
            <div className="zen-pf-rail-list">
              {activeAssistant === null ? (
                <p className="zen-muted">Chọn hoặc tạo assistant message để xem evidence.</p>
              ) : activeEvidence.length < 1 ? (
                <p className="zen-muted">Message này chưa có evidence.</p>
              ) : (
                activeEvidence.map((item) => (
                  <article key={`${activeAssistant.id}-${item.kind}-${item.id}`} className="zen-pf-evidence-item">
                    <p className="zen-pf-evidence-item__head">
                      <strong>{item.kind}</strong>
                      <span>{(item.score * 100).toFixed(0)}%</span>
                    </p>
                    <pre>{evidencePreview(item)}</pre>
                    {item.kind === "log" ? (
                      <div className="zen-pf-evidence-item__actions">
                        <button
                          type="button"
                          className="zen-chip"
                          onClick={() => {
                            setUploadEntryInput(item.entryUid);
                            void loadUploadEntryDetail(item.entryUid);
                            setActiveTab("uploads");
                            if (isMobileRail) {
                              setIsRailOpen(true);
                            }
                          }}
                        >
                          Upload chart
                        </button>
                      </div>
                    ) : null}
                  </article>
                ))
              )}
            </div>
          ) : null}

          {activeSelection.tab === "charts" ? (
            <div className="zen-pf-rail-list">
              {activeAssistant === null ? (
                <p className="zen-muted">Chưa có assistant message để xem charts.</p>
              ) : activeCharts.length < 1 ? (
                <p className="zen-muted">Message này chưa có charts trong evidence.</p>
              ) : (
                activeCharts.map((item, index) => (
                  <article key={`chart-${activeAssistant.id}-${item.id}`} className="zen-pf-evidence-item">
                    <p className="zen-pf-evidence-item__head">
                      <strong>{item.chartLabel}</strong>
                      <span>{(item.score * 100).toFixed(0)}%</span>
                    </p>
                    {item.fileUrl ? (
                      <button
                        type="button"
                        className="zen-pf-chart-preview-button"
                        onClick={() => {
                          setChartViewerIndex(index);
                          setChartViewerOpen(true);
                        }}
                        aria-label={`Mở chart ${item.chartLabel}`}
                      >
                        <img src={item.fileUrl} alt={item.chartLabel} className="zen-pf-chart-preview" loading="lazy" />
                      </button>
                    ) : (
                      <p className="zen-muted">Không có URL ảnh.</p>
                    )}
                  </article>
                ))
              )}
            </div>
          ) : null}

          {activeSelection.tab === "uploads" ? (
            <div className="zen-pf-rail-list">
              <form
                className="zen-pf-upload-entry-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  void loadUploadEntryDetail(uploadEntryInput);
                }}
              >
                <label htmlFor="pupperfish-upload-entry-uid">
                  <span>entryUid</span>
                  <input
                    id="pupperfish-upload-entry-uid"
                    className="zen-input zen-input--compact"
                    value={uploadEntryInput}
                    onChange={(event) => {
                      setUploadEntryInput(event.target.value);
                      setUploadEntryError(null);
                    }}
                    placeholder="Nhập entryUid của log/trade"
                  />
                </label>
                <button type="submit" className="zen-chip" disabled={uploadEntryLoading || !uploadEntryInput.trim()}>
                  {uploadEntryLoading ? "Đang tải..." : "Load entry"}
                </button>
              </form>

              {evidenceLogEntryUids.length > 0 ? (
                <div className="zen-pf-upload-entry-chips">
                  {evidenceLogEntryUids.map((entryUid) => (
                    <button
                      key={entryUid}
                      type="button"
                      className="zen-chip"
                      onClick={() => {
                        setUploadEntryInput(entryUid);
                        void loadUploadEntryDetail(entryUid);
                      }}
                    >
                      {entryUid}
                    </button>
                  ))}
                </div>
              ) : null}

              {uploadEntryError ? <p className="zen-inline-error">{uploadEntryError}</p> : null}
              {uploadEntryMeta ? (
                <article className="zen-pf-evidence-item">
                  <p className="zen-pf-evidence-item__head">
                    <strong>Log detail</strong>
                    <span>
                      {uploadEntryMeta.dateText} {uploadEntryMeta.timeText}
                    </span>
                  </p>
                  <pre>{`${uploadEntryMeta.activity}\n${uploadEntryMeta.outcome}`}</pre>
                </article>
              ) : null}

              <TradeImageGalleryManager client={client} entryUid={uploadEntryUid} title="Uploads" />
            </div>
          ) : null}

          {activeSelection.tab === "saved" ? (
            <div className="zen-pf-rail-list">
              {savedAnswers.length < 1 ? (
                <p className="zen-muted">Chưa lưu câu trả lời nào.</p>
              ) : (
                savedAnswers.map((message) => (
                  <article key={`saved-${message.id}`} className="zen-pf-evidence-item">
                    <p className="zen-pf-evidence-item__head">
                      <strong>Saved</strong>
                      <span>{new Date(message.createdAt).toLocaleString("vi-VN")}</span>
                    </p>
                    <pre>{message.text}</pre>
                  </article>
                ))
              )}
            </div>
          ) : null}
        </aside>
      </section>

      <PupperfishChartViewer
        items={activeChartViewerItems}
        activeIndex={chartViewerIndex}
        open={chartViewerOpen}
        onClose={() => setChartViewerOpen(false)}
        onActiveIndexChange={setChartViewerIndex}
      />
    </main>
  );
}
