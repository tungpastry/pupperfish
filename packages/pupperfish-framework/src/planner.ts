import type { PupperfishPlannerKeyword } from "./contracts.js";
import type { PupperfishPlannerMode } from "./types.js";
import { normalizeText } from "./normalize.js";

const DEFAULT_KEYWORDS: PupperfishPlannerKeyword[] = [
  { mode: "image", pattern: /\b(image|chart|anh|hinh|screenshot|candlestick|biểu đồ|bieu do)\b/i },
  { mode: "summary", pattern: /\b(summary|tong hop|tổng hợp|session|tokyo|london|newyork|today)\b/i },
  { mode: "memory", pattern: /\b(memory|ghi nho|nhớ|rule|quy tac|thoi quen|bai hoc)\b/i },
  { mode: "sql", pattern: /\b(log|entry|nhat ky|nhật ký|lenh|lệnh|trade)\b/i },
];

export function getDefaultPlannerKeywords(): PupperfishPlannerKeyword[] {
  return DEFAULT_KEYWORDS;
}

export function resolvePlannerMode(
  query: string,
  forcedMode?: string,
  keywords: PupperfishPlannerKeyword[] = DEFAULT_KEYWORDS,
): PupperfishPlannerMode {
  const forced = (forcedMode ?? "").trim().toLowerCase();
  if (forced === "sql" || forced === "summary" || forced === "memory" || forced === "image" || forced === "hybrid") {
    return forced;
  }

  const normalized = normalizeText(query);
  for (const item of keywords) {
    if (item.pattern.test(normalized)) {
      return item.mode;
    }
  }

  return "hybrid";
}
