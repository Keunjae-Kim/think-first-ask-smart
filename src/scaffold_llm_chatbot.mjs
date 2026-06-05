import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { advanceConversation, isExitCommand } from "./scaffold_engine.mjs";

function describePlan(debugItem) {
  const evaluation = debugItem?.evaluation;
  if (!evaluation) return "";

  return `${evaluation.sensemaking_level} / ${evaluation.question_content_type} / primary=${evaluation.primary_scaffold_family} / secondary=${evaluation.secondary_scaffold_families.join(", ") || "none"} / modeling=${evaluation.modeling.dose}`;
}

async function main() {
  const rl = readline.createInterface({ input, output });

  console.log("Think First, Ask Smart");
  console.log("Supported domains: educational technology, learning sciences, education research methods");
  console.log("Type 'quit' at any prompt to exit.\n");
  console.log(`Welcome to Think First, Ask Smart.

This chatbot is designed to help you learn more actively.
Instead of giving you an immediate final answer, it will first ask what you already know, what you think, or how you would approach the question.

The goal is not to make learning harder.
The goal is to help you avoid relying too quickly on AI and to strengthen your own thinking.

When you ask a question, be ready to do three things:

1. Explain what you already know.
2. Share your first guess or reasoning.
3. Connect your question to learning, educational technology, or research methods when possible.

You do not need to be correct at first.
Your first attempt helps the chatbot give you better support.

The chatbot will guide you step by step, give hints when needed, and help you build a stronger answer after you try first.
`);

  const state = {
    activeTopic: null,
    topicStack: [],
  };

  while (true) {
    const prompt = state.activeTopic
      ? state.activeTopic.stage === "waiting_for_prior_knowledge"
        ? "Student prior knowledge (or new question/return): "
        : "Student retry (or new question/return): "
      : state.topicStack.length > 0
        ? "Student question (or return): "
        : "Student question: ";

    const studentInput = (await rl.question(prompt)).trim();
    if (isExitCommand(studentInput)) break;
    if (!studentInput) continue;

    try {
      console.log("\nChatbot is thinking...\n");
      const result = await advanceConversation({ state, studentInput });
      state.activeTopic = result.state.activeTopic;
      state.topicStack = result.state.topicStack;

      for (const item of result.debug) {
        if (item.label === "Chatbot plan" || item.label === "Chatbot second plan") {
          console.log(`${item.label}: ${describePlan(item)}\n`);
        }
      }

      for (const message of result.messages) {
        console.log(`Chatbot: ${message.text}\n`);
      }
    } catch (error) {
      console.error(`\n${error.message}\n`);
    }
  }

  rl.close();
  console.log("Goodbye.");
}

main().catch((error) => {
  console.error(`\n${error.message}\n`);
  process.exitCode = 1;
});
