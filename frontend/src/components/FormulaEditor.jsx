import React, { useRef, useEffect } from 'react';
import Editor, { useMonaco } from '@monaco-editor/react';

const POLARS_SNIPPETS = [
  // Core / General
  { label: 'col()', insertText: 'col("${1:name}")', insertTextRules: 4, doc: 'Select a column by name.' },
  { label: 'lit()', insertText: 'lit(${1:value})', insertTextRules: 4, doc: 'Create a literal value.' },
  { label: 'alias()', insertText: 'alias("${1:name}")', insertTextRules: 4, doc: 'Rename the expression.' },
  { label: 'cast()', insertText: 'cast(pl.${1:Float64})', insertTextRules: 4, doc: 'Cast the expression to a new data type.' },
  { label: 'fill_null()', insertText: 'fill_null(${1:value})', insertTextRules: 4, doc: 'Fill null values using a specified value.' },
  { label: 'is_null()', insertText: 'is_null()', doc: 'Returns boolean mask checking for null values.' },
  { label: 'is_not_null()', insertText: 'is_not_null()', doc: 'Returns boolean mask checking for non-null values.' },
  { label: 'is_in()', insertText: 'is_in([${1:values}])', insertTextRules: 4, doc: 'Check if elements exist in the provided list.' },
  { label: 'is_between()', insertText: 'is_between(${1:lower}, ${2:upper})', insertTextRules: 4, doc: 'Check if elements are between given boundaries.' },
  { label: 'when().then().otherwise()', insertText: 'when(${1:condition})\n  .then(${2:true_value})\n  .otherwise(${3:false_value})', insertTextRules: 4, doc: 'Evaluates a condition and returns value if true, otherwise false.' },

  // String operations
  { label: 'str.to_uppercase()', insertText: 'str.to_uppercase()', doc: 'Converts all characters to uppercase.' },
  { label: 'str.to_lowercase()', insertText: 'str.to_lowercase()', doc: 'Converts all characters to lowercase.' },
  { label: 'str.replace()', insertText: 'str.replace("${1:old}", "${2:new}")', insertTextRules: 4, doc: 'Replace matching substring with a new string.' },
  { label: 'str.replace_all()', insertText: 'str.replace_all("${1:old}", "${2:new}")', insertTextRules: 4, doc: 'Replace all matching substrings with a new string.' },
  { label: 'str.contains()', insertText: 'str.contains("${1:pattern}")', insertTextRules: 4, doc: 'Check if string contains a substring.' },
  { label: 'str.strip_chars()', insertText: 'str.strip_chars()', doc: 'Remove leading and trailing whitespace.' },
  { label: 'str.starts_with()', insertText: 'str.starts_with("${1:prefix}")', insertTextRules: 4, doc: 'Check if string starts with prefix.' },
  { label: 'str.ends_with()', insertText: 'str.ends_with("${1:suffix}")', insertTextRules: 4, doc: 'Check if string ends with suffix.' },
  { label: 'str.slice()', insertText: 'str.slice(${1:offset}, ${2:length})', insertTextRules: 4, doc: 'Create string slices.' },
  { label: 'str.split()', insertText: 'str.split("${1:separator}")', insertTextRules: 4, doc: 'Split a string into a list.' },
  { label: 'str.len_chars()', insertText: 'str.len_chars()', doc: 'Get length of the string in characters.' },

  // Math & Aggregations
  { label: 'sum()', insertText: 'sum()', doc: 'Calculate the sum of values.' },
  { label: 'mean()', insertText: 'mean()', doc: 'Calculate the mean/average.' },
  { label: 'median()', insertText: 'median()', doc: 'Calculate the median.' },
  { label: 'min()', insertText: 'min()', doc: 'Get the minimum value.' },
  { label: 'max()', insertText: 'max()', doc: 'Get the maximum value.' },
  { label: 'std()', insertText: 'std()', doc: 'Calculate the standard deviation.' },
  { label: 'var()', insertText: 'var()', doc: 'Calculate the variance.' },
  { label: 'count()', insertText: 'count()', doc: 'Count the number of non-null values.' },
  { label: 'n_unique()', insertText: 'n_unique()', doc: 'Count unique values.' },
  { label: 'round()', insertText: 'round(${1:decimals})', insertTextRules: 4, doc: 'Round to a given number of decimals.' },
  { label: 'abs()', insertText: 'abs()', doc: 'Get absolute value.' },

  // Date operations
  { label: 'dt.year()', insertText: 'dt.year()', doc: 'Extract the year from a date.' },
  { label: 'dt.month()', insertText: 'dt.month()', doc: 'Extract the month from a date.' },
  { label: 'dt.day()', insertText: 'dt.day()', doc: 'Extract the day from a date.' },
  { label: 'dt.hour()', insertText: 'dt.hour()', doc: 'Extract the hour from a datetime.' },
  { label: 'dt.minute()', insertText: 'dt.minute()', doc: 'Extract the minute from a datetime.' },
  { label: 'dt.second()', insertText: 'dt.second()', doc: 'Extract the second from a datetime.' },
  { label: 'dt.weekday()', insertText: 'dt.weekday()', doc: 'Extract the weekday from a date.' },
  { label: 'dt.offset_by()', insertText: 'dt.offset_by("${1:1d}")', insertTextRules: 4, doc: 'Offset the date by a string interval (e.g. "1d", "1mo").' },
  { label: 'dt.to_string()', insertText: 'dt.to_string("${1:%Y-%m-%d}")', insertTextRules: 4, doc: 'Format date as a string.' }
];

const FormulaEditor = ({ value, onChange, columns = [], height = "120px", placeholder = "" }) => {
  const monaco = useMonaco();
  const editorRef = useRef(null);
  const completionProviderRef = useRef(null);

  useEffect(() => {
    if (monaco) {
      // Register custom completions
      if (completionProviderRef.current) {
        completionProviderRef.current.dispose();
      }

      completionProviderRef.current = monaco.languages.registerCompletionItemProvider('python', {
        triggerCharacters: ['[', '.'],
        provideCompletionItems: (model, position) => {
          const textUntilPosition = model.getValueInRange({
            startLineNumber: 1,
            startColumn: 1,
            endLineNumber: position.lineNumber,
            endColumn: position.column
          });

          const suggestions = [];

          // Column suggestions after '['
          const lastOpenBracket = textUntilPosition.lastIndexOf('[');
          const lastCloseBracket = textUntilPosition.lastIndexOf(']');
          
          if (lastOpenBracket !== -1 && lastOpenBracket > lastCloseBracket) {
            columns.forEach(col => {
              suggestions.push({
                label: col.name,
                kind: monaco.languages.CompletionItemKind.Variable,
                insertText: col.name + ']',
                documentation: `Column: ${col.name} (${col.type || 'Unknown'})`,
                range: {
                  startLineNumber: position.lineNumber,
                  startColumn: position.column - (textUntilPosition.length - lastOpenBracket - 1),
                  endLineNumber: position.lineNumber,
                  endColumn: position.column
                }
              });
            });
            return { suggestions };
          }

          // Method suggestions after '.'
          const match = textUntilPosition.match(/\.$/);
          if (match) {
            POLARS_SNIPPETS.forEach(snip => {
              suggestions.push({
                label: snip.label,
                kind: monaco.languages.CompletionItemKind.Method,
                insertText: snip.insertText,
                insertTextRules: snip.insertTextRules || undefined,
                documentation: snip.doc,
                range: {
                  startLineNumber: position.lineNumber,
                  startColumn: position.column,
                  endLineNumber: position.lineNumber,
                  endColumn: position.column
                }
              });
            });
            return { suggestions };
          }

          // General method/column completions without trigger
          const word = model.getWordUntilPosition(position);
          const range = {
            startLineNumber: position.lineNumber,
            endLineNumber: position.lineNumber,
            startColumn: word.startColumn,
            endColumn: word.endColumn
          };

          POLARS_SNIPPETS.forEach(snip => {
             suggestions.push({
                label: snip.label,
                kind: monaco.languages.CompletionItemKind.Method,
                insertText: snip.insertText,
                insertTextRules: snip.insertTextRules || undefined,
                documentation: snip.doc,
                range: range
             });
          });

          columns.forEach(col => {
            suggestions.push({
              label: `[${col.name}]`,
              kind: monaco.languages.CompletionItemKind.Variable,
              insertText: `[${col.name}]`,
              documentation: `Column: ${col.name} (${col.type || 'Unknown'})`,
              range: range
            });
          });

          return { suggestions };
        }
      });
    }

    return () => {
      if (completionProviderRef.current) {
        completionProviderRef.current.dispose();
      }
    };
  }, [monaco, columns]);

  const handleEditorDidMount = (editor, monaco) => {
    editorRef.current = editor;
    // Hide minimap and other distractions for a cleaner look
    editor.updateOptions({
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      lineNumbers: 'off',
      glyphMargin: false,
      folding: false,
      lineDecorationsWidth: 0,
      lineNumbersMinChars: 0,
      renderLineHighlight: 'none',
      overviewRulerLanes: 0,
      hideCursorInOverviewRuler: true,
      scrollbar: { vertical: 'hidden', horizontal: 'hidden' },
      padding: { top: 8, bottom: 8 },
      fontSize: 12,
      fontFamily: 'var(--font-mono)'
    });
  };

  return (
    <div style={{ 
      border: '1px solid var(--border-color)', 
      borderRadius: '4px', 
      overflow: 'hidden',
      background: 'var(--bg-primary)',
      height: height
    }}>
      <Editor
        height="100%"
        defaultLanguage="python"
        theme="vs-dark"
        value={value}
        onChange={(val) => onChange && onChange({ target: { value: val }})}
        onMount={handleEditorDidMount}
        options={{
          wordWrap: "on",
          suggestOnTriggerCharacters: true
        }}
      />
    </div>
  );
};

export default FormulaEditor;
