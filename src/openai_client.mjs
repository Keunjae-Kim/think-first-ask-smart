import fs from "node:fs";

const DEFAULT_MODEL = "gpt-5-mini";
const API_URL = "https://api.openai.com/v1/responses";

function defaultReasoningEffortForModel(model) {
  if (model.startsWith("gpt-5.2")) return "low";
  if (model.startsWith("gpt-5-mini") || model.startsWith("gpt-5")) return "minimal";
  return null;
}

export function loadDotEnv(path = ".env") {
  if (!fs.existsSync(path)) return;

  const lines = fs.readFileSync(path, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex === -1) continue;

    const key = trimmed.slice(0, equalsIndex).trim();
    let value = trimmed.slice(equalsIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (key && !(key in process.env)) {
      process.env[key] = value;
    }
  }
}

function extractOutputText(responseJson) {
  if (typeof responseJson.output_text === "string") {
    return responseJson.output_text.trim();
  }

  const chunks = [];
  for (const item of responseJson.output ?? []) {
    for (const content of item.content ?? []) {
      if (typeof content.text === "string") chunks.push(content.text);
    }
  }

  return chunks.join("\n").trim();
}

export async function createOpenAIResponse({
  instructions,
  input,
  model = process.env.OPENAI_MODEL || DEFAULT_MODEL,
  maxOutputTokens = 500,
  reasoningEffort,
  verbosity = "medium",
}) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Missing OPENAI_API_KEY. Create a .env file from .env.example or set OPENAI_API_KEY in your shell.",
    );
  }

  const payload = {
    model,
    instructions,
    input,
    text: { verbosity },
    max_output_tokens: maxOutputTokens,
    store: false,
  };

  const resolvedReasoningEffort = reasoningEffort ?? defaultReasoningEffortForModel(model);
  if (resolvedReasoningEffort) {
    payload.reasoning = { effort: resolvedReasoningEffort };
  }

  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const responseText = await response.text();
  let responseJson;
  try {
    responseJson = JSON.parse(responseText);
  } catch {
    throw new Error(`OpenAI API returned non-JSON response: ${responseText}`);
  }

  if (!response.ok) {
    const message = responseJson.error?.message || responseText;
    throw new Error(`OpenAI API error ${response.status}: ${message}`);
  }

  return {
    id: responseJson.id,
    outputText: extractOutputText(responseJson),
    raw: responseJson,
  };
}
