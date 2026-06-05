import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const supportedExtensions = new Set([".txt", ".md", ".jsonl"]);
const stopwords = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "but",
  "by",
  "for",
  "from",
  "how",
  "i",
  "in",
  "is",
  "it",
  "of",
  "on",
  "or",
  "that",
  "the",
  "this",
  "to",
  "what",
  "when",
  "where",
  "which",
  "with",
  "you",
  "your",
]);

let cachedIndex = null;

function envFlag(name, defaultValue = true) {
  const value = process.env[name];
  if (value == null || value === "") return defaultValue;
  return value.toLowerCase() === "true";
}

function numericEnv(name, defaultValue) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : defaultValue;
}

function sourceRoot() {
  const configured = process.env.RAG_SOURCES_DIR || "rag_sources/files";
  return path.isAbsolute(configured) ? configured : path.resolve(rootDir, configured);
}

function relativeSource(filePath) {
  return path.relative(rootDir, filePath).replace(/\\/g, "/");
}

function titleFromPath(filePath) {
  return path.basename(filePath, path.extname(filePath)).replace(/[-_]+/g, " ");
}

function tokenize(text) {
  return [...String(text).toLowerCase().matchAll(/[\p{L}\p{N}][\p{L}\p{N}-]*/gu)]
    .map((match) => match[0])
    .filter((token) => token.length > 2 && !stopwords.has(token));
}

function uniqueTokens(text) {
  return [...new Set(tokenize(text))];
}

function truncate(text, maxLength = 700) {
  const trimmed = String(text || "").replace(/\s+/g, " ").trim();
  return trimmed.length <= maxLength ? trimmed : `${trimmed.slice(0, maxLength - 3)}...`;
}

async function listSourceFiles(directory) {
  let entries;
  try {
    entries = await fs.readdir(directory, { withFileTypes: true });
  } catch {
    return [];
  }

  const files = [];
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listSourceFiles(entryPath));
      continue;
    }

    if (supportedExtensions.has(path.extname(entry.name).toLowerCase())) {
      files.push(entryPath);
    }
  }

  return files;
}

function chunkPlainText(text, metadata) {
  const paragraphs = String(text)
    .split(/\n\s*\n/g)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  const chunks = [];
  let buffer = "";
  let chunkIndex = 1;

  function flush() {
    const text = buffer.trim();
    if (!text) return;
    chunks.push({
      ...metadata,
      chunk_index: chunkIndex,
      text,
      tokens: uniqueTokens(text),
    });
    chunkIndex += 1;
    buffer = "";
  }

  for (const paragraph of paragraphs) {
    if (buffer.length + paragraph.length > 1200) flush();
    buffer = buffer ? `${buffer}\n\n${paragraph}` : paragraph;
  }
  flush();

  return chunks;
}

function parseJsonLine(line, filePath, index) {
  try {
    const parsed = JSON.parse(line);
    const text = parsed.text || parsed.chunk_text || parsed.content || "";
    if (!text.trim()) return null;
    return {
      title: parsed.title || titleFromPath(filePath),
      author: parsed.author || "",
      year: parsed.year || "",
      domain: parsed.domain || "",
      page: parsed.page || null,
      source_path: parsed.source_path || relativeSource(filePath),
      chunk_index: parsed.chunk_index || index + 1,
      text,
      tokens: uniqueTokens(text),
    };
  } catch {
    return null;
  }
}

async function chunksForFile(filePath) {
  const text = await fs.readFile(filePath, "utf8");
  const extension = path.extname(filePath).toLowerCase();

  if (extension === ".jsonl") {
    return text
      .split(/\r?\n/g)
      .map((line, index) => parseJsonLine(line, filePath, index))
      .filter(Boolean);
  }

  return chunkPlainText(text, {
    title: titleFromPath(filePath),
    author: "",
    year: "",
    domain: "",
    page: null,
    source_path: relativeSource(filePath),
  });
}

async function buildIndex() {
  const files = await listSourceFiles(sourceRoot());
  const chunks = [];
  for (const filePath of files) {
    chunks.push(...await chunksForFile(filePath));
  }

  return {
    built_at: new Date().toISOString(),
    source_count: files.length,
    chunk_count: chunks.length,
    chunks,
  };
}

async function loadIndex() {
  if (!cachedIndex) {
    cachedIndex = await buildIndex();
  }
  return cachedIndex;
}

function scoreChunk(queryTokens, chunk) {
  if (!queryTokens.length || !chunk.tokens?.length) return 0;
  const chunkTokenSet = new Set(chunk.tokens);
  let score = 0;
  for (const token of queryTokens) {
    if (chunkTokenSet.has(token)) score += 1;
  }
  return score / Math.sqrt(chunk.tokens.length);
}

function publicSource(chunk, score) {
  return {
    title: chunk.title,
    author: chunk.author || "",
    year: chunk.year || "",
    domain: chunk.domain || "",
    page: chunk.page ?? null,
    source_path: chunk.source_path,
    chunk_index: chunk.chunk_index,
    score: Number(score.toFixed(3)),
    excerpt: truncate(chunk.text),
  };
}

export async function retrieveGrounding({ query }) {
  if (!envFlag("RAG_ENABLED", true)) {
    return {
      grounding_mode: "rag_disabled",
      evidence_strength: "none",
      retrieved_sources: [],
      source_context: "",
      instruction:
        "RAG is disabled. Use clearly labeled general background when needed, while preserving the scaffolded learning flow.",
    };
  }

  const index = await loadIndex();
  const queryTokens = uniqueTokens(query);
  const topK = Math.max(1, Math.round(numericEnv("RAG_TOP_K", 3)));
  const minScore = numericEnv("RAG_MIN_SCORE", 1.2);
  const scored = index.chunks
    .map((chunk) => ({ chunk, score: scoreChunk(queryTokens, chunk) }))
    .filter((item) => item.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  if (!scored.length) {
    return {
      grounding_mode: "general_background_fallback",
      evidence_strength: index.chunk_count ? "weak" : "none",
      retrieved_sources: [],
      source_context: "",
      instruction:
        "I could not find enough support in the provided sources. Clearly label any helpful explanation as 'General background' and do not imply it came from the provided sources. Preserve the anti-offloading scaffold flow.",
      index_summary: {
        source_count: index.source_count,
        chunk_count: index.chunk_count,
      },
    };
  }

  const retrievedSources = scored.map(({ chunk, score }) => publicSource(chunk, score));
  const sourceContext = retrievedSources
    .map((source, index) => {
      const page = source.page ? `, page ${source.page}` : "";
      return `[Source ${index + 1}] ${source.title}${page} (${source.source_path})\n${source.excerpt}`;
    })
    .join("\n\n");

  return {
    grounding_mode: "source_grounded",
    evidence_strength: scored[0].score >= minScore * 1.8 ? "strong" : "moderate",
    retrieved_sources: retrievedSources,
    source_context: sourceContext,
    instruction:
      "Use retrieved source excerpts as the primary basis. Label source-based content as 'From the provided sources'. If you add general model knowledge, label it separately as 'General background'. Do not invent citations or claim support beyond the retrieved excerpts. Preserve the anti-offloading scaffold flow.",
    index_summary: {
      source_count: index.source_count,
      chunk_count: index.chunk_count,
    },
  };
}

export function clearRagIndexCache() {
  cachedIndex = null;
}
