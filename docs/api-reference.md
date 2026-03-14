# Pupperfish API reference

This document describes the **public integration surface** of the monorepo. It focuses on the contracts and exported entry points that a host app must understand.

## Package exports
### `@tungpastry/pupperfish-framework`
Primary exports from `src/index.ts`:
- `types`
- `contracts`
- `errors`
- `normalize`
- `planner`
- `embeddings`
- `answer`
- `runtime`

Key runtime factory:
- `createPupperfishRuntime(...)`

### `@tungpastry/pupperfish-react`
Primary exports from `src/index.ts`:
- `types`
- `pupperfishSignal`
- `PupperfishDock`
- `PupperfishWidgetShell`
- `PupperfishChatShell`
- `TradeImageGalleryManager`

Style entry:
- `@tungpastry/pupperfish-react/styles.css`

## Core framework contracts
### `PupperfishRepositories`
Your host app must implement repository methods for:
- `searchLogs`
- `searchSummaries`
- `searchMemories`
- `searchImages`
- `getLog`
- `getSummary`
- `getMemory`
- `getImage`
- `getSimilarImages`
- `listLogImages`
- `getLogImageTarget`
- `createImageForLog`
- `updateImage`
- `deleteImage`
- optional `recordConversation`

Practical meaning:
- the framework never owns the database
- the framework only orchestrates against your repository layer

### `PupperfishAiProvider`
Required:
- `generateAnswer(prompt)`

Optional:
- `embedText(text)`
- `embedImage(bytes)`

Practical meaning:
- you can plug in one provider for answer generation only
- or add embedding methods if your host app wants a single AI adapter surface

### `PupperfishStorageProvider`
Required methods:
- `persistImage(file)`
- `deletePersistedImage(persisted)`
- `deleteStoredImage(pointer)`
- `resolveStoredImagePath(pointer)`
- `buildImageDownloadUrl(imageUid)`

Practical meaning:
- the framework does not assume local disk, object storage, or CDN

### `PupperfishJobQueue`
Required methods:
- `enqueue`
- `enqueueMany`
- `runWorkerCycle`
- `onLogsChanged`
- `onImageChanged`
- `onSummaryChanged`

Practical meaning:
- the framework can trigger downstream work, but the host app still decides how jobs are stored and executed

### `PupperfishAuditLogger`
Required methods:
- `logRetrieveSuccess`
- `logRetrieveError`

Practical meaning:
- audit persistence is explicit, not hidden inside the framework

## Runtime methods
The runtime object returned by `createPupperfishRuntime(...)` exposes:
- `retrieve(input, userId?)`
- `searchLogs(query, filters, topK)`
- `searchSummaries(query, filters, topK)`
- `searchMemories(query, filters, topK)`
- `searchImages(query, topK)`
- `getLog(entryUid)`
- `getSummary(summaryUid)`
- `getMemory(memoryUid)`
- `getImage(imageUid)`
- `getSimilarImages(imageUid, topK)`
- `listLogImages(entryUid)`
- `uploadImage(entryUid, payload, userId?)`
- `updateImage(imageUid, payload)`
- `deleteImage(imageUid)`
- `runWorkerCycle(limit?)`
- `onLogChanged(logs)`
- `onImageChanged(imageId)`
- `onSummaryChanged(summaryId, sourceLogIds)`

### `retrieve(...)`
Input shape:
- `query`
- optional `mode`
- optional `topK`
- optional `convoUid`
- optional `filters`

Returns:
- `requestUid`
- `convoUid`
- resolved `mode`
- `answer`
- `confidence`
- `assumptions`
- `evidence`
- `charts`
- `memories`
- `sources`
- `latencyMs`

## Key shared types
Important framework types worth knowing:
- `PupperfishPlannerMode`
- `PupperfishEvidenceItem`
- `PupperfishRetrieveRequest`
- `PupperfishRetrieveResult`
- `PupperfishTradeImageItem`
- `PupperfishStoredImage`
- `PupperfishUpdateTradeImagePayload`
- `PupperfishWorkerCycleResult`

## React-side integration surface
### `PupperfishClient`
The React package expects a host-provided client with these methods:
- `retrieve(input)`
- `getLog(entryUid)`
- `listLogImages(entryUid)`
- `uploadLogImage(entryUid, payload)`
- `updateImage(imageUid, payload)`
- `deleteImage(imageUid)`

### `PupperfishChatShell`
Props:
- `client`
- `branding`
- optional `signalStore`
- optional `renderTradeImageManager`

Use it when you want a full-page assistant view with:
- query form
- mode selector
- answer stream/history
- evidence rail
- chart/image workflows

`renderTradeImageManager` lets a host app replace the default generic gallery manager with a product-specific upload/edit experience while keeping the rest of the shell intact.

### `PupperfishWidgetShell`
Props:
- `signalStore`
- `branding`

Use it when you want a compact launcher that reflects recent assistant state.

### `PupperfishDock`
Props:
- `status`
- `confidence`
- optional `lowEvidence`
- optional `compact`
- optional `label`
- optional `className`

Use it when you want a standalone status indicator.

### `TradeImageGalleryManager`
Props:
- `client`
- `entryUid`
- optional `title`
- optional `compact`

Use it when you want chart-image upload/edit/delete for a specific log entry.
This manager is intentionally generic. Host apps should inject domain-specific chart form UX through `PupperfishChatShell.renderTradeImageManager(...)` instead of extending the public package client contract.

## Styling
The React package ships CSS separately.

Import it explicitly:
```ts
import "@tungpastry/pupperfish-react/styles.css";
```

If you skip this import, the React components still render but lose their intended styling.
