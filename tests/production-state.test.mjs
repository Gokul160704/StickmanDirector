import test from 'node:test';
import assert from 'node:assert/strict';
import { createProductionState, transitionProductionState } from '../scripts/production-state.mjs';

test('creates and advances a resumable production checkpoint', () => {
  const initial = createProductionState('episode-01');
  assert.equal(initial.stage, 'research');
  const next = transitionProductionState(initial, 'script', { artifact: 'script/episode-01.md' });
  assert.equal(next.stage, 'script');
  assert.equal(next.completedStages.research.status, 'complete');
  assert.equal(next.pendingStages[0], 'continuity');
  assert.equal(next.artifacts[0].path, 'script/episode-01.md');
});

test('rejects skipping production stages', () => {
  assert.throws(() => transitionProductionState(createProductionState('episode-01'), 'rendering'), /cannot advance/i);
});
