// Select how much help to release; sense-making and modeling remain separate.
export function responseMove(evaluation, { initial = false, attempts = 0 } = {}) {
  if (evaluation.quality === 'assignment_bypass') return 'outline';
  if (evaluation.question_content_type === 'FACTUAL') return 'direct_answer';
  if (evaluation.ready_for_synthesis && evaluation.is_meaningful) return 'synthesis';
  if (initial && !evaluation.is_meaningful) return 'activate';
  if (!evaluation.is_meaningful) return 'orientation';
  if (attempts >= 2) return 'supported_answer';
  return 'scaffold';
}

export const moveInstructions = {
  activate: 'Offer at most one sentence of orientation and one prior-knowledge question. Do not ask several versions of the same question.',
  orientation: 'The learner lacks a starting point. Give a plain explanation and one concrete example before one low-effort choice or observation question. Do not ask again what they already know. Do not imply mastery or provide a complete assignment.',
  scaffold: 'Use the actual learner idea. Add a useful explanation, contrast, correction, or procedural step, then at most one specific reflection question. Never only echo and interrogate.',
  direct_answer: 'Answer the narrow factual or procedural clarification directly and concisely. No prior-knowledge prerequisite. A reflection question is optional, not mandatory. Do not expand into a completed assignment.',
  synthesis: 'Give a concise substantive answer building on the learner contribution. Correct remaining issues honestly. End naturally; transfer reflection is optional and must not open another compulsory loop.',
  supported_answer: 'The learner has tried repeatedly. Give a concrete partial solution or concise answer to the current conceptual gap, identify any unresolved assumption, then at most one optional application check. Do not claim the learner mastered it. A full worked reasoning sequence is allowed only by the separate modeling rules; never deliver a submission-ready assignment.',
  outline: 'Acknowledge the desire for an answer without lecturing. Give one useful organizing point or partial outline and invite one small contribution tied to the topic. If earlier thinking exists, use it rather than resetting the learner.',
};
