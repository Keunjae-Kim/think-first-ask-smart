# RAG-First Grounding

The chatbot now supports a RAG-first grounding layer.

The intended behavior is:

```text
RAG-first
-> source evidence available: source-grounded scaffold
-> source evidence weak/missing: labeled general background
-> always preserve anti-offloading flow
-> log which mode was used
```

## Add Sources

Put source files here:

```text
rag_sources/files
```

The current prototype reads `.txt`, `.md`, and `.jsonl` files without installing extra packages.

For PDF articles or book chapters, convert the PDF to text first and place the text file in `rag_sources/files`. Direct PDF parsing can be added later with a PDF extraction dependency.

## Environment Settings

In `.env`:

```text
RAG_ENABLED=true
RAG_SOURCES_DIR=rag_sources/files
RAG_TOP_K=3
RAG_MIN_SCORE=1.2
```

## How The Chatbot Uses Sources

RAG is not used before the prior knowledge prompt. The chatbot first asks what the learner already knows.

After the learner responds, the chatbot retrieves source chunks using:

- The active question
- The learner's prior response or retry
- Current scaffold diagnosis terms

If relevant source chunks are found, the response should prioritize them and label source-based content as:

```text
From the provided sources:
```

If sources are weak or missing, the response should say:

```text
I could not find enough support in the provided sources.

General background:
```

The anti-offloading flow still applies. The chatbot should use sources to make scaffolds more accurate, not to immediately give a polished answer.

## Log Fields

Usage logs include grounding information through `debug_summary`, for example:

```json
{
  "label": "Grounding",
  "grounding_mode": "source_grounded",
  "evidence_strength": "strong",
  "retrieved_sources": [
    {
      "title": "article_title",
      "source_path": "article.txt",
      "score": 2.4
    }
  ]
}
```

Possible modes:

- `source_grounded`
- `general_background_fallback`
- `rag_disabled`
