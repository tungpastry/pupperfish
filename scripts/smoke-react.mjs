import assert from "node:assert/strict";
import React from "react";
import { renderToString } from "react-dom/server";
import { PupperfishDock, TradeImageGalleryManager } from "../packages/pupperfish-react/dist/index.js";

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
    client: {
      async retrieve() { throw new Error("unused"); },
      async getLog() { throw new Error("unused"); },
      async listLogImages() { return []; },
      async uploadLogImage() { throw new Error("unused"); },
      async updateImage() { throw new Error("unused"); },
      async deleteImage() { throw new Error("unused"); },
    },
    entryUid: null,
    title: "Charts",
  }),
);
assert.ok(galleryHtml.includes("Charts"));
console.log("react smoke ok");
