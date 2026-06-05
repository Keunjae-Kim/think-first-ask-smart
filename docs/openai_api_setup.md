# OpenAI API Setup

This project now includes an OpenAI API version of the scaffolded learning chatbot.

The API version keeps the same learning flow:

```text
student question
-> prior knowledge prompt
-> student prior response
-> analysis and scaffold
-> student retry
-> final synthesis
```

## 1. Create A Local Environment File

Copy `.env.example` to `.env`.

```powershell
Copy-Item .env.example .env
```

Open `.env` and replace the placeholder with your OpenAI API key:

```text
OPENAI_API_KEY=your_real_key_here
OPENAI_MODEL=gpt-5-mini
USAGE_LOGGING=false
LOG_RAW_TEXT=false
REQUIRE_LOG_CONSENT=true
USAGE_LOG_DIR=logs
RAG_ENABLED=true
RAG_SOURCES_DIR=rag_sources/files
RAG_TOP_K=3
RAG_MIN_SCORE=1.2
```

Do not share the `.env` file. It is listed in `.gitignore` because API keys must stay private.

## 2. Run The API Prototype

```powershell
node .\src\scaffold_llm_chatbot.mjs
```

If the default `node` command is blocked in Codex Desktop, use the bundled runtime:

```powershell
& "C:\Users\keund\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" .\src\scaffold_llm_chatbot.mjs
```

## 2a. Run The Browser Prototype

The browser prototype uses the same scaffolded learning engine, but displays it in a local web chat interface.

```powershell
node .\src\web_server.mjs
```

If the default `node` command is blocked:

```powershell
& "C:\Users\keund\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" .\src\web_server.mjs
```

Then open:

```text
http://localhost:3000
```

Do not put the OpenAI API key in browser JavaScript. The browser sends messages to the local server, and the local server calls the OpenAI API using `.env`.

## 3. Model Choice

The default is:

```text
OPENAI_MODEL=gpt-5-mini
```

This is a reasonable prototype choice because it is faster and more cost-efficient than a flagship model. For higher-quality reasoning, change it to:

```text
OPENAI_MODEL=gpt-5.2
```

## 4. What This Prototype Does

The app, not the model alone, controls the interaction phase.

The model is called separately for:

- Generating a prior knowledge prompt
- Classifying whether the student is continuing, clarifying, switching topics, or bypassing the learning flow
- Evaluating whether the student's prior response is a meaningful attempt
- Diagnosing sense-making level and question content type
- Selecting primary and secondary scaffold families from the multi-type matrix
- Deciding whether expert modeling should activate and at what dose
- Evaluating retry quality before final synthesis
- Retrieving local source excerpts for RAG-first grounding after the learner has provided prior knowledge
- Analyzing the student's prior response and giving a scaffold
- Generating a final synthesis after the student retries

This helps prevent the model from giving a full final answer too early.

The prototype now allows topic switching and topic return. If the student asks a new question while the chatbot is waiting for prior knowledge or a retry, the chatbot pauses the previous topic and starts the new one with a prior knowledge check. If the student asks to return to the earlier topic, the chatbot reconstructs the prior state and continues from there.

## 5. What This Prototype Does Not Do Yet

It does not yet:

- Save learner state across sessions
- Use a database
- Use retrieval-augmented generation with course readings
- Connect to Arduino or micro:bit
- Upload or anonymize research logs

Those are good next steps after the CLI version behaves well.
