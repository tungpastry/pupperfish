import assert from "node:assert/strict";

import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";

import {
  PupperfishChartViewer,
  PupperfishChatShell,
  PupperfishDock,
  PupperfishWidgetShell,
  TradeImageGalleryManager,
  shouldSubmitComposerKey,
} from "../packages/pupperfish-react/dist/index.js";

let JSDOM = null;
try {
  ({ JSDOM } = await import(process.env.PUPPERFISH_JSDOM_ENTRY ?? "jsdom"));
} catch {
  JSDOM = null;
}

function installDom() {
  if (!JSDOM) {
    throw new Error("jsdom is not available");
  }

  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "http://localhost",
  });

  const { window } = dom;
  if (!Object.getOwnPropertyDescriptor(window.Document.prototype, "fullscreenElement")) {
    Object.defineProperty(window.Document.prototype, "fullscreenElement", {
      configurable: true,
      get() {
        return null;
      },
    });
  }
  window.matchMedia = window.matchMedia ?? (() => ({
    matches: false,
    media: "",
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent() {
      return false;
    },
  }));
  window.scrollTo = window.scrollTo ?? (() => {});

  if (typeof window.HTMLFormElement.prototype.requestSubmit !== "function") {
    window.HTMLFormElement.prototype.requestSubmit = function requestSubmit() {
      this.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
    };
  }

  const restore = [];

  for (const [key, value] of Object.entries({
    IS_REACT_ACT_ENVIRONMENT: true,
    window,
    document: window.document,
    navigator: window.navigator,
    HTMLElement: window.HTMLElement,
    HTMLButtonElement: window.HTMLButtonElement,
    HTMLTextAreaElement: window.HTMLTextAreaElement,
    HTMLFormElement: window.HTMLFormElement,
    Event: window.Event,
    KeyboardEvent: window.KeyboardEvent,
    PointerEvent: window.PointerEvent ?? window.MouseEvent,
  })) {
    const existing = Object.getOwnPropertyDescriptor(globalThis, key);
    restore.push([key, existing]);
    Object.defineProperty(globalThis, key, {
      configurable: true,
      writable: true,
      value,
    });
  }

  return () => {
    dom.window.close();
    for (const [key, descriptor] of restore) {
      if (descriptor) {
        Object.defineProperty(globalThis, key, descriptor);
      } else {
        delete globalThis[key];
      }
    }
  };
}

function createClient(overrides = {}) {
  return {
    async retrieve() {
      return {
        requestUid: "req_smoke",
        convoUid: "convo_smoke",
        mode: "hybrid",
        answer: "Smoke answer",
        confidence: 0.8,
        assumptions: [],
        evidence: [],
        charts: [],
        memories: [],
        sources: [],
        latencyMs: 5,
      };
    },
    async getLog() {
      throw new Error("unused");
    },
    async listLogImages() {
      return [];
    },
    async listRecentChartNotes() {
      return [];
    },
    async uploadLogImage() {
      throw new Error("unused");
    },
    async updateImage() {
      throw new Error("unused");
    },
    async deleteImage() {
      throw new Error("unused");
    },
    ...overrides,
  };
}

function createSignalStore(initial = {}) {
  let signal = {
    status: "idle",
    confidence: null,
    lowEvidence: false,
    evidenceCount: 0,
    chartsCount: 0,
    hasError: false,
    mode: null,
    pendingVisible: false,
    pendingPhase: null,
    pendingPlannerMode: null,
    pendingMessage: null,
    pendingElapsedSec: null,
    pendingSlow: false,
    updatedAt: "",
    ...initial,
  };
  const listeners = new Set();

  return {
    read() {
      return signal;
    },
    write(nextSignal) {
      signal = {
        ...signal,
        ...nextSignal,
        updatedAt: new Date().toISOString(),
      };
      for (const listener of listeners) {
        listener();
      }
      return signal;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

async function renderChatShell(options = {}) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const client = createClient(options.clientOverrides);

  await act(async () => {
    root.render(
      React.createElement(PupperfishChatShell, {
        client,
        branding: {
          assistantName: "Pupperfish",
          ...options.branding,
        },
        composerSubmitMode: options.composerSubmitMode,
        promptHistoryEnabled: options.promptHistoryEnabled,
        promptHistoryStorageKey: options.promptHistoryStorageKey,
        promptHistoryLimit: options.promptHistoryLimit,
        signalStore: options.signalStore,
      }),
    );
  });

  const textarea = container.querySelector("#pupperfish-query");
  assert.ok(textarea instanceof HTMLTextAreaElement);

  return {
    root,
    container,
    textarea,
    cleanup() {
      act(() => {
        root.unmount();
      });
      container.remove();
    },
  };
}

async function renderWidget(options = {}) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(
      React.createElement(PupperfishWidgetShell, {
        signalStore: options.signalStore ?? createSignalStore(),
        branding: {
          assistantName: "Pupperfish",
          ...options.branding,
        },
      }),
    );
  });

  return {
    root,
    container,
    cleanup() {
      act(() => {
        root.unmount();
      });
      container.remove();
    },
  };
}

async function renderGallery(options = {}) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const client = createClient(options.clientOverrides);

  await act(async () => {
    root.render(
      React.createElement(TradeImageGalleryManager, {
        client,
        entryUid: options.entryUid ?? "entry_smoke",
        title: "Charts",
      }),
    );
  });

  return {
    root,
    container,
    cleanup() {
      act(() => {
        root.unmount();
      });
      container.remove();
    },
  };
}

function createKeydown(key, options = {}) {
  const event = new window.KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
    shiftKey: Boolean(options.shiftKey),
    ctrlKey: Boolean(options.ctrlKey),
    metaKey: Boolean(options.metaKey),
    altKey: Boolean(options.altKey),
  });

  if (options.isComposing) {
    Object.defineProperty(event, "isComposing", {
      configurable: true,
      value: true,
    });
  }

  return event;
}

async function updateTextarea(textarea, nextValue) {
  await act(async () => {
    textarea.value = nextValue;
    textarea.dispatchEvent(new window.Event("input", { bubbles: true }));
  });
}

async function updateInput(input, nextValue) {
  await act(async () => {
    input.value = nextValue;
    input.dispatchEvent(new window.Event("input", { bubbles: true }));
  });
}

async function submitComposer(textarea) {
  await act(async () => {
    textarea.form.requestSubmit();
  });
}

async function dispatchTextareaKeydown(textarea, key, options = {}) {
  await act(async () => {
    textarea.dispatchEvent(createKeydown(key, options));
  });
}

async function runComposerKeyboardTests() {
  if (!JSDOM) {
    return;
  }

  let cleanupDom = null;

  try {
    cleanupDom = installDom();
    window.localStorage.clear();

    {
      const view = await renderChatShell();
      const hint = view.container.querySelector("#pupperfish-query-hint");
      assert.equal(view.textarea.getAttribute("enterkeyhint"), "send");
      assert.equal(hint?.textContent?.trim(), "Enter để hỏi · Shift+Enter để xuống dòng · ↑/↓ để gọi lại prompt gần đây");
      view.cleanup();
    }

    {
      const view = await renderChatShell({
        composerSubmitMode: "meta-enter-to-submit",
      });
      const hint = view.container.querySelector("#pupperfish-query-hint");
      assert.equal(view.textarea.getAttribute("enterkeyhint"), "enter");
      assert.equal(hint?.textContent?.trim(), "Ctrl/Cmd+Enter để hỏi · Enter để xuống dòng · ↑/↓ để gọi lại prompt gần đây");
      view.cleanup();
    }

    {
      assert.equal(
        shouldSubmitComposerKey({
          submitMode: "enter-to-submit",
          key: "Enter",
          shiftKey: false,
          ctrlKey: false,
          metaKey: false,
          altKey: false,
          isComposing: false,
          hasContent: true,
          busy: false,
        }),
        true,
      );

      assert.equal(
        shouldSubmitComposerKey({
          submitMode: "enter-to-submit",
          key: "Enter",
          shiftKey: true,
          ctrlKey: false,
          metaKey: false,
          altKey: false,
          isComposing: false,
          hasContent: true,
          busy: false,
        }),
        false,
      );

      assert.equal(
        shouldSubmitComposerKey({
          submitMode: "enter-to-submit",
          key: "Enter",
          shiftKey: false,
          ctrlKey: false,
          metaKey: false,
          altKey: false,
          isComposing: true,
          hasContent: true,
          busy: false,
        }),
        false,
      );

      assert.equal(
        shouldSubmitComposerKey({
          submitMode: "enter-to-submit",
          key: "Enter",
          shiftKey: false,
          ctrlKey: false,
          metaKey: false,
          altKey: false,
          isComposing: false,
          hasContent: true,
          busy: true,
        }),
        false,
      );

      assert.equal(
        shouldSubmitComposerKey({
          submitMode: "enter-to-submit",
          key: "Enter",
          shiftKey: false,
          ctrlKey: false,
          metaKey: false,
          altKey: false,
          isComposing: false,
          hasContent: false,
          busy: false,
        }),
        false,
      );

      assert.equal(
        shouldSubmitComposerKey({
          submitMode: "meta-enter-to-submit",
          key: "Enter",
          shiftKey: false,
          ctrlKey: false,
          metaKey: false,
          altKey: false,
          isComposing: false,
          hasContent: true,
          busy: false,
        }),
        false,
      );

      assert.equal(
        shouldSubmitComposerKey({
          submitMode: "meta-enter-to-submit",
          key: "Enter",
          shiftKey: false,
          ctrlKey: true,
          metaKey: false,
          altKey: false,
          isComposing: false,
          hasContent: true,
          busy: false,
        }),
        true,
      );
    }

    {
      const storageKey = "pupperfish-prompt-history-smoke";
      const view = await renderChatShell({
        promptHistoryStorageKey: storageKey,
        promptHistoryLimit: 3,
      });

      await updateTextarea(view.textarea, "A");
      await submitComposer(view.textarea);
      await updateTextarea(view.textarea, "B");
      await submitComposer(view.textarea);
      await updateTextarea(view.textarea, "C");
      await submitComposer(view.textarea);

      await updateTextarea(view.textarea, "draft đang gõ dở");
      view.textarea.setSelectionRange(0, 0);
      await dispatchTextareaKeydown(view.textarea, "ArrowUp");
      assert.equal(view.textarea.value, "C");

      view.textarea.setSelectionRange(0, 0);
      await dispatchTextareaKeydown(view.textarea, "ArrowUp");
      assert.equal(view.textarea.value, "B");

      view.textarea.setSelectionRange(0, 0);
      await dispatchTextareaKeydown(view.textarea, "ArrowUp");
      assert.equal(view.textarea.value, "A");

      view.textarea.setSelectionRange(0, 0);
      await dispatchTextareaKeydown(view.textarea, "ArrowUp");
      assert.equal(view.textarea.value, "A");

      view.textarea.setSelectionRange(view.textarea.value.length, view.textarea.value.length);
      await dispatchTextareaKeydown(view.textarea, "ArrowDown");
      assert.equal(view.textarea.value, "B");

      view.textarea.setSelectionRange(view.textarea.value.length, view.textarea.value.length);
      await dispatchTextareaKeydown(view.textarea, "ArrowDown");
      assert.equal(view.textarea.value, "C");

      view.textarea.setSelectionRange(view.textarea.value.length, view.textarea.value.length);
      await dispatchTextareaKeydown(view.textarea, "ArrowDown");
      assert.equal(view.textarea.value, "draft đang gõ dở");

      await updateTextarea(view.textarea, "C");
      await submitComposer(view.textarea);
      const storedHistory = JSON.parse(window.localStorage.getItem(storageKey) ?? "[]");
      assert.deepEqual(storedHistory, ["C", "B", "A"]);

      await updateTextarea(view.textarea, "line 1\nline 2");
      view.textarea.setSelectionRange(3, 3);
      await dispatchTextareaKeydown(view.textarea, "ArrowUp");
      assert.equal(view.textarea.value, "line 1\nline 2");

      view.textarea.setSelectionRange(view.textarea.value.length - 2, view.textarea.value.length - 2);
      await dispatchTextareaKeydown(view.textarea, "ArrowDown");
      assert.equal(view.textarea.value, "line 1\nline 2");

      await updateTextarea(view.textarea, "");
      view.textarea.setSelectionRange(0, 0);
      await dispatchTextareaKeydown(view.textarea, "ArrowUp", { isComposing: true });
      assert.equal(view.textarea.value, "");

      view.textarea.setSelectionRange(0, 0);
      await dispatchTextareaKeydown(view.textarea, "ArrowUp");
      assert.equal(view.textarea.value, "C");

      await updateTextarea(view.textarea, "C sửa");
      assert.equal(view.textarea.value, "C sửa");
      view.textarea.setSelectionRange(view.textarea.value.length, view.textarea.value.length);
      await dispatchTextareaKeydown(view.textarea, "ArrowDown");
      assert.equal(view.textarea.value, "C sửa");

      view.cleanup();

      const reloadedView = await renderChatShell({
        promptHistoryStorageKey: storageKey,
        promptHistoryLimit: 3,
      });
      reloadedView.textarea.setSelectionRange(0, 0);
      await dispatchTextareaKeydown(reloadedView.textarea, "ArrowUp");
      assert.equal(reloadedView.textarea.value, "C");
      reloadedView.cleanup();
    }
  } finally {
    cleanupDom?.();
  }
}

async function runChartViewerTests() {
  if (!JSDOM) {
    return;
  }

  let cleanupDom = null;

  try {
    cleanupDom = installDom();

    {
      const viewerHtml = renderToString(
        React.createElement(PupperfishChartViewer, {
          items: [
            {
              id: "img_1",
              imageUid: "img_1",
              fileUrl: "http://localhost/chart.png",
              chartLabel: "UJ H1 setup",
              symbol: "USDJPY",
              timeframe: "H1",
              note: "Alert zone",
              imageSlot: 1,
              fileName: "chart.png",
              createdAt: "2026-03-13T10:00:00.000Z",
            },
          ],
          activeIndex: 0,
          open: true,
          onClose() {},
          onActiveIndexChange() {},
        }),
      );
      assert.ok(viewerHtml.includes("UJ H1 setup"));
      assert.ok(viewerHtml.includes("Chart Metadata"));
    }

    {
      const view = await renderChatShell({
        clientOverrides: {
          async retrieve() {
            return {
              requestUid: "req_chart",
              convoUid: "convo_chart",
              mode: "hybrid",
              answer: "Có chart",
              confidence: 0.8,
              assumptions: [],
              evidence: [
                {
                  kind: "image",
                  id: "evi_img_1",
                  imageUid: "img_1",
                  entryUid: "entry_1",
                  chartLabel: "UJ H1 setup",
                  symbol: "USDJPY",
                  timeframe: "H1",
                  fileName: "chart.png",
                  fileUrl: "http://localhost/chart.png",
                  score: 0.91,
                },
              ],
              charts: [],
              memories: [],
              sources: [{ kind: "image", uid: "img_1" }],
              latencyMs: 5,
            };
          },
        },
      });

      await act(async () => {
        view.textarea.value = "show chart";
        view.textarea.dispatchEvent(new window.Event("input", { bubbles: true }));
      });

      await act(async () => {
        view.textarea.form.requestSubmit();
      });

      const previewButton = view.container.querySelector(".zen-pf-chart-preview-button");
      assert.ok(previewButton instanceof window.HTMLButtonElement);

      await act(async () => {
        previewButton.click();
      });

      assert.ok(view.container.querySelector(".zen-pf-chart-viewer"));

      await act(async () => {
        window.dispatchEvent(createKeydown("Escape"));
      });

      assert.equal(view.container.querySelector(".zen-pf-chart-viewer"), null);
      view.cleanup();
    }

    {
      const view = await renderGallery({
        clientOverrides: {
          async listLogImages() {
            return [
              {
                id: "db_img_1",
                imageUid: "img_1",
                entryUid: "entry_smoke",
                imageSlot: 1,
                chartLabel: "XAUUSD M30",
                symbol: "XAUUSD",
                timeframe: "M30",
                note: "Watch SMA20",
                fileName: "xauusd.png",
                fileUrl: "http://localhost/xauusd.png",
                mimeType: "image/png",
                fileSizeBytes: "1024",
                widthPx: 1280,
                heightPx: 720,
                createdAt: "2026-03-13T10:00:00.000Z",
                updatedAt: "2026-03-13T10:00:00.000Z",
              },
            ];
          },
        },
      });

      await act(async () => {
        await Promise.resolve();
      });

      const previewButton = view.container.querySelector(".zen-image-card__preview-button");
      assert.ok(previewButton instanceof window.HTMLButtonElement);

      await act(async () => {
        previewButton.click();
      });

      assert.ok(view.container.querySelector(".zen-pf-chart-viewer"));
      view.cleanup();
    }

    {
      const view = await renderGallery({
        clientOverrides: {
          async listRecentChartNotes() {
            return ["Executed Descending Pullback Short at H1 band."];
          },
        },
      });

      await act(async () => {
        await Promise.resolve();
      });

      const symbolInput = view.container.querySelector("#chart-upload-symbol-entry_smoke");
      const timeframeInput = view.container.querySelector("#chart-upload-timeframe-entry_smoke");
      const roleInput = view.container.querySelector("#chart-upload-role-entry_smoke");
      const labelInput = view.container.querySelector("#chart-upload-label-entry_smoke");
      const noteInput = view.container.querySelector("#chart-upload-note-entry_smoke");

      assert.ok(symbolInput instanceof window.HTMLInputElement);
      assert.ok(timeframeInput instanceof window.HTMLInputElement);
      assert.ok(roleInput instanceof window.HTMLInputElement);
      assert.ok(labelInput instanceof window.HTMLInputElement);
      assert.ok(noteInput instanceof window.HTMLTextAreaElement);

      await updateInput(symbolInput, "eurusd");
      await updateInput(timeframeInput, "h1");
      assert.equal(labelInput.value, "EURUSD H1 SETUP");

      await updateInput(roleInput, "entry");
      assert.equal(labelInput.value, "EURUSD H1 ENTRY");

      await updateInput(labelInput, "Custom Label");
      await updateInput(timeframeInput, "m30");
      assert.equal(labelInput.value, "Custom Label");

      const resetButton = [...view.container.querySelectorAll("button")].find((button) =>
        button.textContent?.includes("Use standard label"),
      );
      assert.ok(resetButton instanceof window.HTMLButtonElement);

      await act(async () => {
        resetButton.click();
      });
      assert.equal(labelInput.value, "EURUSD M30 ENTRY");

      await updateTextarea(noteInput, "desc");
      assert.ok(view.container.textContent.includes("Executed Descending Pullback Short at H1 band."));
      view.cleanup();
    }
  } finally {
    cleanupDom?.();
  }
}

async function runLoadingUxTests() {
  if (!JSDOM) {
    return;
  }

  let cleanupDom = null;

  try {
    cleanupDom = installDom();

    {
      let resolveRetrieve;
      const signalStore = createSignalStore();
      const view = await renderChatShell({
        signalStore,
        clientOverrides: {
          retrieve() {
            return new Promise((resolve) => {
              resolveRetrieve = resolve;
            });
          },
        },
      });

      await act(async () => {
        view.textarea.value = "long running query";
        view.textarea.dispatchEvent(new window.Event("input", { bubbles: true }));
      });

      await act(async () => {
        view.textarea.form.requestSubmit();
      });

      assert.ok(view.container.textContent.includes("🐡 Pupperfish đang xử lý..."));
      assert.ok(view.container.textContent.includes("Đang gửi truy vấn..."));

      await act(async () => {
        await new Promise((resolve) => window.setTimeout(resolve, 850));
      });

      assert.ok(view.container.textContent.includes("Đang phối hợp nhiều nguồn dữ liệu..."));

      await act(async () => {
        await new Promise((resolve) => window.setTimeout(resolve, 1600));
      });

      assert.ok(view.container.textContent.includes("Đang soạn câu trả lời..."));
      assert.equal(signalStore.read().pendingVisible, true);
      assert.equal(signalStore.read().pendingPhase, "generating");
      assert.ok((signalStore.read().pendingElapsedSec ?? 0) >= 2);

      await act(async () => {
        resolveRetrieve({
          requestUid: "req_pending",
          convoUid: "convo_pending",
          mode: "hybrid",
          answer: "Final answer",
          confidence: 0.81,
          assumptions: [],
          evidence: [],
          charts: [],
          memories: [],
          sources: [],
          latencyMs: 5,
        });
        await Promise.resolve();
      });

      assert.equal(view.container.textContent.includes("🐡 Pupperfish đang xử lý..."), false);
      assert.ok(view.container.textContent.includes("Final answer"));
      assert.equal(signalStore.read().pendingVisible, false);
      view.cleanup();
    }

    {
      const signalStore = createSignalStore({
        status: "thinking",
        pendingVisible: true,
        pendingPhase: "retrieving",
        pendingPlannerMode: "hybrid",
        pendingMessage: "Đang phối hợp nhiều nguồn dữ liệu...",
        pendingElapsedSec: 9,
        pendingSlow: true,
      });
      const view = await renderWidget({ signalStore });

      await act(async () => {
        const launcher = view.container.querySelector(".zen-pupperfish-launcher");
        launcher.click();
      });

      assert.ok(view.container.textContent.includes("Đang phối hợp nhiều nguồn dữ liệu..."));
      assert.ok(view.container.textContent.includes("⏱ 00:09"));
      view.cleanup();
    }
  } finally {
    cleanupDom?.();
  }
}

const dockHtml = renderToString(
  React.createElement(PupperfishDock, {
    status: "idle",
    confidence: 0.8,
    lowEvidence: false,
    label: "Pupperfish",
  }),
);
assert.ok(dockHtml.includes("Pupperfish"));

const galleryHtml = renderToString(
  React.createElement(TradeImageGalleryManager, {
    client: createClient(),
    entryUid: null,
    title: "Charts",
  }),
);
assert.ok(galleryHtml.includes("Charts"));

const viewerHtml = renderToString(
  React.createElement(PupperfishChartViewer, {
    items: [
      {
        id: "img_static",
        imageUid: "img_static",
        fileUrl: "http://localhost/chart.png",
        chartLabel: "Static viewer",
        symbol: "USDJPY",
        timeframe: "H1",
        note: "Smoke chart",
        imageSlot: 1,
        fileName: "chart.png",
        createdAt: "2026-03-13T10:00:00.000Z",
      },
    ],
    activeIndex: 0,
    open: true,
    onClose() {},
    onActiveIndexChange() {},
  }),
);
assert.ok(viewerHtml.includes("Chart Metadata"));
assert.ok(viewerHtml.includes("Static viewer"));

await runComposerKeyboardTests();
await runChartViewerTests();
await runLoadingUxTests();
if (!JSDOM) {
  console.log("react smoke: jsdom unavailable, DOM interaction tests skipped");
}
console.log("react smoke ok");
