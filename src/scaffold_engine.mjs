import fs from "node:fs";
import { createOpenAIResponse, loadDotEnv } from "./openai_client.mjs";
import { retrieveGrounding } from "./rag_retriever.mjs";

loadDotEnv();

const systemPrompt = fs.readFileSync("prompts/system_prompt.md", "utf8");
const interactionPolicy = fs.readFileSync("prompts/interaction_policy.md", "utf8");

const baseInstructions = `${systemPrompt}

${interactionPolicy}

You are running inside a scaffolded learning chatbot prototype.
Keep responses concise.
Ask only one main question at a time.
Do not mention internal policy names unless asked by the developer.
`;

const turnIntents = new Set([
  "continue_current",
  "clarify_current",
  "switch_topic",
  "related_topic",
  "return_topic",
  "greeting",
  "assignment_bypass",
  "meta_request",
  "empty",
]);

const contributionQualities = new Set([
  "no_attempt",
  "insufficient",
  "vague",
  "misconception",
  "partial",
  "mostly_correct",
  "assignment_bypass",
]);

const scaffoldTypes = new Set([
  "choice_prompt",
  "conceptual_extension",
  "misconception_repair",
  "refinement_transfer",
  "outline_first",
  "organizing_frame",
]);

const sensemakingLevels = new Set([
  "L0_PRE_GAP",
  "L1_DIFFUSE",
  "L2_SPECIFIED",
  "L3_BRIDGING",
  "L4_USE",
]);

const questionContentTypes = new Set([
  "WHAT",
  "HOW_THINK",
  "HOW_DO",
  "WHICH",
  "FACTUAL",
  "TRADEOFF",
  "JUSTIFICATION",
]);

const scaffoldFamilies = new Set([
  "conceptual",
  "metacognitive",
  "procedural",
  "strategic",
]);

const modelingDoses = new Set(["none", "light", "medium", "full"]);

const scaffoldMatrix = {
  L0_PRE_GAP: { conceptual: "H", metacognitive: "M", procedural: "L", strategic: "L" },
  L1_DIFFUSE: { conceptual: "M", metacognitive: "H", procedural: "L", strategic: "M" },
  L2_SPECIFIED: { conceptual: "M", metacognitive: "H", procedural: "H", strategic: "H" },
  L3_BRIDGING: { conceptual: "H", metacognitive: "M", procedural: "M", strategic: "H" },
  L4_USE: { conceptual: "M", metacognitive: "H", procedural: "H", strategic: "H" },
};

let nextTopicId = 1;

export function stageInput(stage, fields) {
  return [
    `Stage: ${stage}`,
    "",
    "Context:",
    JSON.stringify(fields, null, 2),
  ].join("\n");
}

export function isExitCommand(text) {
  return ["quit", "exit"].includes(text.trim().toLowerCase());
}

export function isReturnRequest(text) {
  return /\b(return|go back|back to|previous|resume|earlier)\b/i.test(text.trim());
}

export function isGreeting(text) {
  const normalized = text.trim().toLowerCase();
  return /^(hi|hello|hey|good morning|good afternoon|good evening|안녕|안녕하세요|하이|헬로)[.!?\s]*$/.test(normalized);
}

function greetingResponse(text) {
  return /[가-힣]/.test(text)
    ? "안녕하세요. 어떤 주제나 질문으로 시작해볼까요?"
    : "Hello. What topic or question would you like to work on?";
}

function languageFor(text) {
  return /[가-힣]/.test(text) ? "Korean" : "English";
}

function languageInstructionFor(text) {
  const language = languageFor(text);
  return language === "Korean"
    ? "Respond in Korean for this turn. Keep technical terms in English only when they are commonly used that way, and do not mix English sentence frames into Korean prose."
    : "Respond in English for this turn.";
}

function instructionsFor(text, extra = "") {
  return `${baseInstructions}

${languageInstructionFor(text)}
${extra}`;
}


function truncate(text, maxLength = 180) {
  if (!text) return "";
  return text.length <= maxLength ? text : `${text.slice(0, maxLength - 3)}...`;
}

function groundingQuery({ activeTopic, studentInput, evaluation, stage }) {
  return [
    activeTopic.question,
    activeTopic.priorResponse,
    studentInput,
    evaluation?.sensemaking_level,
    evaluation?.question_content_type,
    evaluation?.primary_scaffold_family,
    ...(evaluation?.known_concepts ?? []),
    ...(evaluation?.missing_links ?? []),
    ...(evaluation?.misconceptions ?? []),
    stage,
  ]
    .filter(Boolean)
    .join("\n");
}

function groundingForPrompt(grounding) {
  if (!grounding) {
    return {
      grounding_mode: "general_background_fallback",
      evidence_strength: "none",
      instruction:
        "No grounding object was provided. Use clearly labeled general background only if needed.",
      retrieved_sources: [],
      source_context: "",
    };
  }

  return {
    grounding_mode: grounding.grounding_mode,
    evidence_strength: grounding.evidence_strength,
    instruction: grounding.instruction,
    retrieved_sources: grounding.retrieved_sources?.map((source) => ({
      title: source.title,
      author: source.author,
      year: source.year,
      page: source.page,
      source_path: source.source_path,
      chunk_index: source.chunk_index,
      score: source.score,
    })) ?? [],
    source_context: grounding.source_context,
  };
}

function parseJsonObject(text) {
  const cleaned = text
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();

  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;

  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return null;
  }
}

function fallbackTurnDecision(studentInput) {
  const trimmed = studentInput.trim();

  if (!trimmed) return { intent: "empty", new_topic_question: null, resume_topic_id: null };
  if (isGreeting(trimmed)) {
    return { intent: "greeting", new_topic_question: null, resume_topic_id: null };
  }
  if (isReturnRequest(trimmed)) {
    return { intent: "return_topic", new_topic_question: null, resume_topic_id: null };
  }
  if (/^(help|how do i use|what should i type)/i.test(trimmed)) {
    return { intent: "meta_request", new_topic_question: null, resume_topic_id: null };
  }
  if (/(what do you mean|can you clarify|can you explain that)/i.test(trimmed)) {
    return { intent: "clarify_current", new_topic_question: null, resume_topic_id: null };
  }
  if (/(write|draft|give me the answer|just tell me|complete answer)/i.test(trimmed)) {
    return { intent: "assignment_bypass", new_topic_question: null, resume_topic_id: null };
  }
  if (/(\?|actually|instead|another question|new topic|switch)/i.test(trimmed)) {
    return { intent: "switch_topic", new_topic_question: trimmed, resume_topic_id: null };
  }

  return { intent: "continue_current", new_topic_question: null, resume_topic_id: null };
}

function normalizeTurnDecision(parsed, studentInput) {
  if (!parsed || !turnIntents.has(parsed.intent)) {
    return fallbackTurnDecision(studentInput);
  }

  return {
    intent: parsed.intent,
    new_topic_question:
      typeof parsed.new_topic_question === "string" && parsed.new_topic_question.trim()
        ? parsed.new_topic_question.trim()
        : null,
    resume_topic_id:
      typeof parsed.resume_topic_id === "string" && parsed.resume_topic_id.trim()
        ? parsed.resume_topic_id.trim()
        : null,
    rationale: typeof parsed.rationale === "string" ? parsed.rationale : "",
  };
}

function primaryFamilyFromContent(contentType) {
  if (contentType === "HOW_THINK") return "metacognitive";
  if (contentType === "HOW_DO") return "procedural";
  if (["WHICH", "TRADEOFF", "JUSTIFICATION"].includes(contentType)) return "strategic";
  return "conceptual";
}

function strongestFamilyAtLevel(level) {
  const weights = scaffoldMatrix[level] ?? scaffoldMatrix.L1_DIFFUSE;
  const high = Object.entries(weights).find(([, weight]) => weight === "H");
  return high?.[0] ?? "metacognitive";
}

function resolvePrimaryFamily(level, contentType, proposedFamily) {
  const contentFamily = scaffoldFamilies.has(proposedFamily)
    ? proposedFamily
    : primaryFamilyFromContent(contentType);
  const levelWeights = scaffoldMatrix[level] ?? scaffoldMatrix.L1_DIFFUSE;

  return levelWeights[contentFamily] === "L" ? strongestFamilyAtLevel(level) : contentFamily;
}

function defaultScaffoldTypeFromQuality(quality) {
  if (quality === "misconception") return "misconception_repair";
  if (quality === "mostly_correct") return "refinement_transfer";
  if (quality === "vague") return "conceptual_extension";
  if (quality === "assignment_bypass") return "outline_first";
  return "choice_prompt";
}

function normalizeModelingPlan(parsedModeling, evaluation, activeTopic) {
  const rawDose = typeof parsedModeling?.dose === "string" ? parsedModeling.dose.toLowerCase() : "none";
  const dose = modelingDoses.has(rawDose) ? rawDose : "none";
  const triggers = Array.isArray(parsedModeling?.triggers) ? parsedModeling.triggers : [];
  const counterIndicators = Array.isArray(parsedModeling?.counter_indicators)
    ? parsedModeling.counter_indicators
    : [];
  const levelBlocksModeling = ["L0_PRE_GAP", "L1_DIFFUSE"].includes(evaluation.sensemaking_level);
  const factualBlocksModeling = evaluation.question_content_type === "FACTUAL";
  const lastWasModeling = activeTopic.scaffolds.at(-1)?.modeling?.activate === true;
  const l4ProceduralBlocksModeling =
    evaluation.sensemaking_level === "L4_USE" && evaluation.question_content_type === "HOW_DO";
  const blocked =
    levelBlocksModeling ||
    factualBlocksModeling ||
    lastWasModeling ||
    l4ProceduralBlocksModeling ||
    counterIndicators.length > 0;

  return {
    activate: blocked ? false : Boolean(parsedModeling?.activate) && dose !== "none",
    dose: blocked ? "none" : dose,
    triggers,
    counter_indicators: counterIndicators,
    rationale: typeof parsedModeling?.rationale === "string" ? parsedModeling.rationale : "",
  };
}

function dosageGuidance(evaluation) {
  const primary = evaluation.primary_scaffold_family;
  const modelingDose = evaluation.modeling?.dose ?? "none";

  if (modelingDose === "light") {
    return "Modeling light: 80-120 words, 1-2 sentences, then ask the learner to apply the criterion.";
  }
  if (modelingDose === "medium") {
    return "Modeling medium: 160-220 words, 3-4 reasoning steps, leave the final application step to the learner.";
  }
  if (modelingDose === "full") {
    return "Modeling full: 250-350 words only for rescue or explicit request, followed by learner articulation.";
  }
  if (primary === "procedural") {
    return "Procedural scaffold: 160-220 words, maximum 5 steps.";
  }
  if (primary === "strategic") {
    return "Strategic scaffold: 160-220 words, maximum 2-3 options.";
  }
  if (primary === "conceptual") {
    return "Conceptual scaffold: 100-160 words, prefer contrast or example over a long definition.";
  }
  if (primary === "metacognitive") {
    return "Metacognitive scaffold: 60-120 words, one main question.";
  }
  return "Default scaffold: 120-180 words, one focused learning move.";
}

function normalizeContributionEvaluation(parsed, studentInput, activeTopic) {
  const fallbackQuality = studentInput.trim().split(/\s+/).filter(Boolean).length < 4 ? "insufficient" : "partial";
  const quality = contributionQualities.has(parsed?.quality) ? parsed.quality : fallbackQuality;
  const sensemakingLevel = sensemakingLevels.has(parsed?.sensemaking_level)
    ? parsed.sensemaking_level
    : quality === "insufficient" || quality === "no_attempt"
      ? "L0_PRE_GAP"
      : "L2_SPECIFIED";
  const questionContentType = questionContentTypes.has(parsed?.question_content_type)
    ? parsed.question_content_type
    : "WHAT";
  const primaryScaffoldFamily = resolvePrimaryFamily(
    sensemakingLevel,
    questionContentType,
    parsed?.primary_scaffold_family,
  );
  const parsedSecondaryFamilies = Array.isArray(parsed?.secondary_scaffold_families)
    ? parsed.secondary_scaffold_families.filter((family) => scaffoldFamilies.has(family))
    : [];
  const secondaryFamilies = [...new Set([
    ...parsedSecondaryFamilies,
    ...(primaryScaffoldFamily === "metacognitive" ? [] : ["metacognitive"]),
  ])];
  const scaffoldType = scaffoldTypes.has(parsed?.scaffold_type)
    ? parsed.scaffold_type
    : defaultScaffoldTypeFromQuality(quality);

  const evaluation = {
    quality,
    is_meaningful: typeof parsed?.is_meaningful === "boolean" ? parsed.is_meaningful : quality !== "insufficient",
    ready_for_synthesis:
      typeof parsed?.ready_for_synthesis === "boolean"
        ? parsed.ready_for_synthesis
        : quality === "mostly_correct",
    sensemaking_level: sensemakingLevel,
    question_content_type: questionContentType,
    primary_scaffold_family: primaryScaffoldFamily,
    secondary_scaffold_families: secondaryFamilies,
    scaffold_type: scaffoldType,
    known_concepts: Array.isArray(parsed?.known_concepts) ? parsed.known_concepts : [],
    missing_links: Array.isArray(parsed?.missing_links) ? parsed.missing_links : [],
    misconceptions: Array.isArray(parsed?.misconceptions) ? parsed.misconceptions : [],
    rationale: typeof parsed?.rationale === "string" ? parsed.rationale : "",
  };

  return {
    ...evaluation,
    modeling: normalizeModelingPlan(parsed?.modeling, evaluation, activeTopic),
  };
}

export function pausedTopicSummaries(topicStack) {
  return topicStack.map((topic) => ({
    id: topic.id,
    question: topic.question,
    stage: topic.stage,
    prior_response: truncate(topic.priorResponse),
    prior_level: topic.priorEvaluation?.sensemaking_level ?? "",
    prior_content_type: topic.priorEvaluation?.question_content_type ?? "",
    last_scaffold: truncate(topic.scaffolds.at(-1)?.text ?? ""),
  }));
}

export function popPausedTopic(topicStack, topicId) {
  if (topicId) {
    const index = topicStack.findIndex((topic) => topic.id === topicId);
    if (index !== -1) {
      const [topic] = topicStack.splice(index, 1);
      return topic;
    }
  }

  return topicStack.pop() ?? null;
}

export function createTopic(question, priorPrompt) {
  return {
    id: `topic-${nextTopicId++}`,
    question,
    priorPrompt,
    priorResponse: "",
    priorEvaluation: null,
    scaffolds: [],
    retryAttempts: [],
    stage: "waiting_for_prior_knowledge",
  };
}

export async function generatePriorKnowledgePrompt(studentQuestion) {
  const response = await createOpenAIResponse({
    instructions: instructionsFor(studentQuestion),
    input: stageInput("prior_knowledge_prompt", {
      student_question: studentQuestion,
      language_instruction: languageInstructionFor(studentQuestion),
      required_behavior:
        "Classify the likely domain and task type silently. Ask the student to share prior knowledge, current guess, what they tried, or where they are stuck. Do not provide a complete answer.",
    }),
    maxOutputTokens: 180,
    verbosity: "low",
  });

  return response.outputText;
}

export async function classifyTurn({ stage, activeTopic, studentInput, topicStack }) {
  const response = await createOpenAIResponse({
    instructions: instructionsFor(studentInput, `

You are a turn classifier for a scaffolded learning chatbot.
Return only a compact JSON object.
Valid intents:
- continue_current: the student is answering the current prompt or continuing the current flow.
- clarify_current: the student asks a clarification about the current topic or chatbot prompt.
- switch_topic: the student moves to a different topic or asks a new unrelated question.
- related_topic: the student asks a new but related question that should become the active topic.
- return_topic: the student wants to resume a paused earlier topic.
- greeting: the student is only greeting or opening socially, not asking a learning question.
- assignment_bypass: the student tries to skip reasoning and asks for a complete answer, essay, or final response.
- meta_request: the student asks how to use the chatbot or what to do.
- empty: the input is blank or unusable.

If intent is switch_topic or related_topic, set new_topic_question to the student's new question.
If intent is return_topic and a paused topic matches, set resume_topic_id to that paused topic id.
Otherwise set new_topic_question and resume_topic_id to null.
Do not explain your decision outside JSON.`),
    input: stageInput("turn_classification", {
      current_stage: stage,
      active_topic: activeTopic
        ? {
            id: activeTopic.id,
            question: activeTopic.question,
            prior_response: truncate(activeTopic.priorResponse),
            last_scaffold: truncate(activeTopic.scaffolds.at(-1)?.text ?? ""),
          }
        : null,
      paused_topics: pausedTopicSummaries(topicStack),
      student_input: studentInput,
      language_instruction: languageInstructionFor(studentInput),
      output_format: {
        intent:
          "continue_current | clarify_current | switch_topic | related_topic | return_topic | greeting | assignment_bypass | meta_request | empty",
        new_topic_question: "string or null",
        resume_topic_id: "paused topic id or null",
        rationale: "short private reason",
      },
    }),
    maxOutputTokens: 160,
    verbosity: "low",
  });

  return normalizeTurnDecision(parseJsonObject(response.outputText), studentInput);
}

export async function evaluateContribution({ stage, activeTopic, studentInput }) {
  const response = await createOpenAIResponse({
    instructions: instructionsFor(studentInput, `

You evaluate a student's contribution and produce a scaffold planning diagnosis.
Return only a compact JSON object.

Quality labels:
- no_attempt: blank, evasive, or no usable academic content.
- insufficient: too short or only "I don't know" without any guess.
- vague: relevant but very general.
- misconception: contains a clear misconception that needs repair.
- partial: meaningful but incomplete.
- mostly_correct: accurate enough to move toward synthesis.
- assignment_bypass: asks for a complete answer instead of contributing thinking.

Sense-making levels:
- L0_PRE_GAP: The learner has not yet articulated a gap or usable prior knowledge.
- L1_DIFFUSE: The learner has a vague sense of confusion but cannot localize the gap.
- L2_SPECIFIED: The learner can name a specific gap, method choice, or point of uncertainty.
- L3_BRIDGING: The learner is connecting new understanding to prior knowledge or adjacent concepts.
- L4_USE: The learner is applying the idea in a new task, design, IRB, dissertation, code, or teaching context.

Question content types:
- WHAT: asks what something means.
- HOW_THINK: asks how to approach or think about a problem.
- HOW_DO: asks how to do a procedure, method, tool, code, or implementation.
- WHICH: asks which option to choose.
- FACTUAL: asks a simple factual detail or formula.
- TRADEOFF: asks about pros, cons, consequences, or trade-offs.
- JUSTIFICATION: asks whether a choice can be justified.

Scaffold family matrix:
- L0_PRE_GAP: conceptual H, metacognitive M, procedural L, strategic L.
- L1_DIFFUSE: conceptual M, metacognitive H, procedural L, strategic M.
- L2_SPECIFIED: conceptual M, metacognitive H, procedural H, strategic H.
- L3_BRIDGING: conceptual H, metacognitive M, procedural M, strategic H.
- L4_USE: conceptual M, metacognitive H, procedural H, strategic H.

Primary scaffold family:
- WHAT or FACTUAL -> conceptual.
- HOW_THINK -> metacognitive.
- HOW_DO -> procedural.
- WHICH, TRADEOFF, JUSTIFICATION -> strategic.
- If the mapped family is L at the current sense-making level, use the strongest family in the matrix.
- Metacognitive scaffolding is almost always secondary unless it is already primary.

Metacognitive forms by level:
- L0_PRE_GAP: activation metacognition.
- L1_DIFFUSE: localization metacognition.
- L2_SPECIFIED: hypothesis metacognition.
- L3_BRIDGING: integration metacognition.
- L4_USE: transfer metacognition.

Local scaffold move types:
- choice_prompt: use when the student has no attempt or says they do not know.
- conceptual_extension: use when the student is vague but relevant.
- misconception_repair: use when the student has a misconception.
- refinement_transfer: use when the student is mostly correct.
- outline_first: use for assignment-ready requests.
- organizing_frame: use when ideas are fragmented.

For stage waiting_for_prior_knowledge, is_meaningful should be true only when the student has given at least a small guess, example, confusion point, or partial idea.
For stage waiting_for_retry, ready_for_synthesis should be true only when the retry shows enough revised reasoning for a concise final synthesis.
Do not reward empty compliance. The student must make visible thinking.
Modeling activation:
- Necessary conditions: sense-making level must be L2 or higher; content type must not be FACTUAL; there must be student context from self-explanation, specified gap, prior response, scaffold history, or retry.
- Sufficient triggers: WHICH/TRADEOFF/JUSTIFICATION decision question; explicit metacognitive request; attempt-after-stuck with uncertainty; research methodology decision; repeated scaffolding failure.
- Counter-indicators: insight is imminent; previous turn already used modeling; time pressure signal; L4 procedural deployment where the learner already decided and just needs execution.
- Doses: light = 1-2 sentences, medium = 3-5 step reasoning sequence with final step left to learner, full = complete expert walkthrough for rescue or explicit request.
- Most modeling should be medium. Preserve anti-offloading by leaving the final application step to the learner when possible.`),
    input: stageInput("contribution_quality_evaluation", {
      current_stage: stage,
      active_question: activeTopic.question,
      prior_response: activeTopic.priorResponse,
      previous_scaffolds: activeTopic.scaffolds.map((item) => item.text),
      retry_attempts: activeTopic.retryAttempts.map((item) => item.text),
      student_input: studentInput,
      language_instruction: languageInstructionFor(studentInput),
      output_format: {
        quality: "no_attempt | insufficient | vague | misconception | partial | mostly_correct | assignment_bypass",
        is_meaningful: "boolean",
        ready_for_synthesis: "boolean",
        sensemaking_level: "L0_PRE_GAP | L1_DIFFUSE | L2_SPECIFIED | L3_BRIDGING | L4_USE",
        question_content_type: "WHAT | HOW_THINK | HOW_DO | WHICH | FACTUAL | TRADEOFF | JUSTIFICATION",
        primary_scaffold_family: "conceptual | metacognitive | procedural | strategic",
        secondary_scaffold_families: ["conceptual | metacognitive | procedural | strategic"],
        scaffold_type:
          "choice_prompt | conceptual_extension | misconception_repair | refinement_transfer | outline_first | organizing_frame",
        modeling: {
          activate: "boolean",
          dose: "none | light | medium | full",
          triggers: ["string"],
          counter_indicators: ["string"],
          rationale: "short private reason",
        },
        known_concepts: ["string"],
        missing_links: ["string"],
        misconceptions: ["string"],
        rationale: "short private reason",
      },
    }),
    maxOutputTokens: 550,
    verbosity: "low",
  });

  return normalizeContributionEvaluation(parseJsonObject(response.outputText), studentInput, activeTopic);
}

export async function generateParticipationSupport({ activeTopic, studentInput, evaluation }) {
  const response = await createOpenAIResponse({
    instructions: instructionsFor(studentInput),
    input: stageInput("participation_support", {
      active_question: activeTopic.question,
      student_input: studentInput,
      evaluation,
      language_instruction: languageInstructionFor(studentInput),
      required_behavior:
        "The student has not yet made a meaningful attempt. Do not answer the original question. Use L0/L1 metacognitive activation or localization. Make the task smaller by offering 2-3 choices, a sentence starter, or one concrete aspect to react to. Ask for one small response.",
      length_limits: {
        target: "60-120 words",
        bullets: "at most 3",
        ending: "must end with a complete question",
      },
    }),
    maxOutputTokens: 240,
    verbosity: "low",
  });

  return response.outputText;
}

export async function generateAdaptiveScaffold({
  activeTopic,
  studentInput,
  evaluation,
  scaffoldRound,
  grounding,
}) {
  const response = await createOpenAIResponse({
    instructions: instructionsFor(studentInput),
    input: stageInput("adaptive_scaffold", {
      active_question: activeTopic.question,
      prior_response: activeTopic.priorResponse,
      previous_scaffolds: activeTopic.scaffolds.map((item) => item.text),
      student_input: studentInput,
      evaluation,
      language_instruction: languageInstructionFor(studentInput),
      scaffold_round: scaffoldRound,
      grounding: groundingForPrompt(grounding),
      required_behavior:
        "Provide the smallest useful scaffold based on sensemaking_level, question_content_type, primary_scaffold_family, secondary_scaffold_families, scaffold_type, modeling, and grounding. Prioritize retrieved sources when grounding_mode is source_grounded. If grounding_mode is general_background_fallback, explicitly say that the provided sources did not contain enough support and label any explanation as General background. Do not provide a polished final answer. End by asking the student to retry or revise.",
      dosage_guidance: dosageGuidance(evaluation),
      length_limits: {
        ordinary_scaffold: "under 180-220 words",
        bullets: "at most 5",
        family_expansion: "expand only the primary scaffold family in detail",
        secondary_scaffolds: "one short metacognitive question",
        ending: "must end with a complete sentence or question; never end mid-list",
        expansion_policy: "if more detail is needed, ask which part the learner wants to expand",
      },
      family_rules: {
        conceptual:
          "Clarify concepts, boundaries, examples, non-examples, or conceptual relationships.",
        metacognitive:
          "Always support monitoring of understanding. Use activation at L0, localization at L1, hypothesis at L2, integration at L3, and transfer at L4.",
        procedural:
          "Give concrete steps, tools, methods, code-oriented sequence, IRB or dissertation process guidance when the gap is specified enough.",
        strategic:
          "Compare options, trade-offs, decision criteria, justification paths, or application strategies.",
      },
      scaffold_type_rules: {
        choice_prompt:
          "Offer 2-3 options or a sentence starter so the student can make a first attempt.",
        conceptual_extension:
          "Name the useful part of the student's idea and ask a concept-extending question.",
        misconception_repair:
          "Affirm the useful part, correct the misconception briefly, and ask for a revised explanation.",
        refinement_transfer:
          "Refine the student's mostly-correct idea and ask a transfer or application question.",
        outline_first:
          "Ask for a claim, evidence/example, and limitation before any polished writing.",
        organizing_frame:
          "Give a simple structure that helps organize fragmented ideas.",
      },
      modeling_rules: {
        none: "Do not model expert reasoning.",
        light:
          "Use only 1-2 sentences to surface a decision criterion, then ask the learner to apply it.",
        medium:
          "Show a 3-5 step expert reasoning sequence, but leave the final application step to the learner.",
        full:
          "Give a fuller expert walkthrough only for rescue or explicit request, then require learner articulation.",
      },
      output_shape:
        "Use this shape: 'What you already have: ...' then 'From the provided sources:' or 'General background:' when content support is needed, then 'Next scaffold: ...' then one metacognitive check or retry question. Paraphrase sources; do not reproduce long passages.",
    }),
    maxOutputTokens: 520,
    verbosity: "medium",
  });

  return response.outputText;
}

export async function generateClarification({ activeTopic, studentInput }) {
  const response = await createOpenAIResponse({
    instructions: instructionsFor(studentInput),
    input: stageInput("clarify_current_flow", {
      active_question: activeTopic.question,
      current_stage: activeTopic.stage,
      prior_response: activeTopic.priorResponse,
      last_scaffold: activeTopic.scaffolds.at(-1)?.text ?? "",
      student_input: studentInput,
      language_instruction: languageInstructionFor(studentInput),
      required_behavior:
        "Give a brief clarification that helps the student continue the current scaffolded flow. Do not give the full final answer. End by asking the student for the same kind of input the current stage needs.",
    }),
    maxOutputTokens: 260,
    verbosity: "low",
  });

  return response.outputText;
}

export async function generateAssignmentRedirect({ activeTopic, studentInput }) {
  const response = await createOpenAIResponse({
    instructions: instructionsFor(studentInput),
    input: stageInput("assignment_bypass_redirect", {
      active_question: activeTopic.question,
      current_stage: activeTopic.stage,
      prior_response: activeTopic.priorResponse,
      last_scaffold: activeTopic.scaffolds.at(-1)?.text ?? "",
      student_input: studentInput,
      language_instruction: languageInstructionFor(studentInput),
      required_behavior:
        "Do not provide a complete answer. Acknowledge the request, explain briefly that the chatbot will help build the answer from the student's thinking, and ask for a rough claim, guess, outline, or partial attempt.",
    }),
    maxOutputTokens: 240,
    verbosity: "low",
  });

  return response.outputText;
}

export async function generateResumePrompt(activeTopic) {
  const languageSeed = activeTopic.priorResponse || activeTopic.question;
  const response = await createOpenAIResponse({
    instructions: instructionsFor(languageSeed),
    input: stageInput("resume_paused_topic", {
      active_topic: {
        question: activeTopic.question,
        stage: activeTopic.stage,
        prior_response: activeTopic.priorResponse,
        prior_evaluation: activeTopic.priorEvaluation,
        previous_scaffolds: activeTopic.scaffolds.map((item) => item.text),
        retry_attempts: activeTopic.retryAttempts.map((item) => item.text),
      },
      language_instruction: languageInstructionFor(activeTopic.priorResponse || activeTopic.question),
      required_behavior:
        "Briefly remind the student where this paused topic left off, using the student's prior response and the last scaffold if available. Then ask for the next needed student input. Do not provide final synthesis unless the current stage is already complete.",
    }),
    maxOutputTokens: 260,
    verbosity: "low",
  });

  return response.outputText;
}

export async function generateFinalSynthesis(activeTopic, studentRetry, grounding) {
  const response = await createOpenAIResponse({
    instructions: instructionsFor(studentRetry),
    input: stageInput("final_synthesis", {
      student_question: activeTopic.question,
      student_prior_response: activeTopic.priorResponse,
      scaffold_history: activeTopic.scaffolds.map((item) => item.text),
      student_retry: studentRetry,
      language_instruction: languageInstructionFor(studentRetry),
      grounding: groundingForPrompt(grounding),
      required_behavior:
        "Now provide a concise final synthesis that explicitly builds on the student's own words. Prioritize retrieved sources when grounding_mode is source_grounded. If grounding_mode is general_background_fallback, clearly label the explanation as General background and say the provided sources did not contain enough support. Include L4 transfer metacognition at the end, such as asking how the learner would explain or apply this in a new context. Paraphrase sources; do not reproduce long passages.",
    }),
    maxOutputTokens: 450,
    verbosity: "medium",
  });

  return response.outputText;
}

export async function startTopic(studentQuestion) {
  const priorPrompt = await generatePriorKnowledgePrompt(studentQuestion);
  return {
    topic: createTopic(studentQuestion, priorPrompt),
    messages: [{ role: "assistant", text: priorPrompt }],
    debug: [],
  };
}

export async function resumeTopic(topic) {
  const prompt = await generateResumePrompt(topic);
  return {
    topic,
    messages: [
      { role: "assistant", text: `Let's return to this paused question: "${topic.question}"` },
      { role: "assistant", text: prompt },
    ],
    debug: [],
  };
}

export async function switchToNewTopic({ activeTopic, topicStack, studentQuestion, transition }) {
  if (activeTopic) topicStack.push(activeTopic);
  const started = await startTopic(studentQuestion);
  return {
    topic: started.topic,
    messages: [
      {
        role: "assistant",
        text: `${transition} I will pause the current question and start the new one with a prior knowledge check.`,
      },
      ...started.messages,
    ],
    debug: started.debug,
  };
}

export async function returnToPausedTopic({ activeTopic, topicStack, resumeTopicId }) {
  const pausedTopic = popPausedTopic(topicStack, resumeTopicId);
  if (!pausedTopic) {
    return {
      topic: activeTopic,
      messages: [
        {
          role: "assistant",
          text: "I do not have a paused topic to return to. Please type the question you want to work on.",
        },
      ],
      debug: [],
    };
  }

  if (activeTopic) topicStack.push(activeTopic);
  return resumeTopic(pausedTopic);
}

export async function handleTurnDecision({ decision, activeTopic, topicStack, studentInput }) {
  if (decision.intent === "continue_current") {
    return { action: "continue", activeTopic, messages: [], debug: [] };
  }

  if (decision.intent === "empty") {
    return {
      action: "handled",
      activeTopic,
      messages: [{ role: "assistant", text: "Give me even one rough idea, one confusing word, or a new question." }],
      debug: [],
    };
  }

  if (decision.intent === "greeting") {
    return {
      action: "handled",
      activeTopic,
      messages: [{ role: "assistant", text: greetingResponse(studentInput) }],
      debug: [],
    };
  }

  if (decision.intent === "meta_request") {
    return {
      action: "handled",
      activeTopic,
      messages: [
        {
          role: "assistant",
          text: "You can answer the current prompt, ask a quick clarification, switch to a new question, or ask to return to a paused topic. I will keep using prior knowledge checks before final answers.",
        },
      ],
      debug: [],
    };
  }

  if (decision.intent === "clarify_current") {
    const clarification = await generateClarification({ activeTopic, studentInput });
    return {
      action: "handled",
      activeTopic,
      messages: [{ role: "assistant", text: clarification }],
      debug: [],
    };
  }

  if (decision.intent === "assignment_bypass") {
    const redirect = await generateAssignmentRedirect({ activeTopic, studentInput });
    return {
      action: "handled",
      activeTopic,
      messages: [{ role: "assistant", text: redirect }],
      debug: [],
    };
  }

  if (decision.intent === "return_topic") {
    const next = await returnToPausedTopic({
      activeTopic,
      topicStack,
      resumeTopicId: decision.resume_topic_id,
    });
    return { action: "set_topic", activeTopic: next.topic, messages: next.messages, debug: next.debug };
  }

  if (decision.intent === "switch_topic" || decision.intent === "related_topic") {
    const newQuestion = decision.new_topic_question || studentInput;
    const transition =
      decision.intent === "related_topic"
        ? "That is related, so I will make it the active question."
        : "Okay, let's switch topics.";
    const next = await switchToNewTopic({
      activeTopic,
      topicStack,
      studentQuestion: newQuestion,
      transition,
    });
    return { action: "set_topic", activeTopic: next.topic, messages: next.messages, debug: next.debug };
  }

  return { action: "continue", activeTopic, messages: [], debug: [] };
}

export async function processPriorKnowledge(activeTopic, studentInput) {
  const evaluation = await evaluateContribution({
    stage: "waiting_for_prior_knowledge",
    activeTopic,
    studentInput,
  });

  if (!evaluation.is_meaningful || evaluation.quality === "no_attempt" || evaluation.quality === "insufficient") {
    const support = await generateParticipationSupport({ activeTopic, studentInput, evaluation });
    return {
      topic: activeTopic,
      messages: [{ role: "assistant", text: support }],
      debug: [{ label: "Attempt evaluation", evaluation }],
    };
  }

  activeTopic.priorResponse = studentInput;
  activeTopic.priorEvaluation = evaluation;

  const grounding = await retrieveGrounding({
    query: groundingQuery({
      activeTopic,
      studentInput,
      evaluation,
      stage: "first_scaffold",
    }),
  });

  const scaffold = await generateAdaptiveScaffold({
    activeTopic,
    studentInput,
    evaluation,
    scaffoldRound: "first_scaffold",
    grounding,
  });

  activeTopic.scaffolds.push({
    round: "first_scaffold",
    type: evaluation.scaffold_type,
    primary_family: evaluation.primary_scaffold_family,
    secondary_families: evaluation.secondary_scaffold_families,
    modeling: evaluation.modeling,
    grounding,
    text: scaffold,
  });
  activeTopic.stage = "waiting_for_retry";

  return {
    topic: activeTopic,
    messages: [{ role: "assistant", text: scaffold }],
    debug: [
      { label: "Chatbot plan", evaluation },
      { label: "Grounding", grounding },
    ],
  };
}

export async function processRetry(activeTopic, studentInput) {
  const evaluation = await evaluateContribution({
    stage: "waiting_for_retry",
    activeTopic,
    studentInput,
  });

  activeTopic.retryAttempts.push({
    text: studentInput,
    evaluation,
  });

  if (evaluation.ready_for_synthesis) {
    const grounding = await retrieveGrounding({
      query: groundingQuery({
        activeTopic,
        studentInput,
        evaluation,
        stage: "final_synthesis",
      }),
    });
    const finalSynthesis = await generateFinalSynthesis(activeTopic, studentInput, grounding);
    return {
      topic: null,
      messages: [{ role: "assistant", text: finalSynthesis }],
      debug: [
        { label: "Retry evaluation", evaluation },
        { label: "Grounding", grounding },
      ],
    };
  }

  const grounding = await retrieveGrounding({
    query: groundingQuery({
      activeTopic,
      studentInput,
      evaluation,
      stage: "second_or_later_scaffold",
    }),
  });

  const scaffold = await generateAdaptiveScaffold({
    activeTopic,
    studentInput,
    evaluation,
    scaffoldRound: "second_or_later_scaffold",
    grounding,
  });

  activeTopic.scaffolds.push({
    round: "second_or_later_scaffold",
    type: evaluation.scaffold_type,
    primary_family: evaluation.primary_scaffold_family,
    secondary_families: evaluation.secondary_scaffold_families,
    modeling: evaluation.modeling,
    grounding,
    text: scaffold,
  });

  return {
    topic: activeTopic,
    messages: [{ role: "assistant", text: scaffold }],
    debug: [
      { label: "Chatbot second plan", evaluation },
      { label: "Grounding", grounding },
    ],
  };
}

export async function advanceConversation({ state, studentInput }) {
  const topicStack = state.topicStack ?? [];
  let activeTopic = state.activeTopic ?? null;
  const messages = [];
  const debug = [];

  if (isGreeting(studentInput)) {
    messages.push({ role: "assistant", text: greetingResponse(studentInput) });
    return { state: { activeTopic, topicStack }, messages, debug };
  }

  if (!activeTopic) {
    if (topicStack.length > 0 && isReturnRequest(studentInput)) {
      const returned = await returnToPausedTopic({
        activeTopic: null,
        topicStack,
        resumeTopicId: null,
      });
      activeTopic = returned.topic;
      messages.push(...returned.messages);
      debug.push(...returned.debug);
    } else {
      const started = await startTopic(studentInput);
      activeTopic = started.topic;
      messages.push(...started.messages);
      debug.push(...started.debug);
    }

    return { state: { activeTopic, topicStack }, messages, debug };
  }

  const decision = await classifyTurn({
    stage: activeTopic.stage,
    activeTopic,
    studentInput,
    topicStack,
  });
  debug.push({ label: "Turn decision", decision });

  const turnHandling = await handleTurnDecision({
    decision,
    activeTopic,
    topicStack,
    studentInput,
  });
  activeTopic = turnHandling.activeTopic;
  messages.push(...turnHandling.messages);
  debug.push(...turnHandling.debug);

  if (turnHandling.action !== "continue") {
    return { state: { activeTopic, topicStack }, messages, debug };
  }

  if (activeTopic.stage === "waiting_for_prior_knowledge") {
    const prior = await processPriorKnowledge(activeTopic, studentInput);
    activeTopic = prior.topic;
    messages.push(...prior.messages);
    debug.push(...prior.debug);
    return { state: { activeTopic, topicStack }, messages, debug };
  }

  const retry = await processRetry(activeTopic, studentInput);
  activeTopic = retry.topic;
  messages.push(...retry.messages);
  debug.push(...retry.debug);
  return { state: { activeTopic, topicStack }, messages, debug };
}
