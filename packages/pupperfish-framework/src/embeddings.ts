import { createHash } from "crypto";

export function cosineSimilarity(a: number[], b: number[]): number {
  if (!a.length || !b.length || a.length !== b.length) {
    return 0;
  }

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let index = 0; index < a.length; index += 1) {
    dot += a[index] * b[index];
    normA += a[index] * a[index];
    normB += b[index] * b[index];
  }

  if (normA === 0 || normB === 0) {
    return 0;
  }

  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export function deterministicEmbeddingFromText(text: string, dimensions = 64): number[] {
  const out = new Array<number>(dimensions).fill(0);
  if (!text.trim()) {
    return out;
  }

  const hash = createHash("sha256").update(text).digest();
  for (let index = 0; index < dimensions; index += 1) {
    const base = hash[index % hash.length] ?? 0;
    out[index] = (base / 255) * 2 - 1;
  }

  return normalizeVector(out);
}

export function deterministicEmbeddingFromBuffer(buffer: Buffer, dimensions = 64): number[] {
  const out = new Array<number>(dimensions).fill(0);
  if (buffer.length < 1) {
    return out;
  }

  for (let index = 0; index < dimensions; index += 1) {
    const value = buffer[index % buffer.length] ?? 0;
    out[index] = (value / 255) * 2 - 1;
  }

  return normalizeVector(out);
}

export function normalizeVector(vector: number[]): number[] {
  let norm = 0;
  for (const value of vector) {
    norm += value * value;
  }

  if (norm === 0) {
    return vector;
  }

  const sqrt = Math.sqrt(norm);
  return vector.map((value) => value / sqrt);
}

export function coerceNumberArray(input: unknown): number[] {
  if (!Array.isArray(input)) {
    return [];
  }

  return input
    .map((value) => (typeof value === "number" && Number.isFinite(value) ? value : null))
    .filter((value): value is number => value !== null);
}
