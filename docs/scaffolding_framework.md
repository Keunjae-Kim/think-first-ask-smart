# Sense-Making Scaffolding Framework

This document records the current answer-release and scaffolding decision framework used by the prototype.

The chatbot should not choose scaffold type from the learner's level alone. It should diagnose two things:

```text
sense-making level -> how directly to intervene
question content type -> which scaffold family should be primary
```

## Sense-Making Levels

| Level | Name | Description |
|---|---|---|
| L0 | Pre-gap | Learner has not yet articulated a gap |
| L1 | Diffuse | Learner knows something is unclear but cannot localize it |
| L2 | Specified | Learner can name the gap, uncertainty, method issue, or decision point |
| L3 | Bridging | Learner connects new understanding with prior knowledge |
| L4 | Use | Learner applies the idea in a new practical context |

## Multi-Type Matrix

H means high or primary, M means regular, L means light or occasional.

| Level | Conceptual | Metacognitive | Procedural | Strategic |
|---|---|---|---|---|
| L0 Pre-gap | H | M | L | L |
| L1 Diffuse | M | H | L | M |
| L2 Specified | M | H | H | H |
| L3 Bridging | H | M | M | H |
| L4 Use | M | H | H | H |

## Metacognitive Scaffolding

Metacognitive scaffolding is active at every level. Only its form changes.

| Level | Form | Example |
|---|---|---|
| L0 | Activation metacognition | What intuition or impression do you already have? |
| L1 | Localization metacognition | Where does it start to break down for you? |
| L2 | Hypothesis metacognition | Why do you think this approach may not work? |
| L3 | Integration metacognition | How does this connect to what you thought before? |
| L4 | Transfer metacognition | How would you explain this to a peer who has never seen it? |

## Question Content Types

| Content Type | Primary Scaffold Family |
|---|---|
| WHAT | Conceptual |
| HOW_THINK | Metacognitive |
| HOW_DO | Procedural |
| WHICH | Strategic |
| FACTUAL | Conceptual, minimal expansion |
| TRADEOFF | Strategic |
| JUSTIFICATION | Strategic |

If the content-selected primary family is weak in the current level matrix, use the strongest family at that level instead.

## Modeling

Modeling shows expert reasoning. It is useful, but risky because it can make the learner passive.

### Necessary Conditions

All must be true:

- Level is L2 or higher.
- Content type is not FACTUAL.
- The student has provided context, such as self-explanation, specified gap, prior response, scaffold history, or retry.

### Sufficient Triggers

One or more can activate modeling:

- Decision, trade-off, or justification question.
- Explicit request for expert thinking.
- Attempt-after-stuck pattern with uncertainty.
- Research methodology decision context.
- Repeated scaffolding failure.

### Counter-Indicators

Any can suppress modeling:

- Learner is close to insight.
- Previous turn already used modeling.
- Time pressure is visible.
- L4 procedural deployment where the learner has already decided and just needs execution.

### Dosage

| Dose | Length | Use |
|---|---|---|
| Light | 1-2 sentences | Surface one or two criteria |
| Medium | 3-5 steps | Show expert sequence but leave final application to learner |
| Full | Walkthrough | Use only for rescue or explicit request |

The default should be medium when modeling is activated.

## Algorithm

```text
1. Diagnose sense-making level.
2. Classify question content type.
3. Select primary scaffold family from content type.
4. If matrix says that family is weak at the level, use the strongest family at that level.
5. Add metacognitive scaffolding as secondary unless it is already primary.
6. Check modeling necessary conditions.
7. Check modeling sufficient triggers.
8. Check counter-indicators.
9. Select modeling dose if activated.
10. Generate a move that preserves anti-offloading.
```

## Anti-Offloading Rule

When modeling is activated, especially at medium dose, the chatbot should usually stop before the final application step and ask the learner to complete it.

## Dosage And Length

Dense diagnosis does not mean dense response. Even when the diagnosis shows multiple active scaffold families, the response should expand only the primary family in detail and use secondary scaffolds lightly.

General limits:

- Use at most 5 bullets.
- Keep ordinary scaffolds under 180-220 words.
- Never expand more than one scaffold family in detail.
- Secondary scaffolds should usually be one short metacognitive question.
- Do not end with an incomplete sentence.
- If more detail is needed, ask which part the learner wants to expand.

| Move Type | Target Length | Constraint |
|---|---|---|
| Default scaffold | 120-180 words | One focused learning move |
| Procedural scaffold | 160-220 words | Maximum 5 steps |
| Strategic scaffold | 160-220 words | Maximum 2-3 options |
| Conceptual scaffold | 100-160 words | Prefer contrast or example over long definition |
| Metacognitive scaffold | 60-120 words | One main question |
| Modeling light | 80-120 words | 1-2 sentences |
| Modeling medium | 160-220 words | 3-4 reasoning steps, leave final application to learner |
| Modeling full | 250-350 words | Only for rescue or explicit request |
