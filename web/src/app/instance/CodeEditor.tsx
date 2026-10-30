import { useEffect, useRef } from 'react';
import { Compartment, EditorState, type Extension } from '@codemirror/state';
import { EditorView, drawSelection, highlightActiveLine, highlightActiveLineGutter, keymap, lineNumbers } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { HighlightStyle, StreamLanguage, bracketMatching, indentOnInput, syntaxHighlighting } from '@codemirror/language';
import { highlightSelectionMatches, searchKeymap } from '@codemirror/search';
import { javascript } from '@codemirror/lang-javascript';
import { json } from '@codemirror/lang-json';
import { yaml } from '@codemirror/lang-yaml';
import { tags as t } from '@lezer/highlight';

/**
 * The editor of the files of an instance.
 *
 * A file of a server is mostly a file of settings: JSON, YAML, a list of
 * `key=value` lines. The editor numbers the lines, colours what it knows,
 * finds text (Ctrl or Cmd F), undoes and saves with Ctrl or Cmd S. It is
 * CodeMirror 6, and it is dressed in the tokens of the platform.
 */

import { type EditorLanguage } from './editor-language';

const properties = StreamLanguage.define({
  token(stream) {
    if (stream.sol() && (stream.peek() === '#' || stream.peek() === '!' || stream.peek() === ';')) {
      stream.skipToEnd();
      return 'comment';
    }
    if (stream.sol()) {
      stream.eatWhile(/[^=:\s]/);
      return 'propertyName';
    }
    if (stream.eat(/[=:]/)) return 'operator';
    stream.skipToEnd();
    return 'string';
  },
});

const language = (name: EditorLanguage): Extension =>
  name === 'json' ? json() : name === 'yaml' ? yaml() : name === 'javascript' ? javascript({ typescript: true, jsx: true }) : name === 'properties' ? properties : [];

const highlight = HighlightStyle.define([
  { tag: [t.comment, t.lineComment, t.blockComment], color: '#8c988f', fontStyle: 'italic' },
  { tag: [t.propertyName, t.attributeName, t.definition(t.variableName)], color: '#4ee595' },
  { tag: [t.string, t.special(t.string)], color: '#e6c07b' },
  { tag: [t.number, t.bool, t.null, t.atom], color: '#8dc0ff' },
  { tag: [t.keyword, t.operatorKeyword, t.controlKeyword], color: '#ff9f97' },
  { tag: [t.typeName, t.className], color: '#c792ea' },
  { tag: [t.operator, t.punctuation], color: '#b5c0b8' },
]);

const theme = EditorView.theme(
  {
    '&': { backgroundColor: 'transparent', color: '#f1f5ef', fontSize: '13.5px', height: '100%' },
    '&.cm-focused': { outline: 'none' },
    '.cm-scroller': { fontFamily: "'JetBrains Mono Variable', ui-monospace, monospace", lineHeight: '1.6', overflow: 'auto' },
    '.cm-content': { padding: '12px 0', caretColor: '#4ee595' },
    '.cm-gutters': { backgroundColor: 'transparent', color: '#5b6b60', border: 'none' },
    '.cm-lineNumbers .cm-gutterElement': { padding: '0 12px 0 16px' },
    '.cm-activeLine': { backgroundColor: 'rgba(78, 229, 149, 0.06)' },
    '.cm-activeLineGutter': { backgroundColor: 'transparent', color: '#b5c0b8' },
    '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': { backgroundColor: 'rgba(78, 229, 149, 0.22) !important' },
    '.cm-cursor': { borderLeftColor: '#4ee595' },
    '.cm-matchingBracket': { backgroundColor: 'rgba(78, 229, 149, 0.2)', outline: 'none' },
    '.cm-searchMatch': { backgroundColor: 'rgba(240, 178, 50, 0.28)' },
    '.cm-panels': { backgroundColor: '#121915', color: '#f1f5ef', borderTop: '1px solid #232d26' },
    '.cm-panel input, .cm-panel button': { fontSize: '13px' },
    '.cm-panel input': { backgroundColor: '#0e1310', border: '1px solid #232d26', color: '#f1f5ef', borderRadius: '8px', padding: '4px 8px' },
    '.cm-panel button': { backgroundColor: '#18221c', border: '1px solid #232d26', color: '#f1f5ef', borderRadius: '8px', padding: '3px 10px' },
  },
  { dark: true },
);

export interface CodeEditorProps {
  value: string;
  language: EditorLanguage;
  onChange: (value: string) => void;
  /** Called with Ctrl or Cmd S. */
  onSave?: () => void;
  label: string;
  readOnly?: boolean;
  height?: number | string;
}

/** CodeMirror 6, with the document owned by the editor: `value` is applied only when it differs from the text. */
export default function CodeEditor({ value, language: name, onChange, onSave, label, readOnly, height = 420 }: CodeEditorProps) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const change = useRef(onChange);
  const save = useRef(onSave);
  change.current = onChange;
  save.current = onSave;
  const lang = useRef(new Compartment());
  const lock = useRef(new Compartment());

  useEffect(() => {
    if (!host.current) return;
    const editor = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          lineNumbers(),
          highlightActiveLineGutter(),
          highlightActiveLine(),
          drawSelection(),
          history(),
          indentOnInput(),
          bracketMatching(),
          highlightSelectionMatches(),
          syntaxHighlighting(highlight),
          theme,
          EditorView.lineWrapping,
          EditorView.contentAttributes.of({ 'aria-label': label, spellcheck: 'false', autocapitalize: 'off', autocorrect: 'off' }),
          keymap.of([
            {
              key: 'Mod-s',
              preventDefault: true,
              run: () => {
                save.current?.();
                return true;
              },
            },
            indentWithTab,
            ...defaultKeymap,
            ...historyKeymap,
            ...searchKeymap,
          ]),
          lang.current.of(language(name)),
          lock.current.of(EditorState.readOnly.of(Boolean(readOnly))),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) change.current(update.state.doc.toString());
          }),
        ],
      }),
    });
    view.current = editor;
    return () => {
      editor.destroy();
      view.current = null;
    };
    // The editor is built once. The language and the lock are reconfigured below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    view.current?.dispatch({ effects: lang.current.reconfigure(language(name)) });
  }, [name]);

  useEffect(() => {
    view.current?.dispatch({ effects: lock.current.reconfigure(EditorState.readOnly.of(Boolean(readOnly))) });
  }, [readOnly]);

  // A value that came from outside replaces the document.
  useEffect(() => {
    const editor = view.current;
    if (!editor) return;
    const current = editor.state.doc.toString();
    if (current !== value) editor.dispatch({ changes: { from: 0, to: current.length, insert: value } });
  }, [value]);

  return <div ref={host} style={{ height }} className="overflow-hidden rounded-2xl border border-line bg-con" />;
}
