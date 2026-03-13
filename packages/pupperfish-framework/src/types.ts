export type PupperfishPlannerMode = "sql" | "summary" | "memory" | "image" | "hybrid";

export type PupperfishEvidenceKind = "log" | "summary" | "memory" | "image";

export type PupperfishLogEvidence = {
  kind: "log";
  id: string;
  entryUid: string;
  dateText: string;
  timeText: string;
  activity: string;
  context: string | null;
  outcome: string;
  nextAction: string | null;
  moodEnergy: string | null;
  tags: string[];
  score: number;
};

export type PupperfishSummaryEvidence = {
  kind: "summary";
  id: string;
  summaryUid: string;
  summaryDate: string;
  scope: string;
  source: string;
  status: string;
  summaryText: string;
  nextAction: string | null;
  score: number;
};

export type PupperfishMemoryEvidence = {
  kind: "memory";
  id: string;
  memoryUid: string;
  memoryType: string;
  title: string | null;
  memoryText: string;
  importanceScore: number;
  confidenceScore: number;
  score: number;
};

export type PupperfishImageEvidence = {
  kind: "image";
  id: string;
  imageUid: string;
  entryUid: string;
  chartLabel: string;
  symbol: string | null;
  timeframe: string | null;
  note?: string | null;
  fileName: string;
  fileUrl: string | null;
  score: number;
};

export type PupperfishEvidenceItem =
  | PupperfishLogEvidence
  | PupperfishSummaryEvidence
  | PupperfishMemoryEvidence
  | PupperfishImageEvidence;

export type PupperfishRetrieveRequest = {
  query: string;
  mode?: PupperfishPlannerMode;
  topK?: number;
  convoUid?: string;
  filters?: Record<string, unknown>;
};

export type PupperfishRetrieveSource = {
  kind: PupperfishEvidenceKind;
  uid: string;
};

export type PupperfishRetrieveResult = {
  requestUid: string;
  convoUid: string;
  mode: PupperfishPlannerMode;
  answer: string;
  confidence: number;
  assumptions: string[];
  evidence: PupperfishEvidenceItem[];
  charts: PupperfishImageEvidence[];
  memories: PupperfishMemoryEvidence[];
  sources: PupperfishRetrieveSource[];
  latencyMs: number;
};

export type WorkerJobType =
  | "text_embedding_job"
  | "summary_embedding_job"
  | "image_embedding_job"
  | "memory_extraction_job"
  | "summary_linking_job"
  | "summary_memory_job"
  | "reembed_backfill_job";

export type WorkerJobPayload = Record<string, unknown>;

export type WorkerJob = {
  id: string;
  jobType: WorkerJobType;
  payload: WorkerJobPayload;
  retryCount: number;
  maxRetries: number;
};

export type QueryLogFilters = {
  fromDate?: string;
  toDate?: string;
  tag?: string;
  activity?: string;
  context?: string;
  outcome?: string;
  timeFrom?: string;
  timeTo?: string;
};

export type QuerySummaryFilters = {
  scope?: string;
  source?: string;
  status?: string;
  fromDate?: string;
  toDate?: string;
};

export type QueryMemoryFilters = {
  memoryType?: string;
  sourceType?: string;
  status?: string;
};

export type PupperfishLogDetail = {
  entryUid: string;
  dateText: string;
  timeText: string;
  activity: string;
  outcome: string;
  nextAction: string | null;
  tags: string[];
};

export type PupperfishTradeImageItem = {
  id: string;
  imageUid: string;
  entryUid: string;
  imageSlot: number;
  chartLabel: string;
  symbol: string | null;
  timeframe: string | null;
  note: string | null;
  fileName: string;
  fileUrl: string | null;
  mimeType: string;
  fileSizeBytes: string | null;
  widthPx: number | null;
  heightPx: number | null;
  createdAt: string;
  updatedAt: string;
};

export type PupperfishStoredImagePointer = {
  filePath: string | null;
  meta?: unknown;
};

export type PupperfishStoredImage = PupperfishTradeImageItem &
  PupperfishStoredImagePointer & {
    entry: {
      id: string;
      entryUid: string;
      dateText: string;
      timeText: string;
      activity: string;
      outcome: string;
    };
  };

export type PupperfishUpdateTradeImagePayload = {
  chartLabel?: string | null;
  symbol?: string | null;
  timeframe?: string | null;
  note?: string | null;
  imageSlot?: number | null;
};

export type PupperfishDeleteImageResult = {
  imageUid: string;
  deleted: boolean;
};

export type PupperfishLogImageTarget = {
  entryId: string;
  entryUid: string;
  occupiedSlots: number[];
};

export type PupperfishPersistedImage = {
  imageUid: string;
  absolutePath: string;
  relativePath: string;
  fileName: string;
  fileSizeBytes: bigint | string;
  mimeType: string;
  sha256: string;
};

export type PupperfishCreateImageInput = {
  imageUid: string;
  entryId: string;
  entryUid: string;
  imageSlot: number;
  chartLabel: string;
  symbol: string | null;
  timeframe: string | null;
  note: string | null;
  filePath: string;
  fileUrl: string | null;
  fileName: string;
  mimeType: string;
  fileSizeBytes: bigint | string | null;
  sha256: string | null;
  uploadedBy: string;
  relativePath: string | null;
};

export type PupperfishConversationTurn = {
  role: "user" | "assistant";
  content: string;
  metadata?: Record<string, unknown>;
};

export type PupperfishWorkerCycleResult = {
  claimed: number;
  done: number;
  failed: number;
};
