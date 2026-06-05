# Domain Knowledge And Training Strategy

## Short Answer

You do not need to fine-tune or train a model first to build the initial prototype.

For this project, start with:

1. Strong system prompt
2. Clear interaction policy
3. Seed examples
4. Evaluation cases
5. Later, retrieval-augmented generation for course-specific materials

Fine-tuning can come later, after you collect enough high-quality examples of the exact behavior you want.

## What The Base Model Already Handles

A strong general model already has broad knowledge of:

- Educational technology
- Learning sciences
- Research methodology in education
- Common theories, methods, and terminology

So the first challenge is not usually "the model knows nothing." The first challenge is behavioral:

- Does it delay final answers?
- Does it ask for prior knowledge?
- Does it scaffold rather than solve?
- Does it connect final synthesis to the student's attempt?
- Does it avoid polished assignment-ready output too early?

Those behaviors are best controlled first through prompts, interaction flow, and evaluation.

## When You Need Retrieval Instead Of Fine-Tuning

Use retrieval-augmented generation when the chatbot needs to answer based on specific materials, such as:

- A course syllabus
- Assigned readings
- A professor's lecture slides
- A specific article
- A local research methods textbook chapter
- A rubric or assignment guideline

In that case, do not try to make the model memorize the documents. Store the documents, retrieve relevant passages, and provide them to the model as context.

## When Fine-Tuning May Help

Fine-tuning may help later if you have many examples of the exact interaction style you want.

It is more useful for:

- Consistently following the scaffolded dialogue style
- Producing the desired response format
- Handling common student misconceptions in a predictable way
- Reducing repeated prompt length

It is less ideal for:

- Updating domain knowledge
- Memorizing articles or course materials
- Guaranteeing factual correctness

## Recommended Roadmap

### Phase 1: Prompted Prototype

Use the current OpenAI API CLI prototype.

Goal:

- Check whether the scaffolded flow feels educationally appropriate.

Data needed:

- 20-50 seed examples
- 10-20 evaluation cases

### Phase 2: Evaluation

Test the chatbot with realistic student prompts.

Score each response on:

- Prior knowledge activation
- Scaffolding quality
- Cognitive offloading control
- Domain accuracy
- Metacognitive support

### Phase 3: Retrieval

Add course readings, assignment rubrics, and selected papers.

Goal:

- Make the chatbot accurate for your local course context.

### Phase 4: Fine-Tuning Or Distillation

Consider fine-tuning only after you have a dataset with hundreds or thousands of reviewed examples.

Goal:

- Make the chatbot's scaffolded behavior more consistent and cheaper to run.

## Practical Recommendation

For your current project, do not begin with training.

Begin with this stack:

```text
OpenAI API
+ system prompt
+ interaction policy
+ seed examples
+ evaluation rubric
+ later RAG for course readings
```

This is enough to build and test the first research prototype.
