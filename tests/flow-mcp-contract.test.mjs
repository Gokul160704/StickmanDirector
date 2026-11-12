import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const REQUIRED_TOOLS = [
  'flow_status',
  'flow_generate',
  'flow_wait',
  'flow_download',
  'flow_assets',
  'flow_transcribe',
  'flow_voices',
];

async function loadFixture(name) {
  const file = new URL(`./fixtures/flow-mcp/${name}`, import.meta.url);
  return JSON.parse(await readFile(file, 'utf8'));
}

test('pins the audited Flow MCP tool names and required fields', async () => {
  const contract = await loadFixture('contract.json');

  assert.equal(contract.revision, '84b548f3aa72b749b82cdbfbb6f91cadebae8642');
  assert.deepEqual(Object.keys(contract.tools), REQUIRED_TOOLS);
  assert.deepEqual(contract.tools.flow_status.required, []);
  assert.deepEqual(contract.tools.flow_generate.required, ['project', 'scenes']);
  assert.deepEqual(contract.tools.flow_wait.required, []);
  assert.deepEqual(contract.tools.flow_download.required, ['assets', 'project']);
  assert.deepEqual(contract.tools.flow_assets.required, []);
  assert.deepEqual(contract.tools.flow_transcribe.required, ['video']);
  assert.deepEqual(contract.tools.flow_voices.required, []);
});

test('pins representative success envelopes for every audited tool', async () => {
  const responses = await loadFixture('responses.json');

  for (const tool of REQUIRED_TOOLS) {
    assert.ok(responses.success[tool], `missing success fixture for ${tool}`);
    assert.equal(responses.success[tool].ok, true);
  }

  assert.equal(responses.success.flow_generate.jobs[0].id, 'job-synthetic-001');
  assert.equal(responses.success.flow_wait.finished, true);
  assert.equal(responses.success.flow_download.files[0].path, 'images/scene-01.jpeg');
  assert.equal(responses.success.flow_assets.assets[0].title, 'scene-01');
  assert.equal(responses.success.flow_transcribe.words[0].text, 'Tonight');
  assert.equal(responses.success.flow_voices.gemini_ready, true);
});
