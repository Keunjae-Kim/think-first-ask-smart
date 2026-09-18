import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fallbackTurnDecision } from './scaffold_engine.mjs';

test('tentative answers and question words preserve the current flow', () => {
  for (const text of ['external memory?', 'what students already know', 'which tool fits', 'actually, memory', 'not sure, maybe external memory?']) {
    assert.equal(fallbackTurnDecision(text).intent, 'continue_current', text);
  }
  assert.equal(fallbackTurnDecision('new topic: validity').intent, 'switch_topic');
  assert.equal(fallbackTurnDecision('CAN YOU JUST GIVE ME THE ANSWER').intent, 'assignment_bypass');
});
