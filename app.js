const form = document.querySelector("#chatForm");
const input = document.querySelector("#messageInput");
const sendButton = document.querySelector("#sendButton");
const messages = document.querySelector("#messages");
const stateText = document.querySelector("#stateText");
const debugToggle = document.querySelector("#debugToggle");
const loggingNotice = document.querySelector("#loggingNotice");
const loggingSummary = document.querySelector("#loggingSummary");
const consentCheckbox = document.querySelector("#consentCheckbox");
const studentIdText = document.querySelector("#studentIdText");

const sessionId = crypto.randomUUID();
const studentId = getOrCreateStudentId();
const pageLoadedAt = Date.now();
let lastAssistantAt = pageLoadedAt;
let turnIndex = 0;
let loggingConfig = {
  usageLoggingEnabled: false,
  rawTextLoggingEnabled: false,
  consentRequired: true,
};

function getOrCreateStudentId() {
  const key = "think_first_student_id";
  try {
    const existing = localStorage.getItem(key);
    if (existing) return existing;

    const created = `student-${crypto.randomUUID().slice(0, 8)}`;
    localStorage.setItem(key, created);
    return created;
  } catch {
    return `student-${crypto.randomUUID().slice(0, 8)}`;
  }
}

function appendMessage(role, text, extraClass = "") {
  const article = document.createElement("article");
  article.className = `message ${role} ${extraClass}`.trim();

  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.textContent = text;

  article.append(bubble);
  messages.append(article);
  messages.scrollTop = messages.scrollHeight;
  return article;
}

function updateDebugVisibility() {
  document.querySelectorAll(".message.debug").forEach((node) => {
    node.classList.toggle("hidden", !debugToggle.checked);
  });
}

function summarizeDebug(debug) {
  return debug
    .map((item) => {
      if (item.evaluation) {
        return `${item.label}: ${item.evaluation.sensemaking_level} / ${item.evaluation.question_content_type} / primary=${item.evaluation.primary_scaffold_family} / secondary=${item.evaluation.secondary_scaffold_families?.join(", ") || "none"} / modeling=${item.evaluation.modeling?.dose || "none"}`;
      }
      if (item.decision) {
        return `${item.label}: ${item.decision.intent}`;
      }
      if (item.grounding) {
        const sources = item.grounding.retrieved_sources || [];
        const sourceText = sources.length
          ? ` / sources=${sources.map((source) => source.title || source.source_path).join("; ")}`
          : "";
        return `${item.label}: ${item.grounding.grounding_mode} / evidence=${item.grounding.evidence_strength}${sourceText}`;
      }
      return item.label || "Debug";
    })
    .join("\n");
}

function setState(summary = {}) {
  const activeQuestion = summary.activeQuestion ?? summary.active_question;
  const pausedTopics = summary.pausedTopics ?? summary.paused_topics;
  const active = activeQuestion ? `Active: ${activeQuestion}` : "No active topic";
  const paused = pausedTopics ? ` - Paused: ${pausedTopics}` : "";
  const stage = summary.stage ? ` - ${summary.stage}` : "";
  stateText.textContent = `${active}${stage}${paused}`;
}

function updateLoggingNotice() {
  if (!loggingConfig.usageLoggingEnabled) {
    loggingNotice.classList.add("hidden");
    return;
  }

  loggingNotice.classList.remove("hidden");
  const rawText = loggingConfig.rawTextLoggingEnabled
    ? "prompts, chatbot responses, and timing data"
    : "timing data and text length summaries";
  const consentText = loggingConfig.consentRequired
    ? "Only checked sessions are logged."
    : "This prototype is configured to log without the checkbox requirement.";
  loggingSummary.textContent = `Logging is enabled for ${rawText}. ${consentText} Do not enter personal or sensitive information.`;
  studentIdText.textContent = `Anonymous student ID: ${studentId}`;
}

async function loadConfig() {
  try {
    const response = await fetch("/api/config", { cache: "no-store" });
    if (!response.ok) return;
    const data = await response.json();
    loggingConfig = {
      ...loggingConfig,
      ...(data.logging || {}),
    };
    updateLoggingNotice();
  } catch {
    updateLoggingNotice();
  }
}

function clientMetaForTurn(messageCreatedAt) {
  return {
    pageLoadedAt,
    lastAssistantAt,
    messageCreatedAt,
    dwellMs: messageCreatedAt - lastAssistantAt,
    turnIndex,
    browserLanguage: navigator.language || null,
    timezoneOffsetMinutes: new Date().getTimezoneOffset(),
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
    },
    consentGiven: Boolean(consentCheckbox.checked),
  };
}

async function sendMessage(text) {
  const messageCreatedAt = Date.now();
  turnIndex += 1;
  appendMessage("student", text);
  sendButton.disabled = true;
  input.disabled = true;
  const thinking = appendMessage("assistant", "Thinking...");

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
        sessionId,
        studentId,
        message: text,
        clientMeta: clientMetaForTurn(messageCreatedAt),
      }),
    });

    const data = await response.json();
    thinking.remove();

    if (!response.ok) {
      appendMessage("assistant", data.error || "Something went wrong.", "error");
      lastAssistantAt = Date.now();
      return;
    }

    for (const message of data.messages) {
      appendMessage(message.role || "assistant", message.text);
    }
    lastAssistantAt = Date.now();

    if (data.debug?.length) {
      appendMessage("debug", summarizeDebug(data.debug), debugToggle.checked ? "" : "hidden");
    }

    setState(data.stateSummary);
  } catch (error) {
    thinking.remove();
    appendMessage("assistant", error.message, "error");
    lastAssistantAt = Date.now();
  } finally {
    sendButton.disabled = false;
    input.disabled = false;
    input.focus();
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const text = input.value.trim();
  if (!text) return;
  input.value = "";
  sendMessage(text);
});

input.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    form.requestSubmit();
  }
});

debugToggle.addEventListener("change", updateDebugVisibility);
loadConfig();
