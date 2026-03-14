"use client";
/* eslint-disable @next/next/no-img-element */

import {
  ChangeEvent,
  FormEvent,
  KeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { PupperfishTradeImageItem, PupperfishUpdateTradeImagePayload } from "@tungpastry/pupperfish-framework";

import { PupperfishChartViewer } from "./PupperfishChartViewer.js";
import {
  buildChartComboboxSuggestions,
  buildChartFieldWarning,
  buildNoteSuggestions,
  CHART_ROLES,
  extractRoleFromChartLabel,
  generateChartLabel,
  groupLabelForSuggestion,
  isCanonicalChartLabel,
  normalizeChartRoleInput,
  normalizeChartSymbol,
  normalizeChartTimeframe,
  type ChartRole,
  type ChartSuggestionItem,
} from "./chartFormAutocomplete.js";
import type { PupperfishClient } from "./types.js";

type TradeImageGalleryManagerProps = {
  client: PupperfishClient;
  entryUid: string | null;
  title?: string;
  compact?: boolean;
};

type ChartDraftBase = {
  chartLabel: string;
  symbol: string;
  timeframe: string;
  role: string;
  note: string;
  chartLabelManuallyEdited: boolean;
};

type UploadDraft = ChartDraftBase & {
  file: File | null;
};

type MetadataDraft = ChartDraftBase & {
  imageUid: string;
  imageSlot: string;
};

type UploadStatus = "idle" | "uploading" | "success" | "error";

type NoticeTone = "success" | "error";
type StatusVariant = NoticeTone | "progress";

type InlineNotice = {
  tone: NoticeTone;
  message: string;
};

type ScopedNotice = InlineNotice & {
  imageUid: string;
};

type ChartDraftField = "symbol" | "timeframe" | "role" | "chartLabel" | "note";
type AutocompleteTarget =
  | "upload-symbol"
  | "upload-timeframe"
  | "upload-role"
  | "upload-note"
  | "edit-symbol"
  | "edit-timeframe"
  | "edit-role"
  | "edit-note";

type FocusSurface = "upload" | "edit";

type RenderFieldArgs = {
  surface: FocusSurface;
  field: "symbol" | "timeframe" | "role";
  id: string;
  label: string;
  value: string;
  placeholder: string;
  disabled: boolean;
};

const DEFAULT_ROLE: ChartRole = CHART_ROLES[0];
const DEFAULT_UPLOAD_DRAFT: UploadDraft = {
  file: null,
  chartLabel: "",
  symbol: "",
  timeframe: "",
  role: DEFAULT_ROLE,
  note: "",
  chartLabelManuallyEdited: false,
};

const MAX_IMAGE_FILE_BYTES = 10 * 1024 * 1024;
const UPLOAD_SUCCESS_TIMEOUT_MS = 4500;
const RECENT_NOTES_LIMIT = 20;

function normalizeRequestFailureMessage(cause: unknown, fallback: string): string {
  if (!(cause instanceof Error)) {
    return fallback;
  }

  const normalized = cause.message.trim();
  if (!normalized) {
    return fallback;
  }

  if (normalized === "Failed to fetch" || normalized.includes("fetch")) {
    return "Không thể kết nối tới API upload chart.";
  }

  if (normalized === "API không trả JSON hợp lệ.") {
    return "API trả dữ liệu không hợp lệ. Vui lòng thử lại.";
  }

  return normalized;
}

function sortImages(items: PupperfishTradeImageItem[]): PupperfishTradeImageItem[] {
  return [...items].sort((left, right) => {
    if (left.imageSlot !== right.imageSlot) {
      return left.imageSlot - right.imageSlot;
    }

    return new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
  });
}

function imageUrlFor(item: PupperfishTradeImageItem): string {
  return item.fileUrl ?? "";
}

function buildDraftChartLabel(symbol: string, timeframe: string, role: string): string {
  return generateChartLabel(symbol, timeframe, role);
}

function updateChartDraft<T extends ChartDraftBase>(draft: T, field: ChartDraftField, nextValue: string): T {
  if (field === "chartLabel") {
    const standardLabel = buildDraftChartLabel(draft.symbol, draft.timeframe, draft.role);
    return {
      ...draft,
      chartLabel: nextValue,
      chartLabelManuallyEdited: nextValue !== standardLabel,
    };
  }

  if (field === "note") {
    return {
      ...draft,
      note: nextValue,
    };
  }

  const nextDraft = {
    ...draft,
    symbol: field === "symbol" ? normalizeChartSymbol(nextValue) : draft.symbol,
    timeframe: field === "timeframe" ? normalizeChartTimeframe(nextValue) : draft.timeframe,
    role: field === "role" ? normalizeChartRoleInput(nextValue) : draft.role,
  };

  if (nextDraft.chartLabelManuallyEdited) {
    return nextDraft;
  }

  return {
    ...nextDraft,
    chartLabel: buildDraftChartLabel(nextDraft.symbol, nextDraft.timeframe, nextDraft.role),
  };
}

function resetChartDraftLabel<T extends ChartDraftBase>(draft: T): T {
  return {
    ...draft,
    chartLabel: buildDraftChartLabel(draft.symbol, draft.timeframe, draft.role),
    chartLabelManuallyEdited: false,
  };
}

function createMetadataDraft(item: PupperfishTradeImageItem): MetadataDraft {
  const symbol = item.symbol ?? "";
  const timeframe = item.timeframe ?? "";
  const role = extractRoleFromChartLabel(item.chartLabel) ?? DEFAULT_ROLE;

  return {
    imageUid: item.imageUid,
    chartLabel: item.chartLabel,
    symbol,
    timeframe,
    role,
    note: item.note ?? "",
    imageSlot: String(item.imageSlot),
    chartLabelManuallyEdited: !isCanonicalChartLabel(item.chartLabel, symbol, timeframe, role),
  };
}

function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function statusLabelFor(variant: StatusVariant): string {
  if (variant === "success") {
    return "Thành công";
  }

  if (variant === "error") {
    return "Lỗi";
  }

  return "Đang xử lý";
}

function fieldForTarget(target: AutocompleteTarget): ChartDraftField {
  if (target.endsWith("symbol")) {
    return "symbol";
  }
  if (target.endsWith("timeframe")) {
    return "timeframe";
  }
  if (target.endsWith("role")) {
    return "role";
  }
  return "note";
}

function surfaceForTarget(target: AutocompleteTarget): FocusSurface {
  return target.startsWith("upload") ? "upload" : "edit";
}

function helperTextForDraft(draft: ChartDraftBase): string {
  return draft.chartLabelManuallyEdited ? "Custom label" : "Generated from Symbol + Timeframe + Role";
}

function descriptionForSuggestion(item: ChartSuggestionItem): string | null {
  if (item.group === "symbols") {
    return "Symbol chuẩn";
  }
  if (item.group === "timeframes") {
    return "Timeframe chuẩn";
  }
  if (item.group === "roles") {
    return "Role chuẩn";
  }
  return item.summary ?? null;
}

export function TradeImageGalleryManager({
  client,
  entryUid,
  title = "Charts",
  compact = false,
}: TradeImageGalleryManagerProps) {
  const [images, setImages] = useState<PupperfishTradeImageItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [recentNotes, setRecentNotes] = useState<string[]>([]);
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>("idle");
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);
  const [galleryNotice, setGalleryNotice] = useState<InlineNotice | null>(null);
  const [metadataNotice, setMetadataNotice] = useState<ScopedNotice | null>(null);
  const [deleteNotice, setDeleteNotice] = useState<ScopedNotice | null>(null);
  const [uploadDraft, setUploadDraft] = useState<UploadDraft>(DEFAULT_UPLOAD_DRAFT);
  const [editing, setEditing] = useState<MetadataDraft | null>(null);
  const [savingMetadata, setSavingMetadata] = useState(false);
  const [deletingUid, setDeletingUid] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);
  const [highlightedImageUid, setHighlightedImageUid] = useState<string | null>(null);
  const [viewerIndex, setViewerIndex] = useState(0);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [activeAutocompleteTarget, setActiveAutocompleteTarget] = useState<AutocompleteTarget | null>(null);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadSymbolRef = useRef<HTMLInputElement>(null);
  const uploadTimeframeRef = useRef<HTMLInputElement>(null);
  const uploadRoleRef = useRef<HTMLInputElement>(null);
  const uploadChartLabelRef = useRef<HTMLInputElement>(null);
  const uploadNoteRef = useRef<HTMLTextAreaElement>(null);
  const uploadSubmitRef = useRef<HTMLButtonElement>(null);
  const editSymbolRef = useRef<HTMLInputElement>(null);
  const editTimeframeRef = useRef<HTMLInputElement>(null);
  const editRoleRef = useRef<HTMLInputElement>(null);
  const editChartLabelRef = useRef<HTMLInputElement>(null);
  const editImageSlotRef = useRef<HTMLInputElement>(null);
  const editNoteRef = useRef<HTMLTextAreaElement>(null);
  const editSubmitRef = useRef<HTMLButtonElement>(null);
  const manualReloadRequestedRef = useRef(false);
  const imageCardRefs = useRef<Record<string, HTMLElement | null>>({});

  const canLoad = Boolean(entryUid && entryUid.trim());
  const entryValue = (entryUid ?? "").trim();

  const loadRecentNotes = useCallback(async () => {
    try {
      const nextNotes = await client.listRecentChartNotes(RECENT_NOTES_LIMIT);
      setRecentNotes(nextNotes);
    } catch {
      setRecentNotes([]);
    }
  }, [client]);

  useEffect(() => {
    setEditing(null);
    setImages([]);
    setUploadStatus("idle");
    setUploadMessage(null);
    setGalleryNotice(null);
    setMetadataNotice(null);
    setDeleteNotice(null);
    setHighlightedImageUid(null);
    setViewerOpen(false);
    setViewerIndex(0);
    setActiveAutocompleteTarget(null);
    setActiveSuggestionIndex(0);
  }, [entryValue]);

  useEffect(() => {
    if (!canLoad) {
      setRecentNotes([]);
      return;
    }

    void loadRecentNotes();
  }, [canLoad, loadRecentNotes]);

  useEffect(() => {
    if (uploadStatus !== "success" || !uploadMessage) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setUploadStatus("idle");
      setUploadMessage(null);
    }, UPLOAD_SUCCESS_TIMEOUT_MS);

    return () => window.clearTimeout(timeout);
  }, [uploadStatus, uploadMessage]);

  useEffect(() => {
    if (!galleryNotice || galleryNotice.tone !== "success") {
      return;
    }

    const timeout = window.setTimeout(() => {
      setGalleryNotice(null);
    }, 2500);

    return () => window.clearTimeout(timeout);
  }, [galleryNotice]);

  useEffect(() => {
    if (!metadataNotice || metadataNotice.tone !== "success") {
      return;
    }

    const timeout = window.setTimeout(() => {
      setMetadataNotice(null);
    }, 2500);

    return () => window.clearTimeout(timeout);
  }, [metadataNotice]);

  useEffect(() => {
    if (!deleteNotice || deleteNotice.tone !== "success") {
      return;
    }

    const timeout = window.setTimeout(() => {
      setDeleteNotice(null);
    }, 2500);

    return () => window.clearTimeout(timeout);
  }, [deleteNotice]);

  useEffect(() => {
    if (!highlightedImageUid) {
      return;
    }

    const node = imageCardRefs.current[highlightedImageUid];
    if (node) {
      const rect = node.getBoundingClientRect();
      const isVisible = rect.top >= 0 && rect.bottom <= window.innerHeight;
      if (!isVisible) {
        node.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    }

    const timeout = window.setTimeout(() => {
      setHighlightedImageUid(null);
    }, 2000);

    return () => window.clearTimeout(timeout);
  }, [highlightedImageUid]);

  useEffect(() => {
    let active = true;

    const run = async () => {
      if (!canLoad) {
        if (active) {
          setImages([]);
          setLoading(false);
          setGalleryNotice(null);
        }
        return;
      }

      setLoading(true);
      if (!manualReloadRequestedRef.current) {
        setGalleryNotice(null);
      }

      try {
        const rows = await client.listLogImages(entryValue);

        if (!active) {
          return;
        }

        setImages(sortImages(rows));
        if (manualReloadRequestedRef.current) {
          setGalleryNotice({
            tone: "success",
            message: rows.length > 0 ? `Đã tải lại ${rows.length} chart.` : "Đã tải lại gallery charts.",
          });
        }
      } catch (cause) {
        if (!active) {
          return;
        }

        const message = normalizeRequestFailureMessage(cause, "Không tải được gallery charts.");
        setGalleryNotice({
          tone: "error",
          message,
        });
      } finally {
        manualReloadRequestedRef.current = false;
        if (active) {
          setLoading(false);
        }
      }
    };

    void run();

    return () => {
      active = false;
    };
  }, [canLoad, client, entryValue, reloadNonce]);

  const activeSuggestions = useMemo(() => {
    if (!activeAutocompleteTarget) {
      return [];
    }

    switch (activeAutocompleteTarget) {
      case "upload-symbol":
        return buildChartComboboxSuggestions("symbol", uploadDraft.symbol);
      case "upload-timeframe":
        return buildChartComboboxSuggestions("timeframe", uploadDraft.timeframe);
      case "upload-role":
        return buildChartComboboxSuggestions("role", uploadDraft.role);
      case "upload-note":
        return buildNoteSuggestions(uploadDraft.note, recentNotes);
      case "edit-symbol":
        return editing ? buildChartComboboxSuggestions("symbol", editing.symbol) : [];
      case "edit-timeframe":
        return editing ? buildChartComboboxSuggestions("timeframe", editing.timeframe) : [];
      case "edit-role":
        return editing ? buildChartComboboxSuggestions("role", editing.role) : [];
      case "edit-note":
        return editing ? buildNoteSuggestions(editing.note, recentNotes) : [];
      default:
        return [];
    }
  }, [activeAutocompleteTarget, editing, recentNotes, uploadDraft.note, uploadDraft.role, uploadDraft.symbol, uploadDraft.timeframe]);

  useEffect(() => {
    if (activeSuggestions.length < 1) {
      setActiveSuggestionIndex(0);
      return;
    }

    setActiveSuggestionIndex((previous) => Math.min(previous, activeSuggestions.length - 1));
  }, [activeSuggestions]);

  const uploadWarning = buildChartFieldWarning(uploadDraft.symbol, uploadDraft.timeframe, uploadDraft.role);
  const editWarning = editing ? buildChartFieldWarning(editing.symbol, editing.timeframe, editing.role) : null;

  const updateUploadField = <K extends keyof UploadDraft>(field: K, value: UploadDraft[K]) => {
    setUploadDraft((previous) => {
      if (field === "file") {
        return {
          ...previous,
          file: value as UploadDraft["file"],
        };
      }

      return updateChartDraft(previous, field as ChartDraftField, value as string);
    });
    setUploadStatus("idle");
    setUploadMessage(null);
  };

  const updateEditingField = <K extends keyof MetadataDraft>(field: K, value: MetadataDraft[K]) => {
    setEditing((previous) => {
      if (!previous) {
        return previous;
      }

      if (field === "imageUid" || field === "imageSlot") {
        return {
          ...previous,
          [field]: value,
        };
      }

      return updateChartDraft(previous, field as ChartDraftField, value as string);
    });
    setMetadataNotice((previous) => (previous ? null : previous));
  };

  const closeAutocomplete = useCallback(() => {
    setActiveAutocompleteTarget(null);
    setActiveSuggestionIndex(0);
  }, []);

  const openAutocomplete = useCallback((target: AutocompleteTarget) => {
    setActiveAutocompleteTarget(target);
    setActiveSuggestionIndex(0);
  }, []);

  const focusNextField = useCallback((target: AutocompleteTarget) => {
    switch (target) {
      case "upload-symbol":
        uploadTimeframeRef.current?.focus();
        return;
      case "upload-timeframe":
        uploadRoleRef.current?.focus();
        return;
      case "upload-role":
        uploadChartLabelRef.current?.focus();
        return;
      case "upload-note":
        uploadSubmitRef.current?.focus();
        return;
      case "edit-symbol":
        editTimeframeRef.current?.focus();
        return;
      case "edit-timeframe":
        editRoleRef.current?.focus();
        return;
      case "edit-role":
        editChartLabelRef.current?.focus();
        return;
      case "edit-note":
        editSubmitRef.current?.focus();
        return;
      default:
        return;
    }
  }, []);

  const acceptSuggestion = useCallback((target: AutocompleteTarget, suggestion: ChartSuggestionItem, moveFocus = false) => {
    const field = fieldForTarget(target);
    if (surfaceForTarget(target) === "upload") {
      if (field === "note") {
        updateUploadField("note", suggestion.value);
      } else {
        updateUploadField(field, suggestion.value);
      }
    } else if (editing) {
      if (field === "note") {
        updateEditingField("note", suggestion.value);
      } else {
        updateEditingField(field, suggestion.value);
      }
    }

    closeAutocomplete();
    if (moveFocus) {
      window.setTimeout(() => {
        focusNextField(target);
      }, 0);
    }
  }, [closeAutocomplete, editing, focusNextField]);

  const handleAutocompleteBlur = useCallback((target: AutocompleteTarget) => {
    window.setTimeout(() => {
      setActiveAutocompleteTarget((previous) => (previous === target ? null : previous));
    }, 120);
  }, []);

  const handleAutocompleteKeyDown = useCallback((target: AutocompleteTarget, event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const isTargetActive = activeAutocompleteTarget === target;
    const suggestions = isTargetActive ? activeSuggestions : [];

    if (event.key === "Escape") {
      if (isTargetActive) {
        event.preventDefault();
        closeAutocomplete();
      }
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!isTargetActive) {
        openAutocomplete(target);
        return;
      }
      if (suggestions.length > 0) {
        setActiveSuggestionIndex((previous) => (previous + 1) % suggestions.length);
      }
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (!isTargetActive) {
        openAutocomplete(target);
        return;
      }
      if (suggestions.length > 0) {
        setActiveSuggestionIndex((previous) => (previous - 1 + suggestions.length) % suggestions.length);
      }
      return;
    }

    if (event.key === "Tab" && !event.shiftKey && isTargetActive && suggestions.length > 0) {
      event.preventDefault();
      acceptSuggestion(target, suggestions[activeSuggestionIndex] ?? suggestions[0], true);
    }
  }, [acceptSuggestion, activeAutocompleteTarget, activeSuggestionIndex, activeSuggestions, closeAutocomplete, openAutocomplete]);

  const handleUploadFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    if (!file) {
      updateUploadField("file", null);
      return;
    }

    if (!file.type || !file.type.toLowerCase().startsWith("image/")) {
      updateUploadField("file", null);
      setUploadStatus("error");
      setUploadMessage("Chỉ chấp nhận file ảnh (image/*).");
      return;
    }

    if (file.size > MAX_IMAGE_FILE_BYTES) {
      updateUploadField("file", null);
      setUploadStatus("error");
      setUploadMessage("Dung lượng ảnh vượt 10MB.");
      return;
    }

    updateUploadField("file", file);
  };

  const resetUploadDraft = () => {
    setUploadDraft(DEFAULT_UPLOAD_DRAFT);
    closeAutocomplete();
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleUpload = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canLoad || uploadStatus === "uploading") {
      return;
    }

    if (!uploadDraft.file) {
      setUploadStatus("error");
      setUploadMessage("Hãy chọn file ảnh trước khi upload.");
      return;
    }

    if (!uploadDraft.file.type || !uploadDraft.file.type.toLowerCase().startsWith("image/")) {
      setUploadStatus("error");
      setUploadMessage("Chỉ chấp nhận file ảnh (image/*).");
      return;
    }

    if (uploadDraft.file.size > MAX_IMAGE_FILE_BYTES) {
      setUploadStatus("error");
      setUploadMessage("Dung lượng ảnh vượt 10MB.");
      return;
    }

    setUploadStatus("uploading");
    setUploadMessage(`Đang upload ${uploadDraft.file.name}...`);
    setGalleryNotice(null);
    setDeleteNotice(null);
    setMetadataNotice(null);

    try {
      const chartLabel = uploadDraft.chartLabel.trim();
      const symbol = uploadDraft.symbol.trim();
      const timeframe = uploadDraft.timeframe.trim();
      const note = uploadDraft.note.trim();

      const uploaded = await client.uploadLogImage(entryValue, {
        file: uploadDraft.file,
        chartLabel: chartLabel || null,
        symbol: symbol || null,
        timeframe: timeframe || null,
        note: note || null,
      });
      setImages((previous) => sortImages([...previous, uploaded]));
      setUploadStatus("success");
      setUploadMessage(
        `Upload thành công: ${uploaded.chartLabel || uploadDraft.file.name}, slot #${uploaded.imageSlot}.`,
      );
      setHighlightedImageUid(uploaded.imageUid);
      resetUploadDraft();
      void loadRecentNotes();
    } catch (cause) {
      const message = normalizeRequestFailureMessage(cause, "Upload chart thất bại.");
      setUploadStatus("error");
      setUploadMessage(message);
    }
  };

  const handleDelete = async (image: PupperfishTradeImageItem) => {
    if (deletingUid || savingMetadata) {
      return;
    }

    const accepted = window.confirm(`Xóa chart "${image.chartLabel}" (slot ${image.imageSlot})?`);
    if (!accepted) {
      return;
    }

    setDeletingUid(image.imageUid);
    setDeleteNotice(null);
    setGalleryNotice(null);

    try {
      await client.deleteImage(image.imageUid);

      setImages((previous) => previous.filter((item) => item.imageUid !== image.imageUid));
      if (editing?.imageUid === image.imageUid) {
        setEditing(null);
      }
      setMetadataNotice((previous) => (previous?.imageUid === image.imageUid ? null : previous));
      setDeleteNotice({
        imageUid: image.imageUid,
        tone: "success",
        message: `Đã xóa chart "${image.chartLabel}".`,
      });
    } catch (cause) {
      const message = normalizeRequestFailureMessage(cause, "Xóa chart thất bại.");
      setDeleteNotice({
        imageUid: image.imageUid,
        tone: "error",
        message,
      });
    } finally {
      setDeletingUid(null);
    }
  };

  const handleMetadataSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editing || savingMetadata) {
      return;
    }

    const payload: PupperfishUpdateTradeImagePayload = {
      chartLabel: editing.chartLabel.trim(),
      symbol: editing.symbol.trim() ? editing.symbol.trim() : null,
      timeframe: editing.timeframe.trim() ? editing.timeframe.trim().toUpperCase() : null,
      note: editing.note.trim() ? editing.note.trim() : null,
    };

    const imageSlotRaw = editing.imageSlot.trim();
    if (imageSlotRaw) {
      const parsed = Number(imageSlotRaw);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        setMetadataNotice({
          imageUid: editing.imageUid,
          tone: "error",
          message: "imageSlot phải là số nguyên dương.",
        });
        return;
      }
      payload.imageSlot = Math.trunc(parsed);
    } else {
      payload.imageSlot = null;
    }

    if (!payload.chartLabel) {
      setMetadataNotice({
        imageUid: editing.imageUid,
        tone: "error",
        message: "chartLabel không được để trống.",
      });
      return;
    }

    setSavingMetadata(true);
    setMetadataNotice(null);
    setDeleteNotice(null);

    try {
      const updated = await client.updateImage(editing.imageUid, payload);
      setImages((previous) =>
        sortImages(previous.map((item) => (item.imageUid === updated.imageUid ? updated : item))),
      );
      setEditing(createMetadataDraft(updated));
      setMetadataNotice({
        imageUid: updated.imageUid,
        tone: "success",
        message: `Đã lưu metadata cho chart "${updated.chartLabel}".`,
      });
      void loadRecentNotes();
    } catch (cause) {
      const message = normalizeRequestFailureMessage(cause, "Cập nhật metadata thất bại.");
      setMetadataNotice({
        imageUid: editing.imageUid,
        tone: "error",
        message,
      });
    } finally {
      setSavingMetadata(false);
    }
  };

  const selectedFileMeta = useMemo(() => {
    if (!uploadDraft.file) {
      return null;
    }

    return `Đã chọn: ${uploadDraft.file.name} · ${uploadDraft.file.type || "image/*"} · ${formatFileSize(uploadDraft.file.size)}`;
  }, [uploadDraft.file]);

  const showGlobalDeleteNotice = Boolean(
    deleteNotice && (deleteNotice.tone === "success" || !images.some((item) => item.imageUid === deleteNotice.imageUid)),
  );
  const viewerItems = useMemo(
    () =>
      images.map((image) => ({
        id: image.id,
        imageUid: image.imageUid,
        fileUrl: imageUrlFor(image),
        chartLabel: image.chartLabel,
        dateText: image.dateText,
        timeText: image.timeText,
        symbol: image.symbol,
        timeframe: image.timeframe,
        note: image.note,
        imageSlot: image.imageSlot,
        fileName: image.fileName,
        createdAt: image.createdAt,
      })),
    [images],
  );

  const renderAutocompleteDropdown = (target: AutocompleteTarget) => {
    if (activeAutocompleteTarget !== target || activeSuggestions.length < 1) {
      return null;
    }

    let lastGroup: string | null = null;

    return (
      <div className="zen-image-autocomplete" role="listbox">
        {activeSuggestions.map((suggestion, index) => {
          const group = groupLabelForSuggestion(suggestion.group);
          const showGroup = group !== lastGroup;
          lastGroup = group;
          const isActive = index === activeSuggestionIndex;
          const description = descriptionForSuggestion(suggestion);

          return (
            <div key={suggestion.id}>
              {showGroup ? <div className="zen-image-autocomplete__group">{group}</div> : null}
              <button
                type="button"
                className={`zen-image-autocomplete__item${isActive ? " zen-image-autocomplete__item--active" : ""}`}
                onMouseEnter={() => setActiveSuggestionIndex(index)}
                onMouseDown={(event) => {
                  event.preventDefault();
                  acceptSuggestion(target, suggestion, false);
                }}
              >
                <span className="zen-image-autocomplete__value">{suggestion.value}</span>
                {description ? <span className="zen-image-autocomplete__summary">{description}</span> : null}
              </button>
            </div>
          );
        })}
      </div>
    );
  };

  const renderField = ({ surface, field, id, label, value, placeholder, disabled }: RenderFieldArgs) => {
    const target = `${surface}-${field}` as AutocompleteTarget;
    const fieldRef =
      surface === "upload"
        ? field === "symbol"
          ? uploadSymbolRef
          : field === "timeframe"
            ? uploadTimeframeRef
            : uploadRoleRef
        : field === "symbol"
          ? editSymbolRef
          : field === "timeframe"
            ? editTimeframeRef
            : editRoleRef;

    const updateField = (nextValue: string) => {
      if (surface === "upload") {
        updateUploadField(field, nextValue);
      } else {
        updateEditingField(field, nextValue);
      }
    };

    return (
      <label className="zen-filter-field" htmlFor={id}>
        <span>{label}</span>
        <div className="zen-image-field-wrap">
          <input
            id={id}
            ref={fieldRef}
            className="zen-input zen-input--compact"
            value={value}
            onFocus={() => openAutocomplete(target)}
            onBlur={() => handleAutocompleteBlur(target)}
            onKeyDown={(event) => handleAutocompleteKeyDown(target, event)}
            onChange={(event) => {
              updateField(event.target.value);
              openAutocomplete(target);
            }}
            placeholder={placeholder}
            autoComplete="off"
            spellCheck={false}
            disabled={disabled}
          />
          {renderAutocompleteDropdown(target)}
        </div>
      </label>
    );
  };

  const renderNoteField = (surface: FocusSurface, id: string, value: string, disabled: boolean) => {
    const target = `${surface}-note` as AutocompleteTarget;
    const ref = surface === "upload" ? uploadNoteRef : editNoteRef;

    return (
      <label className="zen-filter-field zen-filter-field--full" htmlFor={id}>
        <span>Note</span>
        <div className="zen-image-field-wrap zen-image-field-wrap--textarea">
          <textarea
            id={id}
            ref={ref}
            className="zen-input zen-input--compact"
            rows={2}
            value={value}
            onFocus={() => {
              if (value.trim()) {
                openAutocomplete(target);
              }
            }}
            onBlur={() => handleAutocompleteBlur(target)}
            onKeyDown={(event) => handleAutocompleteKeyDown(target, event)}
            onChange={(event) => {
              if (surface === "upload") {
                updateUploadField("note", event.target.value);
              } else {
                updateEditingField("note", event.target.value);
              }
              if (event.target.value.trim()) {
                openAutocomplete(target);
              } else if (activeAutocompleteTarget === target) {
                closeAutocomplete();
              }
            }}
            placeholder="Context + Signal + Location + Bias"
            disabled={disabled}
          />
          {renderAutocompleteDropdown(target)}
        </div>
      </label>
    );
  };

  return (
    <section className={`zen-image-manager${compact ? " zen-image-manager--compact" : ""}`}>
      <div className="zen-image-manager__head">
        <div>
          <p className="zen-kicker">{title}</p>
          <p className="zen-image-manager__entry">{canLoad ? `entryUid: ${entryValue}` : "Chưa có entryUid để upload chart."}</p>
        </div>
        <button
          type="button"
          className="zen-chip"
          onClick={() => {
            if (!canLoad || loading) {
              return;
            }
            manualReloadRequestedRef.current = true;
            setReloadNonce((previous) => previous + 1);
          }}
          disabled={!canLoad || loading}
          aria-label="Refresh danh sách chart"
        >
          {loading ? "Đang tải..." : "Refresh"}
        </button>
      </div>

      {galleryNotice ? (
        <div
          className={`zen-image-status zen-image-status--${galleryNotice.tone}`}
          aria-live={galleryNotice.tone === "success" ? "polite" : "assertive"}
          role={galleryNotice.tone === "error" ? "alert" : "status"}
        >
          <span className="zen-image-status__label">{statusLabelFor(galleryNotice.tone)}</span>
          <span>{galleryNotice.message}</span>
        </div>
      ) : null}

      {canLoad ? (
        <form className="zen-image-upload-form" onSubmit={handleUpload} aria-label="Upload chart image">
          <label className="zen-filter-field zen-filter-field--full" htmlFor={`chart-upload-file-${entryValue}`}>
            <span>File image</span>
            <input
              id={`chart-upload-file-${entryValue}`}
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="zen-input zen-input--compact"
              onChange={handleUploadFileChange}
              disabled={uploadStatus === "uploading"}
            />
          </label>

          {renderField({
            surface: "upload",
            field: "symbol",
            id: `chart-upload-symbol-${entryValue}`,
            label: "Symbol",
            value: uploadDraft.symbol,
            placeholder: "EURUSD",
            disabled: uploadStatus === "uploading",
          })}

          {renderField({
            surface: "upload",
            field: "timeframe",
            id: `chart-upload-timeframe-${entryValue}`,
            label: "Timeframe",
            value: uploadDraft.timeframe,
            placeholder: "H1",
            disabled: uploadStatus === "uploading",
          })}

          {renderField({
            surface: "upload",
            field: "role",
            id: `chart-upload-role-${entryValue}`,
            label: "Role",
            value: uploadDraft.role,
            placeholder: "SETUP",
            disabled: uploadStatus === "uploading",
          })}

          <label className="zen-filter-field zen-filter-field--full" htmlFor={`chart-upload-label-${entryValue}`}>
            <div className="zen-image-label-head">
              <span>Chart label</span>
              {uploadDraft.chartLabelManuallyEdited && buildDraftChartLabel(uploadDraft.symbol, uploadDraft.timeframe, uploadDraft.role) ? (
                <button
                  type="button"
                  className="zen-chip zen-chip--ghost"
                  onClick={() => setUploadDraft((previous) => resetChartDraftLabel(previous))}
                  disabled={uploadStatus === "uploading"}
                >
                  Use standard label
                </button>
              ) : null}
            </div>
            <input
              id={`chart-upload-label-${entryValue}`}
              ref={uploadChartLabelRef}
              className="zen-input zen-input--compact"
              value={uploadDraft.chartLabel}
              onFocus={() => closeAutocomplete()}
              onChange={(event) => updateUploadField("chartLabel", event.target.value)}
              placeholder="EURUSD H1 SETUP"
              disabled={uploadStatus === "uploading"}
            />
            <p className="zen-image-form-note">{helperTextForDraft(uploadDraft)}</p>
            {uploadWarning ? <p className="zen-image-form-note zen-image-form-note--warning">{uploadWarning}</p> : null}
          </label>

          {renderNoteField("upload", `chart-upload-note-${entryValue}`, uploadDraft.note, uploadStatus === "uploading")}

          {selectedFileMeta ? (
            <p className="zen-image-file-meta" aria-live="polite">
              {selectedFileMeta}
            </p>
          ) : null}

          <div className="zen-image-upload-actions">
            <button
              ref={uploadSubmitRef}
              type="submit"
              className="zen-btn zen-btn--secondary"
              disabled={uploadStatus === "uploading" || !uploadDraft.file}
            >
              {uploadStatus === "uploading" ? "Đang upload..." : "Upload"}
            </button>
            <span className="zen-helper-text">Chỉ nhận image/*, tối đa 10MB.</span>
          </div>

          {uploadStatus !== "idle" && uploadMessage ? (
            <div
              className={`zen-image-status zen-image-status--${
                uploadStatus === "uploading" ? "progress" : uploadStatus === "success" ? "success" : "error"
              }`}
              aria-live={uploadStatus === "error" ? "assertive" : "polite"}
              role={uploadStatus === "error" ? "alert" : "status"}
            >
              <span className="zen-image-status__label">
                {statusLabelFor(
                  uploadStatus === "uploading" ? "progress" : uploadStatus === "success" ? "success" : "error",
                )}
              </span>
              <span>{uploadMessage}</span>
            </div>
          ) : null}
        </form>
      ) : null}

      {showGlobalDeleteNotice && deleteNotice ? (
        <div
          className={`zen-image-status zen-image-status--${deleteNotice.tone}`}
          aria-live={deleteNotice.tone === "success" ? "polite" : "assertive"}
          role={deleteNotice.tone === "error" ? "alert" : "status"}
        >
          <span className="zen-image-status__label">{statusLabelFor(deleteNotice.tone)}</span>
          <span>{deleteNotice.message}</span>
        </div>
      ) : null}

      {canLoad ? (
        <div className="zen-image-gallery" aria-label="Danh sách chart images">
          {images.length < 1 && !loading ? <p className="zen-muted">Chưa có chart cho log này.</p> : null}

          {images.map((image, index) => {
            const isEditing = editing?.imageUid === image.imageUid;
            const metadataNoticeForImage = metadataNotice?.imageUid === image.imageUid ? metadataNotice : null;
            const deleteNoticeForImage =
              deleteNotice?.imageUid === image.imageUid && deleteNotice?.tone === "error" ? deleteNotice : null;

            return (
              <article
                key={image.imageUid}
                className={`zen-image-card${highlightedImageUid === image.imageUid ? " is-new" : ""}`}
                ref={(node) => {
                  imageCardRefs.current[image.imageUid] = node;
                }}
              >
                <div className="zen-image-card__preview-wrap">
                  <button
                    type="button"
                    className="zen-image-card__preview-button"
                    onClick={() => {
                      if (!imageUrlFor(image)) {
                        return;
                      }
                      setViewerIndex(index);
                      setViewerOpen(true);
                    }}
                    aria-label={`Mở chart ${image.chartLabel}`}
                    disabled={!imageUrlFor(image)}
                  >
                    <img src={imageUrlFor(image)} alt={image.chartLabel} className="zen-image-card__preview" loading="lazy" />
                  </button>
                </div>

                <div className="zen-image-card__meta">
                  <p className="zen-image-card__title">#{image.imageSlot} {image.chartLabel}</p>
                  <p className="zen-muted">
                    {(image.symbol ?? "-")}/{(image.timeframe ?? "-")} · {image.fileName}
                  </p>
                  {image.note ? <p className="zen-muted">{image.note}</p> : null}
                </div>

                <div className="zen-image-card__actions">
                  <button
                    type="button"
                    className="zen-chip"
                    onClick={() => {
                      closeAutocomplete();
                      setEditing(isEditing ? null : createMetadataDraft(image));
                    }}
                    aria-label="Sửa metadata chart"
                    disabled={deletingUid === image.imageUid || savingMetadata}
                  >
                    {isEditing ? "Đóng sửa" : "Sửa metadata"}
                  </button>
                  <button
                    type="button"
                    className="zen-chip"
                    onClick={() => void handleDelete(image)}
                    aria-label="Xóa chart"
                    disabled={deletingUid === image.imageUid || savingMetadata}
                  >
                    {deletingUid === image.imageUid ? "Đang xóa..." : "Xóa"}
                  </button>
                </div>

                {isEditing && editing ? (
                  <form className="zen-image-edit-form" onSubmit={handleMetadataSave} aria-label="Sửa metadata image">
                    {renderField({
                      surface: "edit",
                      field: "symbol",
                      id: `img-edit-symbol-${image.imageUid}`,
                      label: "Symbol",
                      value: editing.symbol,
                      placeholder: "EURUSD",
                      disabled: savingMetadata,
                    })}

                    {renderField({
                      surface: "edit",
                      field: "timeframe",
                      id: `img-edit-timeframe-${image.imageUid}`,
                      label: "Timeframe",
                      value: editing.timeframe,
                      placeholder: "H1",
                      disabled: savingMetadata,
                    })}

                    {renderField({
                      surface: "edit",
                      field: "role",
                      id: `img-edit-role-${image.imageUid}`,
                      label: "Role",
                      value: editing.role,
                      placeholder: "SETUP",
                      disabled: savingMetadata,
                    })}

                    <label className="zen-filter-field zen-filter-field--full" htmlFor={`img-edit-label-${image.imageUid}`}>
                      <div className="zen-image-label-head">
                        <span>Chart label</span>
                        {editing.chartLabelManuallyEdited && buildDraftChartLabel(editing.symbol, editing.timeframe, editing.role) ? (
                          <button
                            type="button"
                            className="zen-chip zen-chip--ghost"
                            onClick={() => setEditing((previous) => (previous ? resetChartDraftLabel(previous) : previous))}
                            disabled={savingMetadata}
                          >
                            Use standard label
                          </button>
                        ) : null}
                      </div>
                      <input
                        id={`img-edit-label-${image.imageUid}`}
                        ref={editChartLabelRef}
                        className="zen-input zen-input--compact"
                        value={editing.chartLabel}
                        onFocus={() => closeAutocomplete()}
                        onChange={(event) => updateEditingField("chartLabel", event.target.value)}
                        disabled={savingMetadata}
                      />
                      <p className="zen-image-form-note">{helperTextForDraft(editing)}</p>
                      {editWarning ? <p className="zen-image-form-note zen-image-form-note--warning">{editWarning}</p> : null}
                    </label>

                    <label className="zen-filter-field" htmlFor={`img-edit-slot-${image.imageUid}`}>
                      <span>Image slot</span>
                      <input
                        id={`img-edit-slot-${image.imageUid}`}
                        ref={editImageSlotRef}
                        className="zen-input zen-input--compact"
                        value={editing.imageSlot}
                        onFocus={() => closeAutocomplete()}
                        onChange={(event) => updateEditingField("imageSlot", event.target.value)}
                        disabled={savingMetadata}
                      />
                    </label>

                    {renderNoteField("edit", `img-edit-note-${image.imageUid}`, editing.note, savingMetadata)}

                    <div className="zen-image-edit-actions">
                      <button ref={editSubmitRef} type="submit" className="zen-btn zen-btn--secondary" disabled={savingMetadata}>
                        {savingMetadata ? "Đang lưu..." : "Lưu metadata"}
                      </button>
                    </div>

                    {metadataNoticeForImage ? (
                      <div
                        className={`zen-image-status zen-image-status--${metadataNoticeForImage.tone}`}
                        aria-live={metadataNoticeForImage.tone === "success" ? "polite" : "assertive"}
                        role={metadataNoticeForImage.tone === "error" ? "alert" : "status"}
                      >
                        <span className="zen-image-status__label">{statusLabelFor(metadataNoticeForImage.tone)}</span>
                        <span>{metadataNoticeForImage.message}</span>
                      </div>
                    ) : null}
                  </form>
                ) : null}

                {deleteNoticeForImage ? (
                  <div
                    className={`zen-image-status zen-image-status--${deleteNoticeForImage.tone}`}
                    aria-live="assertive"
                    role="alert"
                  >
                    <span className="zen-image-status__label">{statusLabelFor(deleteNoticeForImage.tone)}</span>
                    <span>{deleteNoticeForImage.message}</span>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      ) : null}

      <PupperfishChartViewer
        items={viewerItems}
        activeIndex={viewerIndex}
        open={viewerOpen}
        onClose={() => setViewerOpen(false)}
        onActiveIndexChange={setViewerIndex}
      />
    </section>
  );
}
