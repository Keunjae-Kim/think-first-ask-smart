import fs from "node:fs";

const schema = JSON.parse(fs.readFileSync("data/schema/training_example.schema.json", "utf8"));
const examplesPath = "data/seed/seed_training_examples.jsonl";

const required = schema.required;
const domainValues = new Set(schema.properties.domain.enum);
const learnerLevelValues = new Set(schema.properties.learner_level.enum);
const taskTypeValues = new Set(schema.properties.task_type.enum);
const scaffoldStrategyValues = new Set(schema.properties.scaffold_strategy.enum);

function fail(id, message) {
  throw new Error(`${id}: ${message}`);
}

function assertArray(value, id, field) {
  if (!Array.isArray(value)) {
    fail(id, `${field} must be an array`);
  }
}

const rows = fs
  .readFileSync(examplesPath, "utf8")
  .trim()
  .split(/\r?\n/)
  .filter(Boolean)
  .map((line, index) => {
    try {
      return JSON.parse(line);
    } catch (error) {
      fail(`line ${index + 1}`, `invalid JSON: ${error.message}`);
    }
  });

for (const row of rows) {
  const id = row.id || "missing-id";

  for (const field of required) {
    if (!(field in row)) {
      fail(id, `missing required field "${field}"`);
    }
  }

  if (!domainValues.has(row.domain)) fail(id, `invalid domain "${row.domain}"`);
  if (!learnerLevelValues.has(row.learner_level)) fail(id, `invalid learner_level "${row.learner_level}"`);
  if (!taskTypeValues.has(row.task_type)) fail(id, `invalid task_type "${row.task_type}"`);
  if (!scaffoldStrategyValues.has(row.scaffold_strategy)) {
    fail(id, `invalid scaffold_strategy "${row.scaffold_strategy}"`);
  }

  if (typeof row.analysis !== "object" || row.analysis === null) {
    fail(id, "analysis must be an object");
  }

  assertArray(row.analysis.known_concepts, id, "analysis.known_concepts");
  assertArray(row.analysis.missing_links, id, "analysis.missing_links");
  assertArray(row.analysis.misconceptions, id, "analysis.misconceptions");
  assertArray(row.tags, id, "tags");

  if (!Number.isInteger(row.answer_release_level) || row.answer_release_level < 0 || row.answer_release_level > 4) {
    fail(id, "answer_release_level must be an integer from 0 to 4");
  }
}

console.log(`Validated ${rows.length} training examples.`);
