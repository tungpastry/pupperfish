import assert from "node:assert/strict";

import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";

import {
  PupperfishChartViewer,
  PupperfishChatShell,
  PupperfishDock,
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

async function runComposerKeyboardTests() {
  if (!JSDOM) {
    return;
  }

  let cleanupDom = null;

  try {
    cleanupDom = installDom();

    {
      const view = await renderChatShell();
      const hint = view.container.querySelector("#pupperfish-query-hint");
      assert.equal(view.textarea.getAttribute("enterkeyhint"), "send");
      assert.equal(hint?.textContent?.trim(), "Enter để hỏi · Shift+Enter để xuống dòng");
      view.cleanup();
    }

    {
      const view = await renderChatShell({
        composerSubmitMode: "meta-enter-to-submit",
      });
      const hint = view.container.querySelector("#pupperfish-query-hint");
      assert.equal(view.textarea.getAttribute("enterkeyhint"), "enter");
      assert.equal(hint?.textContent?.trim(), "Ctrl/Cmd+Enter để hỏi · Enter để xuống dòng");
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
if (!JSDOM) {
  console.log("react smoke: jsdom unavailable, DOM interaction tests skipped");
}
console.log("react smoke ok");
