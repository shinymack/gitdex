import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { validateDiagram, DiagramSyntaxError } from './diagramValidation.js';

describe('server-side Mermaid validation', () => {
  test('accepts a valid labelled flowchart without browser globals', async () => {
    await validateDiagram('flowchart LR\nA["Read source"] --> B["Publish guide"]');
    assert.equal(Reflect.has(globalThis, 'window'), false);
  });

  test('accepts a sequence diagram and rejects malformed flowchart grammar', async () => {
    await validateDiagram('sequenceDiagram\nparticipant API\nparticipant Queue\nAPI->>Queue: Admit run\nQueue-->>API: Run identity');
    await assert.rejects(validateDiagram('flowchart LR\nA["Unclosed'), DiagramSyntaxError);
  });
});
