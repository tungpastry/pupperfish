# Getting started

This tutorial shows the smallest credible way to integrate Pupperfish into a host app.

## 1. Install the packages
```bash
npm install @tungpastry/pupperfish-framework @tungpastry/pupperfish-react
```

## 2. Build a runtime in your host app
Your app must provide concrete implementations for repositories, AI, storage, jobs, and audit logging.

```ts
import { createPupperfishRuntime } from "@tungpastry/pupperfish-framework";

export const runtime = createPupperfishRuntime({
  repositories,
  aiProvider,
  storageProvider,
  jobQueue,
  auditLogger,
  config: {
    branding: {
      assistantName: "Pupperfish",
      productName: "My Host App",
    },
    answerPolicy: {
      language: "en",
      concise: true,
    },
    limits: {
      topKDefault: 8,
      topKMax: 20,
      uploadMaxBytes: 10 * 1024 * 1024,
      workerBatchLimit: 8,
    },
  },
});
```

## 3. Expose a host-app client
The React package talks to your app through `PupperfishClient`.

```ts
import type {
  PupperfishClient,
  UploadTradeImagePayload,
} from "@tungpastry/pupperfish-react";

export function createPupperfishClient(baseUrl = "/api/pupperfish"): PupperfishClient {
  return {
    async retrieve(input) {
      const response = await fetch(`${baseUrl}/retrieve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      return response.json();
    },
    async getLog(entryUid) {
      const response = await fetch(`${baseUrl}/logs/${entryUid}`);
      return response.json();
    },
    async listLogImages(entryUid) {
      const response = await fetch(`${baseUrl}/logs/${entryUid}/images`);
      return response.json();
    },
    async uploadLogImage(entryUid, payload: UploadTradeImagePayload) {
      const form = new FormData();
      form.append("file", payload.file);
      if (payload.chartLabel) form.append("chartLabel", payload.chartLabel);
      if (payload.symbol) form.append("symbol", payload.symbol);
      if (payload.timeframe) form.append("timeframe", payload.timeframe);
      if (payload.note) form.append("note", payload.note);

      const response = await fetch(`${baseUrl}/logs/${entryUid}/images`, {
        method: "POST",
        body: form,
      });
      return response.json();
    },
    async updateImage(imageUid, payload) {
      const response = await fetch(`${baseUrl}/images/${imageUid}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      return response.json();
    },
    async deleteImage(imageUid) {
      const response = await fetch(`${baseUrl}/images/${imageUid}`, {
        method: "DELETE",
      });
      return response.json();
    },
  };
}
```

## 4. Mount the chat shell
```tsx
import { PupperfishChatShell } from "@tungpastry/pupperfish-react";
import "@tungpastry/pupperfish-react/styles.css";

const client = createPupperfishClient();

export function PupperfishPage() {
  return (
    <PupperfishChatShell
      client={client}
      branding={{
        assistantName: "Pupperfish",
        assistantTitle: "Grounded retrieval assistant",
        productLabel: "My Host App",
      }}
    />
  );
}
```

## 5. Mount the chart-image manager for a log
```tsx
import { TradeImageGalleryManager } from "@tungpastry/pupperfish-react";

export function LogCharts({ entryUid }: { entryUid: string }) {
  return (
    <TradeImageGalleryManager
      client={client}
      entryUid={entryUid}
      title="Charts"
    />
  );
}
```

## 6. Add a signal store if you want the widget shell
```tsx
import {
  PupperfishWidgetShell,
  createLocalStoragePupperfishUiSignalStore,
} from "@tungpastry/pupperfish-react";

const signalStore = createLocalStoragePupperfishUiSignalStore("pupperfish-ui-signal");

<PupperfishWidgetShell
  signalStore={signalStore}
  branding={{
    assistantName: "Pupperfish",
    fullPageHref: "/pupperfish",
  }}
/>;
```

## 7. Sanity-check the integration
Before moving on, verify:
- `retrieve()` returns a grounded answer with evidence and sources
- chart uploads round-trip through your storage and repository adapters
- the widget shell reflects the latest signal written by the chat shell
- your host app logs retrieval success and failure through the audit logger
