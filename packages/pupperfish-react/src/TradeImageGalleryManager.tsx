"use client";
/* eslint-disable @next/next/no-img-element */

import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import type { PupperfishTradeImageItem, PupperfishUpdateTradeImagePayload } from "@tungpastry/pupperfish-framework";

import { PupperfishChartViewer } from "./PupperfishChartViewer.js";
import type { PupperfishClient } from "./types.js";

type TradeImageGalleryManagerProps = {
  client: PupperfishClient;
  entryUid: string | null;
  title?: string;
  compact?: boolean;
};

type UploadDraft = {
  file: File | null;
  chartLabel: string;
  symbol: string;
  timeframe: string;
  note: string;
};

type MetadataDraft = {
  imageUid: string;
  chartLabel: string;
  symbol: string;
  timeframe: string;
  note: string;
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

const DEFAULT_UPLOAD_DRAFT: UploadDraft = {
  file: null,
  chartLabel: "",
  symbol: "",
  timeframe: "",
  note: "",
};

const MAX_IMAGE_FILE_BYTES = 10 * 1024 * 1024;
const UPLOAD_SUCCESS_TIMEOUT_MS = 4500;

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

function createMetadataDraft(item: PupperfishTradeImageItem): MetadataDraft {
  return {
    imageUid: item.imageUid,
    chartLabel: item.chartLabel,
    symbol: item.symbol ?? "",
    timeframe: item.timeframe ?? "",
    note: item.note ?? "",
    imageSlot: String(item.imageSlot),
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

export function TradeImageGalleryManager({
  client,
  entryUid,
  title = "Charts",
  compact = false,
}: TradeImageGalleryManagerProps) {
  const [images, setImages] = useState<PupperfishTradeImageItem[]>([]);
  const [loading, setLoading] = useState(false);
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const manualReloadRequestedRef = useRef(false);
  const imageCardRefs = useRef<Record<string, HTMLElement | null>>({});

  const canLoad = Boolean(entryUid && entryUid.trim());
  const entryValue = (entryUid ?? "").trim();

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
  }, [entryValue]);

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

  const updateUploadField = <K extends keyof UploadDraft>(field: K, value: UploadDraft[K]) => {
    setUploadDraft((previous) => ({
      ...previous,
      [field]: value,
    }));
    setUploadStatus("idle");
    setUploadMessage(null);
  };

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
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const updateEditingField = <K extends keyof MetadataDraft>(field: K, value: MetadataDraft[K]) => {
    setEditing((previous) => (previous ? { ...previous, [field]: value } : previous));
    setMetadataNotice((previous) => (previous ? null : previous));
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
          <label className="zen-filter-field" htmlFor={`chart-upload-file-${entryValue}`}>
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

          <label className="zen-filter-field" htmlFor={`chart-upload-label-${entryValue}`}>
            <span>Chart label</span>
            <input
              id={`chart-upload-label-${entryValue}`}
              className="zen-input zen-input--compact"
              value={uploadDraft.chartLabel}
              onChange={(event) => updateUploadField("chartLabel", event.target.value)}
              placeholder="VD: UJ H1 setup"
              disabled={uploadStatus === "uploading"}
            />
          </label>

          <label className="zen-filter-field" htmlFor={`chart-upload-symbol-${entryValue}`}>
            <span>Symbol</span>
            <input
              id={`chart-upload-symbol-${entryValue}`}
              className="zen-input zen-input--compact"
              value={uploadDraft.symbol}
              onChange={(event) => updateUploadField("symbol", event.target.value)}
              placeholder="USDJPY"
              disabled={uploadStatus === "uploading"}
            />
          </label>

          <label className="zen-filter-field" htmlFor={`chart-upload-timeframe-${entryValue}`}>
            <span>Timeframe</span>
            <input
              id={`chart-upload-timeframe-${entryValue}`}
              className="zen-input zen-input--compact"
              value={uploadDraft.timeframe}
              onChange={(event) => updateUploadField("timeframe", event.target.value)}
              placeholder="H1"
              disabled={uploadStatus === "uploading"}
            />
          </label>

          <label className="zen-filter-field zen-filter-field--full" htmlFor={`chart-upload-note-${entryValue}`}>
            <span>Note</span>
            <textarea
              id={`chart-upload-note-${entryValue}`}
              className="zen-input zen-input--compact"
              rows={2}
              value={uploadDraft.note}
              onChange={(event) => updateUploadField("note", event.target.value)}
              placeholder="Ghi chú setup/chart"
              disabled={uploadStatus === "uploading"}
            />
          </label>

          {selectedFileMeta ? (
            <p className="zen-image-file-meta" aria-live="polite">
              {selectedFileMeta}
            </p>
          ) : null}

          <div className="zen-image-upload-actions">
            <button
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
                    onClick={() => setEditing(isEditing ? null : createMetadataDraft(image))}
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
                    <label className="zen-filter-field" htmlFor={`img-edit-label-${image.imageUid}`}>
                      <span>Chart label</span>
                      <input
                        id={`img-edit-label-${image.imageUid}`}
                        className="zen-input zen-input--compact"
                        value={editing.chartLabel}
                        onChange={(event) => updateEditingField("chartLabel", event.target.value)}
                        disabled={savingMetadata}
                      />
                    </label>

                    <label className="zen-filter-field" htmlFor={`img-edit-symbol-${image.imageUid}`}>
                      <span>Symbol</span>
                      <input
                        id={`img-edit-symbol-${image.imageUid}`}
                        className="zen-input zen-input--compact"
                        value={editing.symbol}
                        onChange={(event) => updateEditingField("symbol", event.target.value)}
                        disabled={savingMetadata}
                      />
                    </label>

                    <label className="zen-filter-field" htmlFor={`img-edit-timeframe-${image.imageUid}`}>
                      <span>Timeframe</span>
                      <input
                        id={`img-edit-timeframe-${image.imageUid}`}
                        className="zen-input zen-input--compact"
                        value={editing.timeframe}
                        onChange={(event) => updateEditingField("timeframe", event.target.value)}
                        disabled={savingMetadata}
                      />
                    </label>

                    <label className="zen-filter-field" htmlFor={`img-edit-slot-${image.imageUid}`}>
                      <span>Image slot</span>
                      <input
                        id={`img-edit-slot-${image.imageUid}`}
                        className="zen-input zen-input--compact"
                        value={editing.imageSlot}
                        onChange={(event) => updateEditingField("imageSlot", event.target.value)}
                        disabled={savingMetadata}
                      />
                    </label>

                    <label className="zen-filter-field zen-filter-field--full" htmlFor={`img-edit-note-${image.imageUid}`}>
                      <span>Note</span>
                      <textarea
                        id={`img-edit-note-${image.imageUid}`}
                        className="zen-input zen-input--compact"
                        rows={2}
                        value={editing.note}
                        onChange={(event) => updateEditingField("note", event.target.value)}
                        disabled={savingMetadata}
                      />
                    </label>

                    <div className="zen-image-edit-actions">
                      <button type="submit" className="zen-btn zen-btn--secondary" disabled={savingMetadata}>
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
