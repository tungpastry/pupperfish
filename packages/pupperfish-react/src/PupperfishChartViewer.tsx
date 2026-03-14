"use client";
/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from "react";

import type { PupperfishChartViewerItem } from "./types.js";

type PupperfishChartViewerProps = {
  items: PupperfishChartViewerItem[];
  activeIndex: number;
  open: boolean;
  onClose: () => void;
  onActiveIndexChange: (index: number) => void;
};

type DragState = {
  pointerId: number;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
};

const MIN_ZOOM = 1;
const MAX_ZOOM = 4;
const ZOOM_STEP = 0.25;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function formatViewerTimestamp(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toLocaleString("vi-VN");
}

function formatLogTime(dateText: string | null | undefined, timeText: string | null | undefined): string | null {
  const date = (dateText ?? "").trim();
  const time = (timeText ?? "").trim();

  if (date && time) {
    return `${date} ${time}`;
  }

  if (date) {
    return date;
  }

  if (time) {
    return time;
  }

  return null;
}

function cycleIndex(index: number, count: number, delta: number): number {
  if (count < 1) {
    return 0;
  }

  return (index + delta + count) % count;
}

export function PupperfishChartViewer({
  items,
  activeIndex,
  open,
  onClose,
  onActiveIndexChange,
}: PupperfishChartViewerProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const primaryActionRef = useRef<HTMLButtonElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const count = items.length;
  const safeIndex = count < 1 ? 0 : clamp(activeIndex, 0, count - 1);
  const activeItem = count < 1 ? null : items[safeIndex] ?? null;
  const canNavigate = count > 1;
  const canShow = open && activeItem !== null;

  const metadata = useMemo(
    () => [
      activeItem?.symbol ? { label: "Symbol", value: activeItem.symbol } : null,
      activeItem?.timeframe ? { label: "Timeframe", value: activeItem.timeframe } : null,
      formatLogTime(activeItem?.dateText, activeItem?.timeText)
        ? { label: "Log Time", value: formatLogTime(activeItem?.dateText, activeItem?.timeText) as string }
        : null,
      typeof activeItem?.imageSlot === "number" ? { label: "Image Slot", value: `#${activeItem.imageSlot}` } : null,
      activeItem?.fileName ? { label: "File", value: activeItem.fileName } : null,
      formatViewerTimestamp(activeItem?.createdAt) ? { label: "Created", value: formatViewerTimestamp(activeItem?.createdAt) as string } : null,
      activeItem?.note ? { label: "Note", value: activeItem.note } : null,
    ].filter((item): item is { label: string; value: string } => item !== null),
    [activeItem],
  );

  useEffect(() => {
    if (!canShow) {
      setZoom(1);
      setPan({ x: 0, y: 0 });
      setDragState(null);
      return;
    }

    setZoom(1);
    setPan({ x: 0, y: 0 });
    primaryActionRef.current?.focus();
  }, [canShow, safeIndex]);

  useEffect(() => {
    if (!canShow) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [canShow]);

  useEffect(() => {
    if (!canShow) {
      return;
    }

    const handleFullscreenChange = () => {
      const activeElement = document.fullscreenElement;
      setIsFullscreen(Boolean(activeElement && dialogRef.current && dialogRef.current.contains(activeElement)));
    };

    const handleKeydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key === "ArrowLeft" && canNavigate) {
        event.preventDefault();
        onActiveIndexChange(cycleIndex(safeIndex, count, -1));
        return;
      }

      if (event.key === "ArrowRight" && canNavigate) {
        event.preventDefault();
        onActiveIndexChange(cycleIndex(safeIndex, count, 1));
      }
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    window.addEventListener("keydown", handleKeydown);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      window.removeEventListener("keydown", handleKeydown);
    };
  }, [canNavigate, canShow, count, onActiveIndexChange, onClose, safeIndex]);

  if (!canShow || activeItem === null) {
    return null;
  }

  const resetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setDragState(null);
  };

  const zoomTo = (nextZoom: number) => {
    const normalized = clamp(nextZoom, MIN_ZOOM, MAX_ZOOM);
    setZoom(normalized);
    if (normalized === MIN_ZOOM) {
      setPan({ x: 0, y: 0 });
      setDragState(null);
    }
  };

  const handleBackdropClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) {
      onClose();
    }
  };

  const handleDialogKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Tab") {
      return;
    }

    const root = dialogRef.current;
    if (!root) {
      return;
    }

    const focusable = Array.from(
      root.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    ).filter((element) => element.offsetParent !== null || element === document.activeElement);

    if (focusable.length < 1) {
      event.preventDefault();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement as HTMLElement | null;

    if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    } else if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    }
  };

  const handleToggleFullscreen = async () => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }

    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else if (typeof dialog.requestFullscreen === "function") {
        await dialog.requestFullscreen();
      }
    } catch {
      // Fullscreen is optional. Ignore unsupported/failed attempts.
    }
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (zoom <= 1) {
      return;
    }

    event.preventDefault();
    setDragState({
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: pan.x,
      originY: pan.y,
    });
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    setPan({
      x: dragState.originX + (event.clientX - dragState.startX),
      y: dragState.originY + (event.clientY - dragState.startY),
    });
  };

  const handlePointerRelease = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    event.currentTarget.releasePointerCapture?.(event.pointerId);
    setDragState(null);
  };

  return (
    <div className="zen-pf-chart-viewer" role="presentation" onClick={handleBackdropClick}>
      <div
        ref={dialogRef}
        className="zen-pf-chart-viewer__dialog"
        role="dialog"
        aria-modal="true"
        aria-label={`Chart viewer: ${activeItem.chartLabel}`}
        onKeyDown={handleDialogKeyDown}
      >
        <div className="zen-pf-chart-viewer__toolbar">
          <div className="zen-pf-chart-viewer__title">
            <strong>{activeItem.chartLabel}</strong>
            <span>
              {safeIndex + 1}/{count}
            </span>
          </div>
          <div className="zen-pf-chart-viewer__toolbar-actions">
            <button
              ref={primaryActionRef}
              type="button"
              className="zen-icon-btn"
              onClick={() => zoomTo(zoom + ZOOM_STEP)}
              aria-label="Phóng to chart"
            >
              +
            </button>
            <button
              type="button"
              className="zen-icon-btn"
              onClick={() => zoomTo(zoom - ZOOM_STEP)}
              aria-label="Thu nhỏ chart"
            >
              -
            </button>
            <button type="button" className="zen-icon-btn" onClick={resetView} aria-label="Đặt lại zoom chart">
              Reset
            </button>
            <button type="button" className="zen-icon-btn" onClick={() => void handleToggleFullscreen()} aria-label="Bật hoặc tắt fullscreen chart">
              {isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
            </button>
            <button type="button" className="zen-icon-btn" onClick={onClose} aria-label="Đóng chart viewer">
              Đóng
            </button>
          </div>
        </div>

        <div className="zen-pf-chart-viewer__body">
          <div className="zen-pf-chart-viewer__stage-shell">
            {canNavigate ? (
              <button
                type="button"
                className="zen-pf-chart-viewer__nav zen-pf-chart-viewer__nav--prev"
                onClick={() => onActiveIndexChange(cycleIndex(safeIndex, count, -1))}
                aria-label="Xem chart trước"
              >
                ‹
              </button>
            ) : null}

            <div
              ref={stageRef}
              className={`zen-pf-chart-viewer__stage${zoom > 1 ? " is-zoomed" : ""}${dragState ? " is-dragging" : ""}`}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerRelease}
              onPointerCancel={handlePointerRelease}
              onPointerLeave={handlePointerRelease}
            >
              <img
                src={activeItem.fileUrl ?? ""}
                alt={activeItem.chartLabel}
                className="zen-pf-chart-viewer__image"
                draggable={false}
                style={{
                  transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                }}
              />
            </div>

            {canNavigate ? (
              <button
                type="button"
                className="zen-pf-chart-viewer__nav zen-pf-chart-viewer__nav--next"
                onClick={() => onActiveIndexChange(cycleIndex(safeIndex, count, 1))}
                aria-label="Xem chart tiếp theo"
              >
                ›
              </button>
            ) : null}
          </div>

          <aside className="zen-pf-chart-viewer__meta">
            <p className="zen-kicker">Chart Metadata</p>
            {metadata.length < 1 ? (
              <p className="zen-muted">Không có metadata bổ sung cho chart này.</p>
            ) : (
              <dl className="zen-pf-chart-viewer__meta-list">
                {metadata.map((item) => (
                  <div key={`${item.label}-${item.value}`} className="zen-pf-chart-viewer__meta-row">
                    <dt>{item.label}</dt>
                    <dd>{item.value}</dd>
                  </div>
                ))}
              </dl>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}
