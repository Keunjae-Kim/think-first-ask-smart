# Training Data Guide

## Dataset Purpose

The dataset should train and evaluate whether the chatbot follows a scaffolded learning flow rather than giving immediate complete answers.

The data should prioritize interaction quality, not just answer correctness.

## Initial Domain Boundaries

Use examples only from:

- Educational technology
- Learning sciences
- Research methodology in education

Avoid examples from unrelated domains unless they are used as analogies inside one of the target domains.

## Recommended Example Format

Each JSONL row should represent one complete learning episode:

```json
{
  "id": "ls-001",
  "domain": "learning_sciences",
  "learner_level": "undergraduate",
  "task_type": "concept_explanation",
  "student_question": "What is scaffolding?",
  "prior_knowledge_prompt": "Before I explain, what do you already know about scaffolding in learning?",
  "student_prior_response": "I think it means helping students step by step.",
  "analysis": {
    "known_concepts": ["step-by-step help"],
    "missing_links": ["temporary support", "fading", "learner independence"],
    "misconceptions": [],
    "confidence": "medium"
  },
  "scaffold_strategy": "conceptual_extension",
  "scaffold_response": "Good start. The key addition is that scaffolding is temporary support that should fade as learners gain independence. Why do you think fading matters?",
  "student_retry": "Because if support never fades, students may depend on it instead of learning to do it themselves.",
  "final_synthesis": "Exactly. Scaffolding is temporary, adaptive support that helps learners perform just beyond what they could do alone, with support gradually removed as competence increases.",
  "answer_release_level": 4,
  "tags": ["scaffolding", "zpd", "fading"]
}
```

## Annotation Dimensions

### Domain

Use one of:

- `educational_technology`
- `learning_sciences`
- `research_methodology_in_education`

### Learner Level

Use one of:

- `undergraduate`
- `graduate`
- `unknown`

### Task Type

Use one of:

- `concept_explanation`
- `problem_solving`
- `writing_support`
- `research_design_support`
- `article_interpretation`
- `method_selection`
- `critique_or_feedback`

### Scaffold Strategy

Use one of:

- `prior_knowledge_activation`
- `hint`
- `guiding_question`
- `conceptual_extension`
- `conceptual_contrast`
- `analogy`
- `partial_explanation`
- `misconception_repair`
- `worked_example_fragment`
- `methodological_decision_tree`
- `revision_prompt`
- `final_synthesis`

## Data Collection Plan

### Phase 1: Expert-Written Seed Data

Create 50-100 high-quality examples manually.

Suggested balance:

- 20 educational technology examples
- 20 learning sciences examples
- 20 research methodology examples
- 20 mixed or ambiguous cases
- 20 assignment-risk cases where the student asks for a complete answer

### Phase 2: Simulated Student Variants

For each seed example, create student prior responses at different levels:

- Blank or evasive
- Vague but partially correct
- Confident misconception
- Mostly correct
- Advanced but incomplete

### Phase 3: Human Review

Have instructors or graduate researchers rate:

- Did the chatbot avoid giving the full answer too early?
- Did it identify prior knowledge correctly?
- Was the scaffold appropriate?
- Did the final synthesis build on the student's own response?
- Would this interaction support learning rather than answer copying?

## Evaluation Rubric

Score each chatbot response from 1 to 5.

| Criterion | 1 | 3 | 5 |
|---|---|---|---|
| Prior knowledge activation | No elicitation | Generic elicitation | Specific, relevant elicitation |
| Scaffolding quality | Full answer or vague hint | Some useful support | Adaptive support matched to student response |
| Cognitive offloading control | Assignment-ready answer first | Partial control | Student reasoning required before final answer |
| Conceptual accuracy | Incorrect | Mostly correct | Accurate and appropriately nuanced |
| Metacognitive support | None | Basic check | Prompts reflection or transfer |

## Data To Avoid

Avoid examples that train the chatbot to:

- Produce polished essays before student thinking is shown
- Complete homework without interaction
- Ignore student misconceptions
- Give long explanations when a small scaffold would work
- Treat all students as beginners
- Refuse help instead of redirecting toward learning
