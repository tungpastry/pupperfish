import { createHash } from "crypto";

export function normalizeText(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s_:/.-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function tokenizeText(input: string): string[] {
  const normalized = normalizeText(input);
  if (!normalized) {
    return [];
  }

  const tokens = normalized
    .split(/\s+/)
    .filter((token) => token.length >= 2)
    .slice(0, 64);

  return Array.from(new Set(tokens));
}

export function buildOutcomeCode(outcome: string): string | null {
  const normalized = normalizeText(outcome);
  if (!normalized) {
    return null;
  }

  if (/(done|xong|hoan thanh|completed|success|ok)/.test(normalized)) {
    return "done";
  }
  if (/(watch|theo doi|monitor|waiting|dang theo doi)/.test(normalized)) {
    return "watching";
  }
  if (/(fail|that bai|loi|error|miss)/.test(normalized)) {
    return "failed";
  }

  return null;
}

export function buildActionCode(nextAction: string | null | undefined): string | null {
  const normalized = normalizeText(nextAction ?? "");
  if (!normalized) {
    return null;
  }

  if (/(alert|canh bao|set alert)/.test(normalized)) {
    return "set_alert";
  }
  if (/(review|xem lai|kiem tra)/.test(normalized)) {
    return "review";
  }
  if (/(execute|vao lenh|entry|mo lenh)/.test(normalized)) {
    return "execute";
  }

  return normalized.slice(0, 40);
}

export function buildContextStruct(context: string | null | undefined): Record<string, unknown> {
  const source = context ?? "";
  const normalized = normalizeText(source);

  const symbolMatch = source.match(/\b([A-Z]{3,6}\/?[A-Z]{0,6})\b/);
  const timeframeMatch = source.match(/\b(M1|M5|M15|M30|H1|H4|D1|W1)\b/i);

  return {
    hasSma: /\bsma\d+/i.test(source),
    hasAlert: /(alert|canh bao)/i.test(source),
    symbol: symbolMatch?.[1] ?? null,
    timeframe: timeframeMatch?.[1]?.toUpperCase() ?? null,
    tokens: tokenizeText(normalized),
  };
}

export function createDeterministicUid(prefix: string, payload: string): string {
  const digest = createHash("sha1").update(payload).digest("hex");
  return `${prefix}_${digest.slice(0, 20)}`;
}

export function sanitizeList(input: string[]): string[] {
  return input.map((item) => item.trim()).filter(Boolean);
}
