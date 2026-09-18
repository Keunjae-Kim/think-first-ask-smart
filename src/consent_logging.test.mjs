import {test} from 'node:test';
import assert from 'node:assert/strict';
import {logUsageTurn} from './usage_logger.mjs';

test('declining collection never writes a turn, including legacy optional-consent configuration', async () => {
  const previous = {...process.env};
  process.env.USAGE_LOGGING = 'true';
  process.env.REQUIRE_LOG_CONSENT = 'false';
  try {
    assert.deepEqual(await logUsageTurn({consentGiven: false}), {logged: false, reason: 'missing_consent'});
  } finally {
    for (const key of ['USAGE_LOGGING', 'REQUIRE_LOG_CONSENT']) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});
