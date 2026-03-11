import type {
  PupperfishConversationTurn,
  PupperfishCreateImageInput,
  PupperfishDeleteImageResult,
  PupperfishImageEvidence,
  PupperfishLogDetail,
  PupperfishLogEvidence,
  PupperfishLogImageTarget,
  PupperfishMemoryEvidence,
  PupperfishPersistedImage,
  PupperfishPlannerMode,
  PupperfishStoredImage,
  PupperfishSummaryEvidence,
  PupperfishTradeImageItem,
  PupperfishUpdateTradeImagePayload,
  PupperfishWorkerCycleResult,
  QueryLogFilters,
  QueryMemoryFilters,
  QuerySummaryFilters,
  WorkerJobPayload,
  WorkerJobType,
} from "./types.js";

export type PupperfishUploadFile = {
  name: string;
  type: string;
  size: number;
  arrayBuffer: () => Promise<ArrayBuffer>;
};

export type PupperfishBrandingConfig = {
  assistantName: string;
  productName: string;
};

export type PupperfishPlannerKeyword = {
  mode: PupperfishPlannerMode;
  pattern: RegExp;
};

export type PupperfishRuntimeConfig = {
  branding: PupperfishBrandingConfig;
  locale?: string;
  plannerKeywords?: PupperfishPlannerKeyword[];
  answerPolicy?: {
    language?: string;
    concise?: boolean;
  };
  limits?: {
    topKDefault?: number;
    topKMax?: number;
    uploadMaxBytes?: number;
    workerBatchLimit?: number;
  };
};

export interface PupperfishRepositories {
  searchLogs(query: string, filters: QueryLogFilters, topK: number): Promise<PupperfishLogEvidence[]>;
  searchSummaries(query: string, filters: QuerySummaryFilters, topK: number): Promise<PupperfishSummaryEvidence[]>;
  searchMemories(query: string, filters: QueryMemoryFilters, topK: number): Promise<PupperfishMemoryEvidence[]>;
  searchImages(query: string, topK: number): Promise<PupperfishImageEvidence[]>;
  getLog(entryUid: string): Promise<PupperfishLogDetail | null>;
  getSummary(summaryUid: string): Promise<Record<string, unknown> | null>;
  getMemory(memoryUid: string): Promise<Record<string, unknown> | null>;
  getImage(imageUid: string): Promise<PupperfishStoredImage | null>;
  getSimilarImages(imageUid: string, topK: number): Promise<PupperfishImageEvidence[]>;
  listLogImages(entryUid: string): Promise<PupperfishTradeImageItem[] | null>;
  getLogImageTarget(entryUid: string): Promise<PupperfishLogImageTarget | null>;
  createImageForLog(input: PupperfishCreateImageInput): Promise<PupperfishStoredImage>;
  updateImage(imageUid: string, payload: PupperfishUpdateTradeImagePayload): Promise<PupperfishStoredImage>;
  deleteImage(imageUid: string): Promise<PupperfishDeleteImageResult>;
  recordConversation?(params: {
    convoUid: string;
    userId: string;
    requestUid: string;
    turns: PupperfishConversationTurn[];
  }): Promise<void>;
}

export interface PupperfishAiProvider {
  embedText?(text: string): Promise<{ embedding: number[]; model: string; source: string }>;
  embedImage?(bytes: Uint8Array): Promise<{ embedding: number[]; model: string; source: string }>;
  generateAnswer(prompt: string): Promise<{ text: string; model: string; source: string }>;
}

export interface PupperfishStorageProvider {
  persistImage(file: PupperfishUploadFile): Promise<PupperfishPersistedImage>;
  deletePersistedImage(persisted: PupperfishPersistedImage): Promise<void>;
  deleteStoredImage(pointer: PupperfishStoredImage): Promise<void>;
  resolveStoredImagePath(pointer: PupperfishStoredImage): Promise<string>;
  buildImageDownloadUrl(imageUid: string): string;
}

export interface PupperfishJobQueue {
  enqueue(jobType: WorkerJobType, payload: WorkerJobPayload, priority?: number): Promise<void>;
  enqueueMany(
    jobs: Array<{ jobType: WorkerJobType; payload: WorkerJobPayload; priority?: number }>,
  ): Promise<void>;
  runWorkerCycle(limit: number): Promise<PupperfishWorkerCycleResult>;
  onLogsChanged(logs: Array<{ id: string }>): Promise<void>;
  onImageChanged(imageId: string): Promise<void>;
  onSummaryChanged(summaryId: string, sourceLogIds: string[]): Promise<void>;
}

export interface PupperfishAuditLogger {
  logRetrieveSuccess(params: {
    requestUid: string;
    userId: string;
    queryText: string;
    queryMode: PupperfishPlannerMode;
    entryUid: string | null;
    imageUid: string | null;
    summaryScope: string | null;
    filters: Record<string, unknown>;
    retrievedCount: number;
    latencyMs: number;
    responseJson: Record<string, unknown>;
    requestJson: Record<string, unknown>;
  }): Promise<void>;
  logRetrieveError(params: {
    requestUid: string;
    userId: string;
    queryText: string;
    queryMode: PupperfishPlannerMode;
    filters: Record<string, unknown>;
    errorCode: string;
    requestJson: Record<string, unknown>;
    responseJson: Record<string, unknown>;
  }): Promise<void>;
}
