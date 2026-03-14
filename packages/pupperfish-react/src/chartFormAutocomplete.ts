export const CHART_SYMBOLS = [
  "EURUSD",
  "USDJPY",
  "EURJPY",
  "GBPUSD",
  "GBPNZD",
  "GBPAUD",
  "AUDUSD",
  "XAUUSD",
  "BTCUSD",
] as const;

export const CHART_TIMEFRAMES = ["D1", "H4", "H1", "M30", "M15", "M5"] as const;

export const CHART_ROLES = ["SETUP", "ENTRY", "TRIGGER", "RESULT"] as const;

export type ChartRole = (typeof CHART_ROLES)[number];

export type ChartSuggestionGroup =
  | "symbols"
  | "timeframes"
  | "roles"
  | "recent"
  | "nexus"
  | "generic";

export type ChartSuggestionItem = {
  id: string;
  value: string;
  group: ChartSuggestionGroup;
  summary?: string;
};

export const NEXUS_NOTE_TEMPLATES = [
  "Executed Nexus setup: BE M15 + LWR M30 at M30 band.",
  "Executed Nexus setup: BE M15 + LWR M30 at M30 band. Closed with profit.",
  "Executed Nexus setup: BE M15 + LWR M30 at M30 band. Closed with loss.",
] as const;

export const GENERIC_NOTE_TEMPLATES = [
  "Monitoring possible M30 rejection setup.",
  "Monitoring price behavior inside H1 band.",
  "Monitoring price behavior inside M30 band.",
  "Executed Descending Pullback Short at M30 band.",
  "Executed Descending Pullback Short at M30 band. Closed with profit.",
  "Executed Descending Pullback Short at M30 band. Closed with loss.",
  "Executed Descending Pullback Short at H1 band.",
  "Executed Descending Pullback Short at H1 band. Closed with profit.",
  "Executed Descending Pullback Short at H1 band. Closed with loss.",
] as const;

const MAX_GROUP_ITEMS = 6;

function normalizeInput(value: string | null | undefined): string {
  return (value ?? "").trim();
}

function normalizeUpper(value: string | null | undefined): string {
  return normalizeInput(value).toUpperCase();
}

function scoreCandidate(candidate: string, query: string): number {
  const normalizedCandidate = candidate.toLowerCase();
  const normalizedQuery = query.toLowerCase().trim();
  if (!normalizedQuery) {
    return 1;
  }

  if (normalizedCandidate.startsWith(normalizedQuery)) {
    return 400 - candidate.length;
  }

  const tokens = normalizedCandidate.split(/[^a-z0-9]+/).filter(Boolean);
  if (tokens.some((token) => token.startsWith(normalizedQuery))) {
    return 300 - candidate.length;
  }

  const containsIndex = normalizedCandidate.indexOf(normalizedQuery);
  if (containsIndex >= 0) {
    return 200 - containsIndex;
  }

  return 0;
}

function toSuggestionItems(
  values: readonly string[],
  query: string,
  group: ChartSuggestionGroup,
  summary?: string,
): ChartSuggestionItem[] {
  return values
    .map((value) => ({ value, score: scoreCandidate(value, query) }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || left.value.length - right.value.length)
    .slice(0, MAX_GROUP_ITEMS)
    .map((item) => ({
      id: `${group}:${item.value}`,
      value: item.value,
      group,
      summary,
    }));
}

function dedupeStrings(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const deduped: string[] = [];

  for (const value of values) {
    const normalized = normalizeInput(value);
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    deduped.push(normalized);
  }

  return deduped;
}

export function buildChartComboboxSuggestions(
  field: "symbol" | "timeframe" | "role",
  query: string,
): ChartSuggestionItem[] {
  if (field === "symbol") {
    return toSuggestionItems(CHART_SYMBOLS, query, "symbols");
  }

  if (field === "timeframe") {
    return toSuggestionItems(CHART_TIMEFRAMES, query, "timeframes");
  }

  return toSuggestionItems(CHART_ROLES, query, "roles");
}

export function buildNoteSuggestions(query: string, recentNotes: readonly string[]): ChartSuggestionItem[] {
  const recent = toSuggestionItems(dedupeStrings(recentNotes), query, "recent", "Recent");
  const nexus = toSuggestionItems(NEXUS_NOTE_TEMPLATES, query, "nexus", "Nexus template");
  const generic = toSuggestionItems(GENERIC_NOTE_TEMPLATES, query, "generic", "Template");

  const seen = new Set<string>();
  return [...recent, ...nexus, ...generic].filter((item) => {
    if (seen.has(item.value)) {
      return false;
    }
    seen.add(item.value);
    return true;
  });
}

export function generateChartLabel(symbol: string, timeframe: string, role: string): string {
  const normalizedSymbol = normalizeUpper(symbol);
  const normalizedTimeframe = normalizeUpper(timeframe);
  const normalizedRole = normalizeUpper(role);

  if (!normalizedSymbol || !normalizedTimeframe || !normalizedRole) {
    return "";
  }

  return `${normalizedSymbol} ${normalizedTimeframe} ${normalizedRole}`;
}

export function extractRoleFromChartLabel(label: string | null | undefined): ChartRole | null {
  const normalized = normalizeUpper(label);
  if (!normalized) {
    return null;
  }

  const lastToken = normalized.split(/\s+/).pop() ?? "";
  return (CHART_ROLES as readonly string[]).includes(lastToken) ? (lastToken as ChartRole) : null;
}

export function normalizeChartRole(value: string | null | undefined): ChartRole {
  const normalized = normalizeUpper(value);
  return (CHART_ROLES as readonly string[]).includes(normalized) ? (normalized as ChartRole) : "SETUP";
}

export function normalizeChartRoleInput(value: string | null | undefined): string {
  return normalizeUpper(value);
}

export function normalizeChartSymbol(value: string | null | undefined): string {
  return normalizeUpper(value);
}

export function normalizeChartTimeframe(value: string | null | undefined): string {
  return normalizeUpper(value);
}

export function isKnownChartSymbol(value: string | null | undefined): boolean {
  const normalized = normalizeChartSymbol(value);
  return !normalized || (CHART_SYMBOLS as readonly string[]).includes(normalized);
}

export function isKnownChartTimeframe(value: string | null | undefined): boolean {
  const normalized = normalizeChartTimeframe(value);
  return !normalized || (CHART_TIMEFRAMES as readonly string[]).includes(normalized);
}

export function isCanonicalChartLabel(label: string, symbol: string, timeframe: string, role: string): boolean {
  const normalizedLabel = normalizeInput(label);
  if (!normalizedLabel) {
    return false;
  }

  return normalizedLabel === generateChartLabel(symbol, timeframe, role);
}

export function buildChartFieldWarning(symbol: string, timeframe: string, role: string): string | null {
  if (!isKnownChartSymbol(symbol)) {
    return "Symbol nằm ngoài bộ chuẩn. Chart label có thể không canonical.";
  }

  if (!isKnownChartTimeframe(timeframe)) {
    return "Timeframe nằm ngoài bộ chuẩn. Chart label có thể không canonical.";
  }

  const normalizedRole = normalizeChartRoleInput(role);
  if (normalizedRole && !(CHART_ROLES as readonly string[]).includes(normalizedRole)) {
    return "Role không nằm trong bộ chuẩn.";
  }

  return null;
}

export function groupLabelForSuggestion(group: ChartSuggestionGroup): string {
  switch (group) {
    case "symbols":
      return "Symbols";
    case "timeframes":
      return "Timeframes";
    case "roles":
      return "Roles";
    case "recent":
      return "Recent";
    case "nexus":
      return "Nexus Templates";
    case "generic":
      return "Generic Templates";
    default:
      return "";
  }
}
