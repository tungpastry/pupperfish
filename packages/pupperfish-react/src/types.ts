import type {
  PupperfishLogDetail,
  PupperfishPlannerMode,
  PupperfishRetrieveRequest,
  PupperfishRetrieveResult,
  PupperfishTradeImageItem,
  PupperfishUpdateTradeImagePayload,
} from "@tungpastry/pupperfish-framework";

export type PupperfishUiStatus = "idle" | "listening" | "thinking" | "answering" | "caution";
export type PupperfishEvidenceTab = "evidence" | "charts" | "uploads" | "saved";

export type AssistantRenderMeta = {
  confidence: number | null;
  assumptions: string[];
  evidenceCount: number;
  chartsCount: number;
  lowConfidence: boolean;
  lowEvidence: boolean;
};

export type ActiveMessageSelection = {
  messageId: string | null;
  tab: PupperfishEvidenceTab;
};

export type PupperfishUiSignal = {
  status: PupperfishUiStatus;
  confidence: number | null;
  lowEvidence: boolean;
  evidenceCount: number;
  chartsCount: number;
  hasError: boolean;
  mode: PupperfishPlannerMode | null;
  updatedAt: string;
};

export interface PupperfishUiSignalStore {
  read(): PupperfishUiSignal;
  write(signal: Partial<PupperfishUiSignal>): PupperfishUiSignal;
  subscribe(listener: () => void): () => void;
}

export type UploadTradeImagePayload = {
  file: File;
  chartLabel?: string | null;
  symbol?: string | null;
  timeframe?: string | null;
  note?: string | null;
};

export interface PupperfishClient {
  retrieve(input: PupperfishRetrieveRequest): Promise<PupperfishRetrieveResult>;
  getLog(entryUid: string): Promise<PupperfishLogDetail>;
  listLogImages(entryUid: string): Promise<PupperfishTradeImageItem[]>;
  uploadLogImage(entryUid: string, payload: UploadTradeImagePayload): Promise<PupperfishTradeImageItem>;
  updateImage(imageUid: string, payload: PupperfishUpdateTradeImagePayload): Promise<PupperfishTradeImageItem>;
  deleteImage(imageUid: string): Promise<{ imageUid: string; deleted: boolean }>;
}

export type PupperfishBranding = {
  assistantName: string;
  assistantTitle?: string;
  productLabel?: string;
  headline?: string;
  subtitle?: string;
  fullPageHref?: string;
  fullPageCta?: string;
  homeHref?: string;
  homeCta?: string;
  launcherLabel?: string;
};
