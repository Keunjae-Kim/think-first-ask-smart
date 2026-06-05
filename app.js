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
const consentLine = document.querySelector("#consentLine");

const sessionId = crypto.randomUUID();
const studentId = getOrCreateStudentId();
const pageLoadedAt = Date.now();
let lastAssistantAt = pageLoadedAt;
let turnIndex = 0;
let staticDemoMode = false;
let loggingConfig = {
  usageLoggingEnabled: false,
  rawTextLoggingEnabled: false,
  consentRequired: true,
};
const demoState = {
  activeQuestion: null,
  stage: null,
  priorResponse: "",
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
  if (staticDemoMode) {
    loggingNotice.classList.remove("hidden");
    consentLine.classList.add("hidden");
    loggingSummary.textContent =
      "Static GitHub Pages demo mode: this page shows the scaffolded interaction flow without OpenAI, RAG retrieval, server logs, or persistent research data collection.";
    studentIdText.textContent = `Anonymous demo student ID: ${studentId}`;
    return;
  }

  if (!loggingConfig.usageLoggingEnabled) {
    loggingNotice.classList.add("hidden");
    return;
  }

  loggingNotice.classList.remove("hidden");
  consentLine.classList.remove("hidden");
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
    const response = await fetch("api/config", { cache: "no-store" });
    if (!response.ok) {
      enableStaticDemoMode();
      return;
    }
    const data = await response.json();
    loggingConfig = {
      ...loggingConfig,
      ...(data.logging || {}),
    };
    updateLoggingNotice();
  } catch {
    enableStaticDemoMode();
    updateLoggingNotice();
  }
}

function enableStaticDemoMode() {
  staticDemoMode = true;
  setState({
    active_question: null,
    stage: "Static demo mode",
    paused_topics: 0,
  });
}

function languageIsKorean(text) {
  return /[\uac00-\ud7af]/u.test(text);
}

function staticGreeting(text) {
  return languageIsKorean(text)
    ? "안녕하세요. 어떤 주제나 질문으로 시작해볼까요?"
    : "Hello. What topic or question would you like to work on?";
}

function isGreeting(text) {
  return /^(hi|hello|hey|good morning|good afternoon|good evening|안녕|안녕하세요|하이|헬로)[.!?\s]*$/i.test(
    text.trim(),
  );
}

function staticPriorPrompt(text) {
  return languageIsKorean(text)
    ? `좋아요. 바로 설명하기 전에, "${text}"에 대해 이미 알고 있는 것, 떠오르는 직관, 또는 어디가 궁금한지 한두 문장으로 말해볼래요?`
    : `Good question. Before I explain it, what do you already know, suspect, or wonder about "${text}"? Share one or two sentences so I can scaffold from your starting point.`;
}

function staticParticipationSupport(text) {
  return languageIsKorean(text)
    ? "괜찮아요. 아주 작게 시작해봅시다. 1) 관련 단어 하나, 2) 떠오르는 예시 하나, 3) 헷갈리는 지점 하나 중 하나만 골라서 적어볼래요?"
    : "No problem. Let's make the first step smaller. Pick one: 1) one related word, 2) one possible example, or 3) one confusing part. Which one can you try?";
}

function staticScaffold(text) {
  return languageIsKorean(text)
    ? `What you already have: 방금 답변에서 출발점이 생겼어요: "${text}"\n\nNext scaffold: 지금 아이디어를 조금 더 구체화해봅시다. 이 주제가 "학습자가 정보를 해석하는 방식", "교수자가 지원을 조절하는 방식", 또는 "연구 방법을 선택하는 방식" 중 어디에 더 가까운지 골라보세요.\n\nMetacognitive check: 그렇게 고른 이유를 한 문장으로 설명해볼래요?`
    : `What you already have: You gave me a starting point: "${text}"\n\nNext scaffold: Try narrowing your idea. Does this topic mainly involve how learners interpret information, how instructors support learning, or how researchers choose methods?\n\nMetacognitive check: Pick one and explain your reason in one sentence.`;
}

function staticFinalSynthesis(text) {
  const question = demoState.activeQuestion;
  demoState.activeQuestion = null;
  demoState.stage = null;
  demoState.priorResponse = "";

  return languageIsKorean(text)
    ? `Final synthesis: 네 재시도는 "${question}"에 대해 더 구체적인 방향을 만들었어요. 좋은 학습 답변은 정의를 바로 외우기보다, 네가 선택한 관점과 예시를 연결해서 설명하는 방식으로 발전할 수 있습니다.\n\nTransfer check: 이 내용을 처음 듣는 동료에게 설명한다면, 어떤 예시로 시작하겠어요?`
    : `Final synthesis: Your retry gives "${question}" a clearer direction. A stronger learning answer would connect the concept to the perspective you chose and use a concrete example rather than jumping straight to a polished definition.\n\nTransfer check: If you explained this to a peer seeing it for the first time, what example would you start with?`;
}

function staticDemoTurn(text) {
  if (isGreeting(text)) {
    return {
      messages: [{ role: "assistant", text: staticGreeting(text) }],
      debug: [],
      stateSummary: { active_question: null, stage: "Static demo mode", paused_topics: 0 },
    };
  }

  if (!demoState.activeQuestion) {
    demoState.activeQuestion = text;
    demoState.stage = "waiting_for_prior_knowledge";
    return {
      messages: [{ role: "assistant", text: staticPriorPrompt(text) }],
      debug: [{ decision: { intent: "start_demo_topic" }, label: "Demo turn decision" }],
      stateSummary: { active_question: text, stage: demoState.stage, paused_topics: 0 },
    };
  }

  if (demoState.stage === "waiting_for_prior_knowledge") {
    if (/\b(no idea|don't know|not sure|모르|몰라)\b/i.test(text)) {
      return {
        messages: [{ role: "assistant", text: staticParticipationSupport(text) }],
        debug: [
          {
            evaluation: {
              sensemaking_level: "L0_PRE_GAP",
              question_content_type: "WHAT",
              primary_scaffold_family: "conceptual",
              secondary_scaffold_families: ["metacognitive"],
              modeling: { dose: "none" },
            },
            label: "Demo attempt evaluation",
          },
        ],
        stateSummary: {
          active_question: demoState.activeQuestion,
          stage: demoState.stage,
          paused_topics: 0,
        },
      };
    }

    demoState.priorResponse = text;
    demoState.stage = "waiting_for_retry";
    return {
      messages: [{ role: "assistant", text: staticScaffold(text) }],
      debug: [
        {
          evaluation: {
            sensemaking_level: "L2_SPECIFIED",
            question_content_type: "WHAT",
            primary_scaffold_family: "conceptual",
            secondary_scaffold_families: ["metacognitive"],
            modeling: { dose: "none" },
          },
          label: "Demo scaffold plan",
        },
        {
          grounding: {
            grounding_mode: "static_demo_no_server",
            evidence_strength: "none",
            retrieved_sources: [],
          },
          label: "Grounding",
        },
      ],
      stateSummary: {
        active_question: demoState.activeQuestion,
        stage: demoState.stage,
        paused_topics: 0,
      },
    };
  }

  return {
    messages: [{ role: "assistant", text: staticFinalSynthesis(text) }],
    debug: [{ decision: { intent: "demo_final_synthesis" }, label: "Demo synthesis" }],
    stateSummary: { active_question: null, stage: "Static demo mode", paused_topics: 0 },
  };
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
    if (staticDemoMode) {
      const data = staticDemoTurn(text);
      await new Promise((resolve) => setTimeout(resolve, 250));
      thinking.remove();

      for (const message of data.messages) {
        appendMessage(message.role || "assistant", message.text);
      }
      lastAssistantAt = Date.now();

      if (data.debug?.length) {
        appendMessage("debug", summarizeDebug(data.debug), debugToggle.checked ? "" : "hidden");
      }

      setState(data.stateSummary);
      return;
    }

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
