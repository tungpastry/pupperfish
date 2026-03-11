import assert from "node:assert/strict";
import { createPupperfishRuntime } from "../packages/pupperfish-framework/dist/index.js";

const runtime = createPupperfishRuntime({
  repositories: {
    async searchLogs() {
      return [{
        kind: "log",
        id: "1",
        entryUid: "entry_1",
        dateText: "2026-03-11",
        timeText: "08:00",
        activity: "WATCH",
        context: "USDJPY H1",
        outcome: "ĐANG THEO DÕI",
        nextAction: "Set alert",
        moodEnergy: null,
        tags: ["log"],
        score: 0.8,
      }];
    },
    async searchSummaries() { return []; },
    async searchMemories() { return []; },
    async searchImages() { return []; },
    async getLog() { return null; },
    async getSummary() { return null; },
    async getMemory() { return null; },
    async getImage() { return null; },
    async getSimilarImages() { return []; },
    async listLogImages() { return []; },
    async getLogImageTarget() { return null; },
    async createImageForLog() { throw new Error("unused"); },
    async updateImage() { throw new Error("unused"); },
    async deleteImage() { throw new Error("unused"); },
    async recordConversation() {},
  },
  aiProvider: {
    async generateAnswer(prompt) {
      return { text: `ok:${prompt.includes("USDJPY")}`, model: "test", source: "smoke" };
    },
  },
  storageProvider: {
    async persistImage() { throw new Error("unused"); },
    async deletePersistedImage() {},
    async deleteStoredImage() {},
    async resolveStoredImagePath() { return "/tmp/test.png"; },
    buildImageDownloadUrl(imageUid) { return `/images/${imageUid}`; },
  },
  jobQueue: {
    async enqueue() {},
    async enqueueMany() {},
    async runWorkerCycle() { return { claimed: 0, done: 0, failed: 0 }; },
    async onLogsChanged() {},
    async onImageChanged() {},
    async onSummaryChanged() {},
  },
  auditLogger: {
    async logRetrieveSuccess() {},
    async logRetrieveError() {},
  },
  config: {
    branding: { assistantName: "Pupperfish", productName: "Smoke" },
  },
});

const result = await runtime.retrieve({ query: "USDJPY H1" }, "smoke-user");
assert.equal(result.mode, "hybrid");
assert.ok(result.answer.startsWith("ok:true"));
console.log("framework smoke ok");
