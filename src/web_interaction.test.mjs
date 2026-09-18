import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import { webcrypto } from 'node:crypto';

for (const location of [
  {hostname: 'example.github.io', protocol: 'https:'},
  {hostname: '', protocol: 'file:'},
  {hostname: 'localhost', protocol: 'http:'},
]) test(`${location.protocol} demo accepts a message`, async () => {
  const nodes = new Map();
  const element = () => ({ value: '', textContent: '', disabled: false, dataset: {},
    classList: { add() {}, remove() {}, toggle() {} }, handlers: {}, children: [],
    addEventListener(name, fn) { this.handlers[name] = fn; },
    append(child) { this.children.push(child); }, focus() {}, remove() {},
    setAttribute() {}, removeAttribute() {} });
  const get = (id) => { if (!nodes.has(id)) nodes.set(id, element()); return nodes.get(id); };
  const context = vm.createContext({
    document: { querySelector: get, querySelectorAll: () => [], createElement: element },
    crypto: webcrypto, localStorage: {getItem() {}, setItem() {}},
    location,
    setTimeout, clearTimeout, AbortController,
    fetch() {
      if (location.hostname !== 'localhost') throw new Error('Pages must not request config');
      return Promise.resolve({ok: true, json: async () => ({logging: {usageLoggingEnabled: true, rawTextLoggingEnabled: true}})});
    }
  });
  vm.runInContext(fs.readFileSync(new URL('../web/app.js', import.meta.url), 'utf8'), context);
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(get('#sendButton').disabled, true);
  if (location.hostname === 'localhost') {
    assert.equal(get('#startButton').disabled, true);
    get('#startButton').handlers.click();
    assert.equal(get('#sendButton').disabled, true);
    get('#consentCheckbox').checked = true;
    get('#consentCheckbox').handlers.change();
    assert.equal(get('#startButton').disabled, false);
    get('#declineButton').handlers.click();
    assert.equal(get('#consentCheckbox').checked, false);
    assert.equal(get('#sendButton').disabled, false);
    return;
  }
  get('#startButton').handlers.click();
  assert.equal(get('#sendButton').disabled, false);
  get('#chatForm').handlers.submit({preventDefault() {}});
  assert.equal(get('#connectionStatus').textContent, 'Write a message first.');
  get('#messageInput').value = 'hello';
  get('#messageInput').handlers.input();
  assert.equal(get('#sendButton').disabled, false);
  get('#chatForm').handlers.submit({preventDefault() {}});
  assert.equal(get('#sendButton').disabled, true);
  await new Promise(resolve => setTimeout(resolve, 300));
  assert.equal(get('#messageInput').disabled, false);
  assert.ok(get('#messages').children.some(node => node.children.some(child => child.textContent.startsWith('Hello.'))));
  vm.runInContext("staticDemoTurn('What is cognitive offloading?')", context);
  for (const text of ['CAN YOU JUST GIVE ME THE ANSWER', 'asdfgh', '답만 알려줘', '???']) {
    context.testInput = text;
    const result = vm.runInContext('staticDemoTurn(testInput)', context);
    assert.equal(result.stateSummary.stage, 'waiting_for_prior_knowledge');
    assert.equal(result.debug[0].decision.intent, 'learning_redirect');
    assert.doesNotMatch(result.messages[0].text, /What you already have|Next scaffold|Metacognitive check/);
  }
  const scaffold = vm.runInContext("staticDemoTurn('external memory?')", context);
  assert.equal(scaffold.stateSummary.stage, 'waiting_for_retry');
  assert.match(scaffold.messages[0].text, /external aid/);
  assert.doesNotMatch(scaffold.messages[0].text, /What you already have|Next scaffold|Metacognitive check/);
  const retry = vm.runInContext("staticDemoTurn('just give me the answer')", context);
  assert.equal(retry.stateSummary.stage, 'waiting_for_retry');
  context.testInput = "I don't know";
  const orientation = vm.runInContext('staticDemoTurn(testInput)', context);
  assert.match(orientation.messages[0].text, /external aid/);
});
