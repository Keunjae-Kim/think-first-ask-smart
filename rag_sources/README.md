# RAG Sources

Place source materials for the RAG-first prototype in `rag_sources/files`.

The current no-dependency prototype reads:

- `.txt`
- `.md`
- `.jsonl`

For now, convert PDFs into text or Markdown before adding them. A practical naming pattern is:

```text
author_year_short-title.txt
```

The chatbot uses these files as the first grounding layer. If it cannot find enough relevant evidence, it labels the response as general background instead of pretending the answer came from the provided sources.
