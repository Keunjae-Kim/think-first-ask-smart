# Adaptive Answer Release

The tutor supports reflection through useful explanations, not repeated questioning.

| Learner contribution | Response |
| --- | --- |
| Bare broad question | Brief orientation and one activation question |
| Initial question includes a guess, example, or constraint | Use it immediately; skip redundant elicitation |
| Short relevant or mistaken idea | Explanation, contrast, or correction plus at most one question |
| No starting point | Plain explanation and example to react to; no mastery claim |
| Narrow fact or clarification | Direct concise answer; reflection optional |
| Adequate understanding | Synthesis and natural closure |
| Two meaningful retries without resolution | Supported answer to the gap, unresolved assumptions stated |
| Submission-ready answer request | Partial outline and one small learner contribution |

Sense-making levels, scaffold families, modeling conditions and dosage remain independent. A supported answer does not authorize full expert modeling or imply mastery. Source citations and general-background labeling remain visible; pedagogical headings remain internal.

The live engine evaluates the initial message before choosing activation or help. This adds one diagnostic API call at topic start. Response mode is recorded in the plan's debug label. Model-generated judgments remain fallible.

The Pages demo uses scripted responses, not semantic assessment. It illustrates reflection and has a cognitive-offloading example, but cannot validate arbitrary graduate-level answers. Its closing text must not claim the student has mastered the topic.

Run `node --test src/response_policy.test.mjs src/turn_routing.test.mjs src/web_interaction.test.mjs`. Tests cover branching and mocked API integration, not the pedagogical quality of live model outputs.
