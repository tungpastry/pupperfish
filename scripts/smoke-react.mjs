import assert from "node:assert/strict";

import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";

import {
  PupperfishChatShell,
  PupperfishDock,
  TradeImageGalleryManager,
  shouldSubmitComposerKey,
} from "../packages/pupperfish-react/dist/index.js";

const { JSDOM } = await import(process.env.PUPPERFISH_JSDOM_ENTRY ?? "jsdom");

function installDom() {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "http://localhost",
  });

  const { window } = dom;
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
    HTMLTextAreaElement: window.HTMLTextAreaElement,
    HTMLFormElement: window.HTMLFormElement,
    Event: window.Event,
    KeyboardEvent: window.KeyboardEvent,
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

await runComposerKeyboardTests();
console.log("react smoke ok");
