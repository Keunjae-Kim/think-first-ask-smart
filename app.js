const form = document.querySelector("#chatForm");
const input = document.querySelector("#messageInput");
const sendButton = document.querySelector("#sendButton");
const messages = document.querySelector("#messages");
const stateText = document.querySelector("#stateText");
const startButton = document.querySelector("#startButton");
const declineButton = document.querySelector("#declineButton");
let sessionStarted = false;
const loggingNotice = document.querySelector("#loggingNotice");
const loggingSummary = document.querySelector("#loggingSummary");
const consentCheckbox = document.querySelector("#consentCheckbox");
const studentIdText = document.querySelector("#studentIdText");
const consentLine = document.querySelector("#consentLine");

function randomId() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
const sessionId = randomId();
const studentId = getOrCreateStudentId();
const pageLoadedAt = Date.now();
let lastAssistantAt = pageLoadedAt;
let turnIndex = 0;
let staticDemoMode = false;
let sending = false;
let configReady = false;
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

    const created = `student-${randomId()}`;
    localStorage.setItem(key, created);
    return created;
  } catch {
    return `student-${randomId()}`;
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

function setState(summary = {}) {
  const activeQuestion = summary.activeQuestion ?? summary.active_question;
  const pausedTopics = summary.pausedTopics ?? summary.paused_topics;
  const active = activeQuestion ? `Current topic: ${activeQuestion}` : "A space for thoughtful learning";
  const paused = pausedTopics ? ` - Paused: ${pausedTopics}` : "";
  stateText.textContent = `${active}${paused}`;
  const step = summary.stage === "waiting_for_prior_knowledge" ? "prior" : summary.stage === "waiting_for_retry" ? "retry" : "question";
  document.querySelectorAll("[data-step]").forEach((node) => {
    if (node.dataset.step === step) node.setAttribute("aria-current", "step");
    else node.removeAttribute("aria-current");
  });
  document.querySelector("#inputLabel").textContent = {question: "Your question", prior: "Your current thinking", retry: "Your revised thinking"}[step];
  input.placeholder = {question: "What would you like to explore?", prior: "What do you know or suspect so far?", retry: "How has your thinking changed?"}[step];
}

function updateLoggingNotice() {
  loggingNotice.classList.toggle("hidden", staticDemoMode || !loggingConfig.usageLoggingEnabled);
  if (!staticDemoMode && loggingConfig.usageLoggingEnabled) {
    loggingSummary.textContent = loggingConfig.rawTextLoggingEnabled
      ? "With your permission, your prompts, chatbot replies, timing data, learning-stage records, and a randomly assigned browser ID will be saved on the research server."
      : "With your permission, timing data, text-length summaries, learning-stage records, and a randomly assigned browser ID will be saved on the research server.";
    studentIdText.textContent = "";
  }
}
function updateStartControls() {
  const needsConsent = !staticDemoMode && loggingConfig.usageLoggingEnabled;
  startButton.disabled = !configReady || (needsConsent && !consentCheckbox.checked);
  declineButton.classList.toggle("hidden", !configReady || !needsConsent);
  document.querySelector("#startStatus").textContent = !configReady ? "Checking session settings..." :
    staticDemoMode ? "Practice demo: scripted replies. Conversations are not saved." :
    needsConsent ? "Research logging is optional. Choose how you would like to continue." : "Research logging is off.";
}
function startConversation(saveLogs) {
  if (!configReady) return;
  if (saveLogs && !staticDemoMode && loggingConfig.usageLoggingEnabled && !consentCheckbox.checked) return;
  if (!saveLogs) consentCheckbox.checked = false;
  sessionStarted = true;
  document.querySelector("#startPanel").classList.add("hidden");
  form.classList.remove("hidden");
  lastAssistantAt = Date.now();
  updateSendButton();
  input.focus();
}
consentCheckbox.addEventListener("change", updateStartControls);
startButton.addEventListener("click", () => startConversation(true));
declineButton.addEventListener("click", () => startConversation(false));

async function loadConfig() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    if (location.hostname.endsWith(".github.io") || location.protocol === "file:") {
      enableStaticDemoMode();
      return;
    }
    const response = await fetch("api/config", { cache: "no-store", signal: controller.signal });
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
  } finally {
    clearTimeout(timeout);
    configReady = true;
    updateStartControls();
    updateSendButton();
  }
}

function enableStaticDemoMode() {
  staticDemoMode = true;
  updateLoggingNotice();
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
  if (/cognitive offload|인지적?\s*(?:오프로딩|외주화)/i.test(demoState.activeQuestion || "")) {
    return languageIsKorean(text)
      ? "인지적 오프로딩은 기억이나 사고의 일부를 외부 도구에 맡기는 것이에요. 메모로 일정을 기억하는 것과 AI가 쓴 논증을 검토 없이 제출하는 것은 모두 작업을 밖으로 옮기지만, 학습자가 직접 하는 사고의 양은 달라요.\n\n네 상황에서 도구를 쓰더라도 직접 판단해야 할 부분은 무엇일까요?"
      : "Cognitive offloading means moving some memory or thinking work to an external aid. A reminder can free attention for reasoning; accepting an AI argument without checking it can also replace the reasoning you need to practice.\n\nIn your example, which judgment would still need to be yours?";
  }
  return languageIsKorean(text)
    ? `"${text}"라는 생각을 살펴봅시다. 개념을 점검하는 한 가지 방법은 그 개념에 해당하는 사례와 해당하지 않는 사례를 비교하는 거예요. 두 사례의 차이를 찾으면 그 개념의 핵심 조건이 드러납니다.\n\n이 생각이 적용되는 경우와 적용되지 않는 경우를 가르는 차이는 무엇일까요?`
    : `Let's examine your idea: "${text}". One way to test a concept is to compare an example with a non-example. The difference can reveal a condition the concept depends on.\n\nWhat difference would separate a situation where your idea applies from one where it does not?`;
}

function staticFinalSynthesis(text) {
  const question = demoState.activeQuestion;
  demoState.activeQuestion = null;
  demoState.stage = null;
  demoState.priorResponse = "";

  return languageIsKorean(text)
    ? `"${question}"에 대한 정리는 주장, 예시, 적용 조건을 연결하면 더 명확해져요. 지금 적은 "${text}"를 예시로 사용할 때, 그 사례가 주장을 뒷받침하는 이유와 적용되지 않는 조건을 함께 밝혀주세요. 이 구조는 설명을 정리하는 데 도움이 되지만, 내용의 정확성은 자료와 대조할 필요가 있어요.`
    : `A useful way to organize your answer to "${question}" is to connect a claim, an example, and its conditions. With "${text}" as your example, make the connection to your claim explicit and note where it might not apply. This structure helps organize an explanation; its factual accuracy still needs to be checked against your sources.`;
}

function demoRedirect(text) {
  const normalized = text.trim().toLowerCase();
  const bypass = /\b(?:just|only)\b.{0,35}\b(?:answer|solution)\b|\b(?:give|tell|show) me (?:the |an )?(?:answer|solution)\b|\bdo (?:it|my homework) for me\b|(?:답|정답)(?:만|을).*?(?:줘|알려|말해)|그냥.*(?:답|풀어)/i.test(normalized);
  const noAttempt = /^(?:i (?:have no idea|don['’]?t know)|no idea|idk|not sure|모르겠어|몰라요?|잘 모르겠어요?)[.!?\s]*$/i.test(normalized);
  const unusable = !/[\p{L}\p{N}]/u.test(normalized) || /^(?:asdf\w*|qwer\w*|[ㅋㅎ]+|blah(?:\s+blah)*|whatever|lol|ok|okay|아무말)[.!?\s]*$/i.test(normalized) || /^(.)\1{3,}$/u.test(normalized);
  if (!bypass && !noAttempt && !unusable) return null;
  const korean = languageIsKorean(text);
  if (!demoState.activeQuestion) return korean ? "어떤 주제를 함께 살펴볼까요? 궁금한 질문 하나를 적어주세요." : "What would you like to work on? Share one learning question to get started.";
  const topic = demoState.activeQuestion;
  if (bypass) return korean
    ? `빠르게 답을 알고 싶은 마음은 이해해요. "${topic}"에 대해 맞는 답을 쓸 필요는 없어요. 지금 떠오르는 추측 하나만 말해볼래요?`
    : `I understand you want a quick answer. You don't need to be right yet. For "${topic}", what is one guess you could make?`;
  if (noAttempt) {
    demoState.stage = "waiting_for_retry";
    return staticScaffold(text);
  }
  return korean
    ? `그 말이 현재 질문과 어떻게 연결되는지 아직 분명하지 않아요. "${topic}"와의 연결을 한 문장으로 말해볼래요?`
    : `I'm not yet sure how that connects to "${topic}". Can you describe the connection in one sentence?`;
}

function staticDemoTurn(text) {
  const redirect = demoRedirect(text);
  if (redirect) return {
    messages: [{role: "assistant", text: redirect}],
    debug: [{label: "Demo turn decision", decision: {intent: "learning_redirect"}}],
    stateSummary: {active_question: demoState.activeQuestion, stage: demoState.stage, paused_topics: 0},
  };
  if (isGreeting(text)) {
    return {
      messages: [{ role: "assistant", text: staticGreeting(text) }],
      debug: [],
      stateSummary: { active_question: null, stage: "Static demo mode", paused_topics: 0 },
    };
  }

  if (!demoState.activeQuestion) {
    demoState.activeQuestion = text;
    if (/\bi (?:think|believe|tried|assume)\b|제 생각|내 생각|시도했/i.test(text)) {
      demoState.priorResponse = text;
      demoState.stage = "waiting_for_retry";
      return {messages: [{role: "assistant", text: staticScaffold(text)}], debug: [], stateSummary: {active_question: text, stage: demoState.stage, paused_topics: 0}};
    }
    demoState.stage = "waiting_for_prior_knowledge";
    return {
      messages: [{ role: "assistant", text: staticPriorPrompt(text) }],
      debug: [{ decision: { intent: "start_demo_topic" }, label: "Demo turn decision" }],
      stateSummary: { active_question: text, stage: demoState.stage, paused_topics: 0 },
    };
  }

  if (demoState.stage === "waiting_for_prior_knowledge") {
    if (/^(?:no idea|i don't know|not sure|모르겠어|몰라)[.!?\s]*$/i.test(text.trim())) {
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
  sending = true;
  sendButton.textContent = "Responding...";
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

  

      setState(data.stateSummary);
      return;
    }

    const response = await fetch("api/chat", {
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



    setState(data.stateSummary);
  } catch (error) {
    thinking.remove();
    appendMessage("assistant", error.message, "error");
    lastAssistantAt = Date.now();
  } finally {
    sending = false;
    sendButton.textContent = "Send message";
    updateSendButton();
    input.disabled = false;
    input.focus();
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  if (sending || !sessionStarted) return;
  if (!configReady) {
    document.querySelector("#connectionStatus").textContent = "Connecting. Please try again in a moment.";
    return;
  }
  const text = input.value.trim();
  if (!text) {
    document.querySelector("#connectionStatus").textContent = "Write a message first.";
    input.focus();
    return;
  }
  input.value = "";
  sendMessage(text);
});

input.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    form.requestSubmit();
  }
});


function updateSendButton() {
  sendButton.disabled = sending || !sessionStarted;
  document.querySelector("#connectionStatus").textContent = configReady ? "" : "Connecting...";
}
input.addEventListener("input", updateSendButton);
document.querySelectorAll("[data-question]").forEach((button) => {
  button.addEventListener("click", () => {
    if (sending) return;
    input.value = button.dataset.question;
    updateSendButton();
    input.focus();
  });
});
loadConfig();
