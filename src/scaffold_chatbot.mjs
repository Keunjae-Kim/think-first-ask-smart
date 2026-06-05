import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const Domains = {
  EDUCATIONAL_TECHNOLOGY: "educational_technology",
  LEARNING_SCIENCES: "learning_sciences",
  RESEARCH_METHODS: "research_methodology_in_education",
  UNKNOWN: "unknown",
};

const TaskTypes = {
  CONCEPT: "concept_explanation",
  WRITING: "writing_support",
  RESEARCH_DESIGN: "research_design_support",
  METHOD_SELECTION: "method_selection",
  CRITIQUE: "critique_or_feedback",
};

const domainKeywords = {
  [Domains.EDUCATIONAL_TECHNOLOGY]: [
    "tpack",
    "samr",
    "technology",
    "ai",
    "lms",
    "online",
    "hybrid",
    "analytics",
    "microbit",
    "arduino",
  ],
  [Domains.LEARNING_SCIENCES]: [
    "scaffolding",
    "constructivism",
    "metacognition",
    "prior knowledge",
    "motivation",
    "zpd",
    "transfer",
    "cognitive",
    "learning theory",
  ],
  [Domains.RESEARCH_METHODS]: [
    "validity",
    "reliability",
    "qualitative",
    "quantitative",
    "mixed methods",
    "research question",
    "interview",
    "survey",
    "sampling",
    "case study",
    "experiment",
  ],
};

const taskKeywords = {
  [TaskTypes.WRITING]: ["write", "essay", "discussion post", "paragraph", "draft"],
  [TaskTypes.RESEARCH_DESIGN]: ["study", "research", "design", "participants", "data"],
  [TaskTypes.METHOD_SELECTION]: ["method", "qualitative", "quantitative", "mixed"],
  [TaskTypes.CRITIQUE]: ["critique", "evaluate", "limitations", "strengths"],
  [TaskTypes.CONCEPT]: ["what is", "explain", "define", "difference", "compare"],
};

function containsAny(text, keywords) {
  const normalized = text.toLowerCase();
  return keywords.some((keyword) => normalized.includes(keyword));
}

function classifyDomain(text) {
  for (const [domain, keywords] of Object.entries(domainKeywords)) {
    if (containsAny(text, keywords)) return domain;
  }
  return Domains.UNKNOWN;
}

function classifyTask(text) {
  for (const [taskType, keywords] of Object.entries(taskKeywords)) {
    if (containsAny(text, keywords)) return taskType;
  }
  return TaskTypes.CONCEPT;
}

function priorKnowledgePrompt(domain, taskType) {
  if (taskType === TaskTypes.WRITING) {
    return "I can help you build that, but first share your current claim or 2-3 rough bullet points. What do you already want to say?";
  }

  if (taskType === TaskTypes.RESEARCH_DESIGN || taskType === TaskTypes.METHOD_SELECTION) {
    return "Before choosing a method, tell me your research question, what kind of data you imagine collecting, and what you want to understand or measure.";
  }

  if (taskType === TaskTypes.CRITIQUE) {
    return "Before I critique it, share your current view: what seems useful, limited, confusing, or risky?";
  }

  if (domain === Domains.UNKNOWN) {
    return "Before I answer, tell me what you already know or what you are guessing. I will use that to decide how much scaffolding to give.";
  }

  return "Before I explain, tell me what you already know about this topic in 1-2 sentences. A rough guess is fine.";
}

function analyzePriorResponse(response, domain) {
  const words = response.trim().split(/\s+/).filter(Boolean);
  const lowered = response.toLowerCase();
  const analysis = {
    knownConcepts: [],
    missingLinks: [],
    misconceptions: [],
    confidence: "unknown",
    responseDepth: "unknown",
  };

  if (words.length < 5) {
    analysis.responseDepth = "thin";
    analysis.missingLinks.push("student needs to make an initial attempt");
    return analysis;
  }

  analysis.responseDepth = words.length >= 18 ? "substantive" : "partial";

  if (["not sure", "maybe", "i think", "guess"].some((marker) => lowered.includes(marker))) {
    analysis.confidence = "low";
  } else if (["definitely", "clearly", "i know"].some((marker) => lowered.includes(marker))) {
    analysis.confidence = "high";
  } else {
    analysis.confidence = "medium";
  }

  for (const keywords of Object.values(domainKeywords)) {
    for (const keyword of keywords) {
      if (lowered.includes(keyword) && !analysis.knownConcepts.includes(keyword)) {
        analysis.knownConcepts.push(keyword);
      }
    }
  }

  if (domain === Domains.LEARNING_SCIENCES) {
    analysis.missingLinks.push("mechanism of learning", "learner explanation or transfer");
  } else if (domain === Domains.EDUCATIONAL_TECHNOLOGY) {
    analysis.missingLinks.push("pedagogical purpose", "context of technology use");
  } else if (domain === Domains.RESEARCH_METHODS) {
    analysis.missingLinks.push("alignment between research question, data, and inference");
  } else {
    analysis.missingLinks.push("domain-specific connection");
  }

  if (lowered.includes("learn by themselves")) {
    analysis.misconceptions.push("active learning confused with learning alone");
  }
  if (lowered.includes("technology is always better")) {
    analysis.misconceptions.push("technology treated as inherently beneficial");
  }
  if (lowered.includes("validity means true")) {
    analysis.misconceptions.push("validity treated as simple truth rather than support for an inference");
  }

  return analysis;
}

function scaffold(domain, taskType, analysis) {
  if (analysis.responseDepth === "thin") {
    return "Let's make the first step smaller. Give me one rough idea, one example, or one confusing word from the question. Then I will build from there.";
  }

  if (analysis.misconceptions.length > 0) {
    return `Useful starting point. One thing to refine: ${analysis.misconceptions[0]}. Can you revise your explanation with that distinction in mind?`;
  }

  if (taskType === TaskTypes.WRITING) {
    return "Good. Now shape your idea into this frame: claim, evidence or example, and one limitation or condition. Try drafting those three pieces before we turn it into polished prose.";
  }

  if (taskType === TaskTypes.RESEARCH_DESIGN || taskType === TaskTypes.METHOD_SELECTION) {
    return "Your direction is useful. Now decide what you mainly want: meanings and experiences, measurable patterns, causal effects, or design improvement. Which one best matches your research question?";
  }

  if (domain === Domains.LEARNING_SCIENCES) {
    return "You have a useful starting idea. Add the learning mechanism: how does this help the learner connect prior knowledge, notice a gap, revise thinking, or transfer the idea?";
  }

  if (domain === Domains.EDUCATIONAL_TECHNOLOGY) {
    return "Good start. Now connect the technology to pedagogy: what learning activity does the tool make possible, and why is that better than using the tool just for convenience?";
  }

  if (domain === Domains.RESEARCH_METHODS) {
    return "Good start. Now align the pieces: what is the research question, what data would answer it, and what kind of claim could that data actually support?";
  }

  return "Good start. Add one example and one reason. That will help us move from a general answer to a stronger explanation.";
}

function finalSynthesis(domain) {
  if (domain === Domains.LEARNING_SCIENCES) {
    return "Building on your explanation, a stronger final answer should name the learner's active thinking, the role of prior knowledge, and the support that helps the learner revise or extend understanding.";
  }

  if (domain === Domains.EDUCATIONAL_TECHNOLOGY) {
    return "Building on your explanation, a stronger final answer should connect the tool to a specific learning purpose, teaching strategy, and context. The important point is not technology use by itself, but how it changes or supports learning.";
  }

  if (domain === Domains.RESEARCH_METHODS) {
    return "Building on your explanation, a stronger final answer should align the research question, data source, analysis method, and the kind of inference the study can reasonably make.";
  }

  return "Building on your explanation, a stronger final answer should state the key idea, explain the reasoning, and include a brief example or application.";
}

async function main() {
  const rl = readline.createInterface({ input, output });

  console.log("Scaffolded Learning Chatbot Prototype");
  console.log("Supported domains: educational technology, learning sciences, education research methods");
  console.log("Type 'quit' to exit.\n");

  while (true) {
    const question = (await rl.question("Student question: ")).trim();
    if (["quit", "exit"].includes(question.toLowerCase())) break;
    if (!question) continue;

    const domain = classifyDomain(question);
    const taskType = classifyTask(question);

    console.log(`\nDetected domain: ${domain}`);
    console.log(`Detected task type: ${taskType}\n`);

    console.log(`Chatbot: ${priorKnowledgePrompt(domain, taskType)}`);
    const prior = (await rl.question("\nStudent prior knowledge: ")).trim();
    const analysis = analyzePriorResponse(prior, domain);

    console.log("\nAnalysis:");
    console.log(`- Response depth: ${analysis.responseDepth}`);
    console.log(`- Confidence: ${analysis.confidence}`);
    console.log(`- Known concepts: ${analysis.knownConcepts.join(", ") || "none detected"}`);
    console.log(`- Missing links: ${analysis.missingLinks.join(", ") || "none detected"}`);
    console.log(`- Misconceptions: ${analysis.misconceptions.join(", ") || "none detected"}`);

    console.log(`\nChatbot scaffold: ${scaffold(domain, taskType, analysis)}`);
    await rl.question("\nStudent retry: ");

    console.log(`\nFinal synthesis: ${finalSynthesis(domain)}`);
    console.log("Reflection check: Can you summarize the idea in your own words in one sentence?\n");
  }

  rl.close();
  console.log("Goodbye.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
