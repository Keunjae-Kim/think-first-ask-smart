import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

function envFlag(name, defaultValue = false) {
  const value = process.env[name];
  if (value == null || value === "") return defaultValue;
  return value.toLowerCase() === "true";
}

function logDir() {
  const configured = process.env.USAGE_LOG_DIR || "logs";
  return path.isAbsolute(configured) ? configured : path.resolve(rootDir, configured);
}

function dateStamp(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function toIso(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return null;
  return new Date(number).toISOString();
}

function safeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function clampNonNegative(value) {
  const number = safeNumber(value);
  return number == null ? null : Math.max(0, Math.round(number));
}

function textStats(text) {
  const value = typeof text === "string" ? text : "";
  const trimmed = value.trim();
  return {
    char_count: value.length,
    word_count: trimmed ? trimmed.split(/\s+/u).length : 0,
    has_korean: /[\uac00-\ud7af]/u.test(value),
  };
}

function normalizeClientTiming(clientMeta = {}) {
  const viewport = clientMeta.viewport && typeof clientMeta.viewport === "object" ? clientMeta.viewport : {};

  return {
    page_loaded_at: toIso(clientMeta.pageLoadedAt),
    last_assistant_at: toIso(clientMeta.lastAssistantAt),
    message_created_at: toIso(clientMeta.messageCreatedAt),
    dwell_ms: clampNonNegative(clientMeta.dwellMs),
    client_turn_index: safeNumber(clientMeta.turnIndex),
    browser_language:
      typeof clientMeta.browserLanguage === "string" ? clientMeta.browserLanguage.slice(0, 40) : null,
    timezone_offset_minutes: safeNumber(clientMeta.timezoneOffsetMinutes),
    viewport: {
      width: safeNumber(viewport.width),
      height: safeNumber(viewport.height),
    },
  };
}

function summarizeDebug(debug = []) {
  return debug
    .map((item) => {
      if (item.evaluation) {
        return {
          label: item.label || null,
          sensemaking_level: item.evaluation.sensemaking_level || null,
          question_content_type: item.evaluation.question_content_type || null,
          primary_scaffold_family: item.evaluation.primary_scaffold_family || null,
          secondary_scaffold_families: item.evaluation.secondary_scaffold_families || [],
          modeling_dose: item.evaluation.modeling?.dose || "none",
        };
      }

      if (item.decision) {
        return {
          label: item.label || null,
          intent: item.decision.intent || null,
        };
      }

      if (item.grounding) {
        return {
          label: item.label || "Grounding",
          grounding_mode: item.grounding.grounding_mode || null,
          evidence_strength: item.grounding.evidence_strength || null,
          retrieved_sources: (item.grounding.retrieved_sources || []).map((source) => ({
            title: source.title || "",
            author: source.author || "",
            year: source.year || "",
            page: source.page ?? null,
            source_path: source.source_path || "",
            chunk_index: source.chunk_index ?? null,
            score: source.score ?? null,
          })),
        };
      }

      return { label: item.label || "debug" };
    })
    .filter(Boolean);
}

export function usageLoggingEnabled() {
  return envFlag("USAGE_LOGGING", false);
}

export function rawTextLoggingEnabled() {
  return envFlag("LOG_RAW_TEXT", false);
}

export function logConsentRequired() {
  return envFlag("REQUIRE_LOG_CONSENT", true);
}

export function publicLoggingConfig() {
  return {
    usageLoggingEnabled: usageLoggingEnabled(),
    rawTextLoggingEnabled: rawTextLoggingEnabled(),
    consentRequired: logConsentRequired(),
  };
}

export async function logUsageTurn({
  sessionId,
  studentId,
  turnId,
  studentInput,
  result,
  clientMeta,
  serverTiming,
  stateBefore,
  stateAfter,
  consentGiven,
}) {
  if (!usageLoggingEnabled()) {
    return { logged: false, reason: "usage_logging_disabled" };
  }

  if (logConsentRequired() && !consentGiven) {
    return { logged: false, reason: "missing_consent" };
  }

  const includeRawText = rawTextLoggingEnabled();
  const assistantMessages = Array.isArray(result?.messages) ? result.messages : [];
  const now = new Date();
  const event = {
    event_type: "chat_turn",
    timestamp: now.toISOString(),
    student_id: studentId || "student-unknown",
    session_id: sessionId,
    turn_id: turnId,
    consent_given: Boolean(consentGiven),
    raw_text_logged: includeRawText,
    client_timing: normalizeClientTiming(clientMeta),
    server_timing: {
      received_at: serverTiming?.receivedAt || null,
      responded_at: serverTiming?.respondedAt || null,
      processing_ms: clampNonNegative(serverTiming?.processingMs),
    },
    state_before: stateBefore,
    state_after: stateAfter,
    student_input_stats: textStats(studentInput),
    assistant_response_stats: assistantMessages.map((message) => ({
      role: message.role || "assistant",
      ...textStats(message.text),
    })),
    debug_summary: summarizeDebug(result?.debug),
  };

  if (includeRawText) {
    event.student_input = studentInput;
    event.assistant_messages = assistantMessages.map((message) => ({
      role: message.role || "assistant",
      text: message.text || "",
    }));
  }

  const directory = logDir();
  await fs.mkdir(directory, { recursive: true });
  const filePath = path.join(directory, `usage-${dateStamp(now)}.jsonl`);
  await fs.appendFile(filePath, `${JSON.stringify(event)}\n`, "utf8");

  return {
    logged: true,
    file: path.relative(rootDir, filePath),
  };
}
