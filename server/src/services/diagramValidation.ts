import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { Script } from 'node:vm';
import { JSDOM } from 'jsdom';
import type { Mermaid } from 'mermaid';

const require = createRequire(import.meta.url);
let parser: Promise<Mermaid> | undefined;

export class DiagramSyntaxError extends Error {}

async function createParser(): Promise<Mermaid> {
  const bundle = await readFile(require.resolve('mermaid/dist/mermaid.min.js'), 'utf8');
  // Only this installed library runs as script. Diagram text goes through parse(), never eval().
  // The isolated window gives DOMPurify a real DOM without changing server globals or allowing resources.
  const dom = new JSDOM('', { runScripts: 'outside-only' });
  new Script(bundle, { filename: 'mermaid.min.js' }).runInContext(dom.getInternalVMContext());
  const instance: Mermaid = dom.window.mermaid;
  instance.initialize({ startOnLoad: false, securityLevel: 'strict' });
  return instance;
}

export async function validateDiagram(source: string): Promise<void> {
  parser ??= createParser();
  const instance = await parser;
  try { await instance.parse(source); }
  catch (cause) { throw new DiagramSyntaxError('Invalid diagram syntax.', { cause }); }
}
