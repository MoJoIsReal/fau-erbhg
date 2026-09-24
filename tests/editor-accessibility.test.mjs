import assert from 'node:assert/strict';
import test from 'node:test';
import { importBundle } from './helpers.mjs';

globalThis.localStorage = { getItem: () => 'no' };
const { options } = await importBundle({
  stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
    import React from 'react';
    import { renderToStaticMarkup } from 'react-dom/server';
    import Editor from './client/src/components/RichTextEditor';
    import { LanguageProvider } from './client/src/contexts/LanguageContext';
    export function options(props) {
      renderToStaticMarkup(<LanguageProvider><Editor content='<p>Keep this</p>' onChange={()=>{}} {...props}/></LanguageProvider>);
      return globalThis.editorOptions;
    }
  ` }, platform: 'node', jsx: 'automatic',
  plugins: [{ name: 'editor-boundary', setup(build) {
    build.onResolve({ filter: /^@tiptap\/react$/ }, () => ({ path: 'editor', namespace: 'fixture' }));
    build.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: 'export function useEditor(options) { globalThis.editorOptions = options; return null; } export const EditorContent = () => null;' }));
  } }],
});

test('editable node receives the field name and validation associations', () => {
  const props = { id: 'description', 'aria-labelledby': 'description-label', 'aria-describedby': 'description-error', 'aria-invalid': true };
  const editor = options(props);
  for (const [key, value] of Object.entries(props)) assert.equal(editor.editorProps.attributes[key], String(value));
  assert.equal(editor.editorProps.attributes['aria-multiline'], 'true');
  assert.equal(editor.editorProps.attributes.role, 'textbox');
  assert.match(editor.editorProps.attributes.class, /focus-visible:ring-inset/);
  assert.doesNotMatch(editor.editorProps.attributes.class, /focus:outline-none/);
  assert.equal(editor.content, '<p>Keep this</p>');
});

test('valid state and blur callback reach the editable node', () => {
  let blurred = false;
  const editor = options({ 'aria-label': 'Innhold', 'aria-invalid': false, onBlur: () => { blurred = true; } });
  assert.equal(editor.editorProps.attributes['aria-label'], 'Innhold');
  assert.equal(editor.editorProps.attributes['aria-invalid'], 'false');
  editor.onBlur();
  assert.equal(blurred, true);
});
