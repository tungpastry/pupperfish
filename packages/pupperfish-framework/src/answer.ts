import type { PupperfishAiProvider, PupperfishRuntimeConfig } from "./contracts.js";
import type {
  PupperfishEvidenceItem,
  PupperfishImageEvidence,
  PupperfishMemoryEvidence,
  PupperfishPlannerMode,
} from "./types.js";

function evidenceLine(item: PupperfishEvidenceItem): string {
  if (item.kind === "log") {
    return `- [log:${item.entryUid}] ${item.dateText} ${item.timeText} | ${item.activity} | Outcome: ${item.outcome} | Next: ${item.nextAction ?? "(trống)"}`;
  }

  if (item.kind === "summary") {
    return `- [summary:${item.summaryUid}] ${item.summaryDate} ${item.scope} | ${item.summaryText}`;
  }

  if (item.kind === "memory") {
    return `- [memory:${item.memoryUid}] ${item.memoryType} | ${item.memoryText}`;
  }

  return `- [image:${item.imageUid}] ${item.chartLabel} ${item.symbol ?? ""} ${item.timeframe ?? ""}`.trim();
}

export async function composePupperfishAnswer(params: {
  aiProvider: PupperfishAiProvider;
  config: PupperfishRuntimeConfig;
  query: string;
  mode: PupperfishPlannerMode;
  evidence: PupperfishEvidenceItem[];
  memories: PupperfishMemoryEvidence[];
  charts: PupperfishImageEvidence[];
}): Promise<{ answer: string; assumptions: string[]; confidence: number }> {
  const assumptions: string[] = [];
  const assistantName = params.config.branding.assistantName || "Pupperfish";
  const productName = params.config.branding.productName || "host app";
  const language = params.config.answerPolicy?.language ?? "tiếng Việt";

  if (params.evidence.length < 1) {
    assumptions.push("Không có bằng chứng khớp mạnh; trả lời theo dữ liệu hạn chế.");
    return {
      answer: `Chưa tìm thấy bằng chứng đủ mạnh trong ${productName}. Bạn có thể ghi thêm dữ liệu hoặc cung cấp phạm vi thời gian cụ thể để truy vấn chính xác hơn.`,
      assumptions,
      confidence: 0.28,
    };
  }

  const prompt = [
    `Bạn là ${assistantName} assistant cho ${productName}.`,
    `Mode: ${params.mode}`,
    `User query: ${params.query}`,
    "Yêu cầu:",
    `1) Trả lời ngắn gọn bằng ${language}.`,
    "2) Chỉ dùng dữ kiện từ Evidence.",
    "3) Nếu chưa chắc, nói rõ giả định.",
    "4) Cuối câu trả lời thêm mục Nguồn: [kind:uid] cách nhau bằng dấu phẩy.",
    "Evidence:",
    ...params.evidence.map(evidenceLine),
  ].join("\n");

  try {
    const generated = await params.aiProvider.generateAnswer(prompt);
    const topScore = params.evidence[0]?.score ?? 0;
    const confidence = Math.max(0.25, Math.min(0.95, topScore));

    return {
      answer: generated.text,
      assumptions,
      confidence,
    };
  } catch {
    assumptions.push("Dùng fallback composer do generate service không phản hồi.");

    const sourceList = params.evidence
      .slice(0, 6)
      .map((item) => {
        if (item.kind === "log") {
          return `[log:${item.entryUid}]`;
        }
        if (item.kind === "summary") {
          return `[summary:${item.summaryUid}]`;
        }
        if (item.kind === "memory") {
          return `[memory:${item.memoryUid}]`;
        }
        return `[image:${item.imageUid}]`;
      })
      .join(", ");

    const keyPoints = params.evidence
      .slice(0, 3)
      .map((item) => {
        if (item.kind === "log") {
          return `- ${item.dateText} ${item.timeText}: ${item.activity} -> ${item.outcome}`;
        }
        if (item.kind === "summary") {
          return `- Summary ${item.summaryDate}/${item.scope}: ${item.summaryText}`;
        }
        if (item.kind === "memory") {
          return `- Memory ${item.memoryType}: ${item.memoryText}`;
        }
        return `- Image ${item.chartLabel} (${item.symbol ?? "n/a"} ${item.timeframe ?? ""})`;
      })
      .join("\n");

    return {
      answer: `Mình đã tổng hợp từ dữ liệu ${productName}:\n${keyPoints}\nNguồn: ${sourceList || "(không có)"}`,
      assumptions,
      confidence: Math.max(0.2, Math.min(0.9, params.evidence[0]?.score ?? 0.3)),
    };
  }
}
