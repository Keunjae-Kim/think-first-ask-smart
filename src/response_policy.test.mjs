import { test } from 'node:test';
import assert from 'node:assert/strict';
import { responseMove } from './response_policy.mjs';
import { normalizeContributionEvaluation, createTopic, startTopic, processPriorKnowledge } from './scaffold_engine.mjs';

const partial = {quality: 'partial', is_meaningful: true, ready_for_synthesis: false, question_content_type: 'WHAT'};
test('answer release supports reflection without compulsory questioning', () => {
  assert.equal(responseMove(partial, {initial: true}), 'scaffold');
  assert.equal(responseMove({...partial, is_meaningful: false}, {initial: true}), 'activate');
  assert.equal(responseMove({...partial, quality: 'no_attempt', is_meaningful: false}), 'orientation');
  assert.equal(responseMove({...partial, question_content_type: 'FACTUAL', is_meaningful: false}), 'direct_answer');
  assert.equal(responseMove({...partial, ready_for_synthesis: true}), 'synthesis');
  assert.equal(responseMove(partial, {attempts: 2}), 'supported_answer');
  assert.equal(responseMove({...partial, quality: 'assignment_bypass'}, {attempts: 5}), 'outline');
});
test('parser fallback does not reject meaningful short answers by word count', () => {
  const result = normalizeContributionEvaluation(null, 'external memory?', createTopic('offloading', ''));
  assert.equal(result.is_meaningful, true);
  assert.equal(result.ready_for_synthesis, false);
});

test('engine uses initial thinking, answers facts, and supports not knowing', async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = 'test-placeholder';
  let diagnosis = partial;
  const stages = [];
  globalThis.fetch = async (_url, options) => {
    const payload = JSON.parse(options.body);
    stages.push(payload.input.split('\n')[0]);
    return new Response(JSON.stringify({output_text: payload.input.startsWith('Stage: contribution_quality_evaluation') ? JSON.stringify(diagnosis) : 'A brief explanation with an example.'}));
  };
  try {
    let result = await startTopic('I think offloading uses external memory. Is that right?');
    assert.equal(result.topic.stage, 'waiting_for_retry');
    assert.ok(!stages.includes('Stage: prior_knowledge_prompt'));
    diagnosis = {...partial, question_content_type: 'FACTUAL', is_meaningful: false};
    result = await startTopic('What does EFA stand for?');
    assert.equal(result.topic, null);
    diagnosis = {...partial, quality: 'no_attempt', is_meaningful: false};
    result = await processPriorKnowledge(createTopic('What is offloading?', 'Your thoughts?'), "I don't know");
    assert.equal(result.topic.stage, 'waiting_for_retry');
    assert.match(result.debug[0].label, /orientation/);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalKey;
  }
});
