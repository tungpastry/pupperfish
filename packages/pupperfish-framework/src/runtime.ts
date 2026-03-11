import { randomUUID } from "crypto";

import type {
  PupperfishAiProvider,
  PupperfishAuditLogger,
  PupperfishJobQueue,
  PupperfishRepositories,
  PupperfishRuntimeConfig,
  PupperfishStorageProvider,
  PupperfishUploadFile,
} from "./contracts.js";
import { PupperfishError } from "./errors.js";
import { composePupperfishAnswer } from "./answer.js";
import { getDefaultPlannerKeywords, resolvePlannerMode } from "./planner.js";
import type {
  PupperfishEvidenceItem,
  PupperfishPlannerMode,
  PupperfishRetrieveRequest,
  PupperfishRetrieveResult,
  PupperfishRetrieveSource,
  PupperfishTradeImageItem,
  PupperfishUpdateTradeImagePayload,
  QueryLogFilters,
  QueryMemoryFilters,
  QuerySummaryFilters,
} from "./types.js";

function trimQuery(query: unknown): string {
  return typeof query === "string" ? query.trim() : "";
}

function readFilterString(filters: Record<string, unknown>, key: string): string | undefined {
  const value = filters[key];
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim();
  return normalized || undefined;
}

function parseFilters(input: PupperfishRetrieveRequest): {
  logFilters: QueryLogFilters;
  summaryFilters: QuerySummaryFilters;
  memoryFilters: QueryMemoryFilters;
} {
  const raw = input.filters && typeof input.filters === "object" ? (input.filters as Record<string, unknown>) : {};

  return {
    logFilters: {
      fromDate: readFilterString(raw, "fromDate"),
      toDate: readFilterString(raw, "toDate"),
      tag: readFilterString(raw, "tag"),
      activity: readFilterString(raw, "activity"),
      context: readFilterString(raw, "context"),
      outcome: readFilterString(raw, "outcome"),
      timeFrom: readFilterString(raw, "timeFrom"),
      timeTo: readFilterString(raw, "timeTo"),
    },
    summaryFilters: {
      scope: readFilterString(raw, "scope"),
      source: readFilterString(raw, "source"),
      status: readFilterString(raw, "status"),
      fromDate: readFilterString(raw, "fromDate"),
      toDate: readFilterString(raw, "toDate"),
    },
    memoryFilters: {
      memoryType: readFilterString(raw, "memoryType"),
      sourceType: readFilterString(raw, "sourceType"),
      status: readFilterString(raw, "status"),
    },
  };
}

function clampTopK(value: unknown, config: PupperfishRuntimeConfig): number {
  const fallback = config.limits?.topKDefault ?? 8;
  const max = config.limits?.topKMax ?? 20;
  const numeric = typeof value === "number" ? value : Number(value ?? fallback);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.min(Math.max(Math.trunc(numeric), 1), max);
}

function evidenceKey(item: PupperfishEvidenceItem): string {
  if (item.kind === "log") {
    return `log:${item.entryUid}`;
  }
  if (item.kind === "summary") {
    return `summary:${item.summaryUid}`;
  }
  if (item.kind === "memory") {
    return `memory:${item.memoryUid}`;
  }
  return `image:${item.imageUid}`;
}

function rankEvidence(items: PupperfishEvidenceItem[], topK: number): PupperfishEvidenceItem[] {
  const bestByKey = new Map<string, PupperfishEvidenceItem>();

  for (const item of items) {
    const key = evidenceKey(item);
    const previous = bestByKey.get(key);
    if (!previous || item.score > previous.score) {
      bestByKey.set(key, item);
    }
  }

  return [...bestByKey.values()]
    .sort((left, right) => right.score - left.score)
    .slice(0, topK);
}

function modeUsesLogs(mode: PupperfishPlannerMode): boolean {
  return mode === "sql" || mode === "hybrid";
}

function modeUsesSummaries(mode: PupperfishPlannerMode): boolean {
  return mode === "summary" || mode === "hybrid";
}

function modeUsesMemories(mode: PupperfishPlannerMode): boolean {
  return mode === "memory" || mode === "hybrid";
}

function modeUsesImages(mode: PupperfishPlannerMode): boolean {
  return mode === "image" || mode === "hybrid";
}

function buildSources(evidence: PupperfishEvidenceItem[]): PupperfishRetrieveSource[] {
  return evidence.map((item) => {
    if (item.kind === "log") {
      return { kind: "log", uid: item.entryUid };
    }
    if (item.kind === "summary") {
      return { kind: "summary", uid: item.summaryUid };
    }
    if (item.kind === "memory") {
      return { kind: "memory", uid: item.memoryUid };
    }
    return { kind: "image", uid: item.imageUid };
  });
}

function normalizeUploadText(value: string | null | undefined): string | null {
  const normalized = (value ?? "").trim();
  return normalized || null;
}

function parseImageSlot(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === "") {
    return null;
  }

  const parsed = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(parsed)) {
    throw new PupperfishError("PUPPERFISH_IMAGE_SLOT_INVALID", "imageSlot phải là số nguyên dương.", 400);
  }

  return Math.max(1, Math.trunc(parsed));
}

export function createPupperfishRuntime(params: {
  repositories: PupperfishRepositories;
  aiProvider: PupperfishAiProvider;
  storageProvider: PupperfishStorageProvider;
  jobQueue: PupperfishJobQueue;
  auditLogger: PupperfishAuditLogger;
  config: PupperfishRuntimeConfig;
}) {
  const { repositories, aiProvider, storageProvider, jobQueue, auditLogger, config } = params;
  const plannerKeywords = config.plannerKeywords ?? getDefaultPlannerKeywords();
  const uploadMaxBytes = config.limits?.uploadMaxBytes ?? 10 * 1024 * 1024;

  async function retrieve(input: PupperfishRetrieveRequest, userId = "admin"): Promise<PupperfishRetrieveResult> {
    const query = trimQuery(input.query);
    if (!query) {
      throw new PupperfishError("PUPPERFISH_QUERY_REQUIRED", "query không được để trống.", 400);
    }

    const requestUid = randomUUID();
    const convoUid = typeof input.convoUid === "string" && input.convoUid.trim() ? input.convoUid.trim() : randomUUID();
    const topK = clampTopK(input.topK, config);
    const mode = resolvePlannerMode(query, input.mode, plannerKeywords);
    const { logFilters, summaryFilters, memoryFilters } = parseFilters(input);
    const startedAt = Date.now();

    try {
      const logsPromise = modeUsesLogs(mode) ? repositories.searchLogs(query, logFilters, Math.max(6, topK)) : Promise.resolve([]);
      const summariesPromise = modeUsesSummaries(mode)
        ? repositories.searchSummaries(query, summaryFilters, Math.max(4, Math.floor(topK * 0.75)))
        : Promise.resolve([]);
      const memoriesPromise = modeUsesMemories(mode)
        ? repositories.searchMemories(query, memoryFilters, Math.max(4, Math.floor(topK * 0.75)))
        : Promise.resolve([]);
      const imagesPromise = modeUsesImages(mode) ? repositories.searchImages(query, Math.max(4, topK)) : Promise.resolve([]);

      const [logs, summaries, memories, images] = await Promise.all([logsPromise, summariesPromise, memoriesPromise, imagesPromise]);

      let evidence = rankEvidence([...logs, ...summaries, ...memories, ...images], topK);
      const needsFallbackMerge = evidence.length < 1 || (mode === "hybrid" && evidence.length < Math.min(2, topK));
      let fallbackEvidenceUsed = false;

      if (needsFallbackMerge) {
        const [fallbackLogs, fallbackSummaries, fallbackMemories, fallbackImages] = await Promise.all([
          modeUsesLogs(mode) ? repositories.searchLogs("", logFilters, Math.max(4, topK)) : Promise.resolve([]),
          modeUsesSummaries(mode)
            ? repositories.searchSummaries("", summaryFilters, Math.max(3, Math.floor(topK * 0.75)))
            : Promise.resolve([]),
          modeUsesMemories(mode)
            ? repositories.searchMemories("", memoryFilters, Math.max(3, Math.floor(topK * 0.75)))
            : Promise.resolve([]),
          modeUsesImages(mode) ? repositories.searchImages("", Math.max(3, topK)) : Promise.resolve([]),
        ]);

        const merged = rankEvidence(
          [...evidence, ...fallbackLogs, ...fallbackSummaries, ...fallbackMemories, ...fallbackImages],
          topK,
        );

        fallbackEvidenceUsed = merged.length > evidence.length;
        evidence = merged;
      }

      const composed = await composePupperfishAnswer({
        aiProvider,
        config,
        query,
        mode,
        evidence,
        memories,
        charts: images,
      });

      const sources = buildSources(evidence);
      const latencyMs = Date.now() - startedAt;

      if (repositories.recordConversation) {
        await repositories.recordConversation({
          convoUid,
          userId,
          requestUid,
          turns: [
            {
              role: "user",
              content: query,
              metadata: { source: "pupperfish", requestUid },
            },
            {
              role: "assistant",
              content: composed.answer,
              metadata: { source: "pupperfish", requestUid, mode, fallbackEvidenceUsed },
            },
          ],
        });
      }

      await auditLogger.logRetrieveSuccess({
        requestUid,
        userId,
        queryText: query,
        queryMode: mode,
        entryUid: evidence.find((item) => item.kind === "log")?.entryUid ?? null,
        imageUid: evidence.find((item) => item.kind === "image")?.imageUid ?? null,
        summaryScope: evidence.find((item) => item.kind === "summary")?.scope ?? null,
        filters: input.filters ?? {},
        retrievedCount: evidence.length,
        latencyMs,
        requestJson: input as Record<string, unknown>,
        responseJson: {
          mode,
          sources,
          confidence: composed.confidence,
          fallbackEvidenceUsed,
        },
      });

      return {
        requestUid,
        convoUid,
        mode,
        answer: composed.answer,
        confidence: composed.confidence,
        assumptions: composed.assumptions,
        evidence,
        charts: images,
        memories,
        sources,
        latencyMs,
      };
    } catch (error) {
      const code = error instanceof PupperfishError ? error.code : "PUPPERFISH_RETRIEVE_FAILED";
      await auditLogger.logRetrieveError({
        requestUid,
        userId,
        queryText: query,
        queryMode: mode,
        filters: input.filters ?? {},
        errorCode: code,
        requestJson: input as Record<string, unknown>,
        responseJson: {
          error: error instanceof Error ? error.message : String(error),
        },
      });
      throw error;
    }
  }

  async function uploadImage(
    entryUid: string,
    payload: {
      file: PupperfishUploadFile;
      chartLabel?: string | null;
      symbol?: string | null;
      timeframe?: string | null;
      note?: string | null;
      imageSlot?: number | null;
    },
    userId = "admin",
  ): Promise<PupperfishTradeImageItem> {
    const normalizedEntryUid = entryUid.trim();
    if (!normalizedEntryUid) {
      throw new PupperfishError("PUPPERFISH_ENTRY_UID_INVALID", "entryUid không hợp lệ.", 400);
    }

    if (!payload.file) {
      throw new PupperfishError("PUPPERFISH_IMAGE_FILE_REQUIRED", "Thiếu file upload.", 400);
    }
    if (payload.file.size < 1) {
      throw new PupperfishError("PUPPERFISH_IMAGE_EMPTY", "File ảnh rỗng.", 400);
    }
    if (!payload.file.type || !payload.file.type.toLowerCase().startsWith("image/")) {
      throw new PupperfishError("PUPPERFISH_IMAGE_FILE_INVALID_TYPE", "Chỉ chấp nhận file ảnh (image/*).", 400);
    }
    if (payload.file.size > uploadMaxBytes) {
      throw new PupperfishError("PUPPERFISH_IMAGE_FILE_TOO_LARGE", `Dung lượng ảnh tối đa là ${Math.trunc(uploadMaxBytes / (1024 * 1024))}MB.`, 400);
    }

    const target = await repositories.getLogImageTarget(normalizedEntryUid);
    if (!target) {
      throw new PupperfishError("PUPPERFISH_LOG_NOT_FOUND", "Không tìm thấy log theo entryUid.", 404);
    }

    const requestedSlot = parseImageSlot(payload.imageSlot);
    const occupied = new Set(target.occupiedSlots);
    if (requestedSlot && occupied.has(requestedSlot)) {
      throw new PupperfishError("PUPPERFISH_IMAGE_SLOT_CONFLICT", "imageSlot đã tồn tại cho log này.", 409);
    }

    const imageSlot = requestedSlot ?? (target.occupiedSlots.length > 0 ? Math.max(...target.occupiedSlots) + 1 : 1);
    const persisted = await storageProvider.persistImage(payload.file);

    try {
      const created = await repositories.createImageForLog({
        imageUid: persisted.imageUid,
        entryId: target.entryId,
        entryUid: target.entryUid,
        imageSlot,
        chartLabel: normalizeUploadText(payload.chartLabel)?.slice(0, 120) ?? "Chart",
        symbol: normalizeUploadText(payload.symbol),
        timeframe: normalizeUploadText(payload.timeframe)?.toUpperCase() ?? null,
        note: normalizeUploadText(payload.note),
        filePath: persisted.absolutePath,
        fileUrl: storageProvider.buildImageDownloadUrl(persisted.imageUid),
        fileName: persisted.fileName,
        mimeType: persisted.mimeType,
        fileSizeBytes: persisted.fileSizeBytes,
        sha256: persisted.sha256,
        uploadedBy: userId,
        relativePath: persisted.relativePath,
      });

      await jobQueue.onImageChanged(created.id);
      return created;
    } catch (error) {
      await storageProvider.deletePersistedImage(persisted);
      throw error;
    }
  }

  async function updateImage(imageUid: string, payload: PupperfishUpdateTradeImagePayload): Promise<PupperfishTradeImageItem> {
    const normalizedUid = imageUid.trim();
    if (!normalizedUid) {
      throw new PupperfishError("PUPPERFISH_IMAGE_UID_INVALID", "imageUid không hợp lệ.", 400);
    }

    const updated = await repositories.updateImage(normalizedUid, payload);
    await jobQueue.onImageChanged(updated.id);
    return updated;
  }

  async function deleteImage(imageUid: string) {
    const normalizedUid = imageUid.trim();
    if (!normalizedUid) {
      throw new PupperfishError("PUPPERFISH_IMAGE_UID_INVALID", "imageUid không hợp lệ.", 400);
    }

    const image = await repositories.getImage(normalizedUid);
    if (!image) {
      throw new PupperfishError("PUPPERFISH_IMAGE_NOT_FOUND", "Không tìm thấy ảnh theo imageUid.", 404);
    }

    await storageProvider.deleteStoredImage(image);
    return repositories.deleteImage(normalizedUid);
  }

  return {
    retrieve,
    searchLogs: repositories.searchLogs,
    searchSummaries: repositories.searchSummaries,
    searchMemories: repositories.searchMemories,
    searchImages: repositories.searchImages,
    getLog: repositories.getLog,
    getSummary: repositories.getSummary,
    getMemory: repositories.getMemory,
    getImage: repositories.getImage,
    getSimilarImages: repositories.getSimilarImages,
    listLogImages: repositories.listLogImages,
    uploadImage,
    updateImage,
    deleteImage,
    runWorkerCycle(limit?: number) {
      return jobQueue.runWorkerCycle(limit ?? config.limits?.workerBatchLimit ?? 8);
    },
    onLogChanged(logs: Array<{ id: string }>) {
      return jobQueue.onLogsChanged(logs);
    },
    onImageChanged(imageId: string) {
      return jobQueue.onImageChanged(imageId);
    },
    onSummaryChanged(summaryId: string, sourceLogIds: string[]) {
      return jobQueue.onSummaryChanged(summaryId, sourceLogIds);
    },
  };
}
