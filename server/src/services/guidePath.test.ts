import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { resolveGuideRoot } from './guidePath.js';

describe('published guide storage paths', () => {
  const tree = [
    { type: 'tree', path: 'docs/santrupt29/Doodle-Sync' },
    { type: 'blob', path: 'docs/santrupt29/Doodle-Sync/1_intro.MDX' },
    { type: 'blob', path: 'docs/santrupt29/Doodle-Sync-extra/1_intro.md' },
  ];

  test('preserves the actual root for case-varied requests', () => {
    for (const [owner, repo] of [['santrupt29', 'doodle-sync'], ['SANTRUPT29', 'DOODLE-SYNC'], ['santrupt29', 'Doodle-Sync']]) {
      assert.equal(resolveGuideRoot(tree, owner!, repo!), 'docs/santrupt29/Doodle-Sync/');
    }
  });

  test('matches complete directory segments, not sibling prefixes', () => {
    assert.equal(resolveGuideRoot(tree, 'santrupt29', 'doodle'), null);
    assert.equal(resolveGuideRoot(tree, 'santrupt29', 'doodle-sync-extra'), 'docs/santrupt29/Doodle-Sync-extra/');
    assert.equal(resolveGuideRoot([{ type: 'blob', path: 'docs/santrupt29/Doodle-Sync' }], 'santrupt29', 'doodle-sync'), null);
  });

  test('rejects ambiguous case-variant directories rather than merging them', () => {
    assert.throws(() => resolveGuideRoot([...tree, { type: 'blob', path: 'docs/Santrupt29/doodle-sync/other.md' }], 'santrupt29', 'Doodle-Sync'));
  });
});
