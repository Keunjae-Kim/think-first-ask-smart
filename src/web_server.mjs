import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { advanceConversation } from "./scaffold_engine.mjs";
import { logUsageTurn, publicLoggingConfig } from "./usage_logger.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const publicDir = path.join(rootDir, "web");
const port = Number(process.env.PORT || 3000);

const sessions = new Map();
const sessionTurnCounts = new Map();

function jsonResponse(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(body));
}

function contentTypeFor(filePath) {
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (filePath.endsWith(".svg")) return "image/svg+xml";
  return "application/octet-stream";
}

async function readRequestJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString("utf8");
  return text ? JSON.parse(text) : {};
}

function stateForSession(sessionId) {
  if (!sessions.has(sessionId)) {
    sessions.set(sessionId, {
      activeTopic: null,
      topicStack: [],
    });
  }

  return sessions.get(sessionId);
}

function nextTurnId(sessionId) {
  const next = (sessionTurnCounts.get(sessionId) || 0) + 1;
  sessionTurnCounts.set(sessionId, next);
  return next;
}

function summarizeState(state) {
  return {
    active_question: state.activeTopic?.question ?? null,
    stage: state.activeTopic?.stage ?? null,
    paused_topics: state.topicStack?.length ?? 0,
  };
}

function normalizeIdentifier(value, fallback) {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  return trimmed.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80) || fallback;
}

async function handleChat(req, res) {
  try {
    const receivedAtMs = Date.now();
    const body = await readRequestJson(req);
    const sessionId = normalizeIdentifier(body.sessionId, "default");
    const studentId = normalizeIdentifier(body.studentId, "student-unknown");
    const studentInput = typeof body.message === "string" ? body.message.trim() : "";
    const clientMeta = body.clientMeta && typeof body.clientMeta === "object" ? body.clientMeta : {};

    if (!studentInput) {
      jsonResponse(res, 400, { error: "Message is required." });
      return;
    }

    const turnId = nextTurnId(sessionId);
    const state = stateForSession(sessionId);
    const stateBefore = summarizeState(state);
    const result = await advanceConversation({ state, studentInput });
    sessions.set(sessionId, result.state);
    const stateAfter = summarizeState(result.state);
    const respondedAtMs = Date.now();

    let usageLog = { logged: false, reason: "not_attempted" };
    try {
      usageLog = await logUsageTurn({
        sessionId,
        studentId,
        turnId,
        studentInput,
        result,
        clientMeta,
        serverTiming: {
          receivedAt: new Date(receivedAtMs).toISOString(),
          respondedAt: new Date(respondedAtMs).toISOString(),
          processingMs: respondedAtMs - receivedAtMs,
        },
        stateBefore,
        stateAfter,
        consentGiven: clientMeta.consentGiven === true,
      });
    } catch (logError) {
      usageLog = { logged: false, reason: "logging_error" };
      console.error(`Usage logging failed: ${logError.message}`);
    }

    jsonResponse(res, 200, {
      messages: result.messages,
      debug: result.debug,
      studentId,
      turnId,
      logging: {
        logged: usageLog.logged,
        reason: usageLog.reason || null,
      },
      stateSummary: stateAfter,
    });
  } catch (error) {
    jsonResponse(res, 500, { error: error.message });
  }
}

async function handleStatic(req, res) {
  const requestUrl = new URL(req.url, `http://${req.headers.host}`);
  const pathname = requestUrl.pathname === "/" ? "/index.html" : requestUrl.pathname;
  const normalized = path.normalize(pathname).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(publicDir, normalized);

  if (!filePath.startsWith(publicDir)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  try {
    const content = await fs.readFile(filePath);
    res.writeHead(200, {
      "Content-Type": contentTypeFor(filePath),
      "Cache-Control": "no-store",
    });
    res.end(content);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
}

const server = http.createServer(async (req, res) => {
  if (req.method === "POST" && req.url === "/api/chat") {
    await handleChat(req, res);
    return;
  }

  if (req.method === "GET" && req.url === "/api/config") {
    jsonResponse(res, 200, {
      logging: publicLoggingConfig(),
    });
    return;
  }

  if (req.method === "GET") {
    await handleStatic(req, res);
    return;
  }

  res.writeHead(405);
  res.end("Method not allowed");
});

server.listen(port, () => {
  console.log(`Think First, Ask Smart running at http://localhost:${port}`);
});
