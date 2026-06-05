# Think First, Ask Smart

This workspace contains an early design and prototype package for Think First, Ask Smart, a learning-support chatbot for undergraduate and graduate students.

The chatbot is designed for three initial knowledge domains:

- Educational technology
- Learning sciences
- Research methodology in education

Its core purpose is to reduce unproductive cognitive offloading by delaying complete answers and prompting students to activate prior knowledge before receiving scaffolding.

## Core Interaction Flow

```text
student question
-> prior knowledge question
-> student response analysis
-> scaffolding
-> student retry
-> final synthesis
```

## Contents

- `docs/chatbot_design.md`: Conceptual and pedagogical design.
- `docs/training_data_guide.md`: Data design, annotation guidance, and collection plan.
- `docs/openai_api_setup.md`: Beginner setup guide for the OpenAI API prototype.
- `docs/domain_knowledge_training_strategy.md`: Guidance on prompting, RAG, and fine-tuning.
- `docs/scaffolding_framework.md`: Sense-making, scaffold family, and modeling decision framework.
- `docs/logging_and_research_data.md`: Local usage logging guide for prompts and timing data.
- `docs/rag_first_grounding.md`: RAG-first grounding behavior and source folder guide.
- `prompts/system_prompt.md`: Base system prompt for an LLM-powered version.
- `prompts/interaction_policy.md`: Response-level policy for controlling answer release.
- `data/schema/training_example.schema.json`: JSON schema for training/evaluation examples.
- `data/seed/seed_training_examples.jsonl`: Initial seed examples across the three target domains.
- `data/seed/evaluation_cases.jsonl`: Evaluation cases for checking whether the chatbot follows the desired flow.
- `src/scaffold_chatbot.mjs`: Lightweight command-line prototype that demonstrates the interaction flow without external APIs.
- `src/scaffold_llm_chatbot.mjs`: OpenAI API command-line prototype using the same scaffolded learning flow.
- `src/scaffold_engine.mjs`: Shared scaffolded conversation engine used by the CLI and web app.
- `src/web_server.mjs`: Local browser-based prototype server.
- `src/openai_client.mjs`: Minimal OpenAI Responses API client using native `fetch`.
- `src/validate_dataset.mjs`: Dependency-free JSONL validation helper for seed training examples.
- `web/`: Browser chat interface.

## Try The Prototype

From this directory:

```powershell
node .\src\scaffold_chatbot.mjs
```

The prototype is intentionally simple. It does not call an LLM; it demonstrates the learning interaction structure and can later be connected to an LLM API, LMS, Arduino, or micro:bit input pipeline.

## Try The OpenAI API Prototype

Create `.env` from `.env.example`, add your API key, then run:

```powershell
node .\src\scaffold_llm_chatbot.mjs
```

See `docs/openai_api_setup.md` for beginner-friendly setup details.

## Try The Browser Prototype

After setting up `.env`, run:

```powershell
node .\src\web_server.mjs
```

Then open:

```text
http://localhost:3000
```

If the default `node` command is blocked in Codex Desktop, use the bundled Node runtime path from `docs/openai_api_setup.md`.

## Optional Usage Logging

The browser prototype can save local JSONL logs with student prompts, dwell time, server turn duration, and scaffold diagnosis summaries. Logging is off by default.

See `docs/logging_and_research_data.md` before enabling raw prompt logging.

## Optional RAG-First Grounding

Add `.txt`, `.md`, or `.jsonl` source files under:

```text
rag_sources/files
```

The chatbot uses these sources first after the learner has provided prior knowledge. If it cannot find enough support in the provided sources, it labels the response as general background instead of pretending it is source-grounded.

See `docs/rag_first_grounding.md` for details.

## Validate Seed Data

```powershell
node .\src\validate_dataset.mjs
```

If the default `node` command is blocked in the Codex desktop environment, use the bundled runtime path shown by the workspace dependencies tool.
