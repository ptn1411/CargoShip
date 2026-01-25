import { useCallback, useRef, useEffect } from "react";
import Editor, { OnMount, OnChange } from "@monaco-editor/react";
import type { editor } from "monaco-editor";
import { useEditorSettings, useAppStore } from "../../store";
import { getLanguageFromPath } from "../../lib/languageMap";
import { LoadingSpinner } from "../ui";

interface MonacoEditorProps {
  /** File path used for language detection */
  filePath: string;
  /** Current content of the file */
  content: string;
  /** Callback when content changes */
  onChange?: (content: string) => void;
  /** Whether the editor is read-only */
  readOnly?: boolean;
  /** Optional language override (if not provided, detected from filePath) */
  language?: string;
}

/**
 * Monaco Editor wrapper component
 * Integrates @monaco-editor/react with app settings and language detection
 * 
 * Requirements: 1.1, 1.2, 1.3, 1.4
 */
export function MonacoEditor({
  filePath,
  content,
  onChange,
  readOnly = false,
  language: languageOverride,
}: MonacoEditorProps) {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const settings = useEditorSettings();
  const appTheme = useAppStore((state) => state.theme);

  // Detect language from file path or use override
  const language = languageOverride ?? getLanguageFromPath(filePath);

  // Determine Monaco theme based on app theme
  const getMonacoTheme = useCallback(() => {
    if (settings.theme !== "vs" && settings.theme !== "vs-dark" && settings.theme !== "hc-black") {
      // If settings.theme is not a valid Monaco theme, derive from app theme
      const isDark = appTheme === "dark" || 
        (appTheme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
      return isDark ? "vs-dark" : "vs";
    }
    return settings.theme;
  }, [settings.theme, appTheme]);

  // Handle editor mount
  const handleEditorMount: OnMount = useCallback((editor) => {
    editorRef.current = editor;
    
    // Focus editor on mount
    editor.focus();
  }, []);

  // Handle content change
  const handleChange: OnChange = useCallback((value) => {
    if (onChange && value !== undefined) {
      onChange(value);
    }
  }, [onChange]);

  // Update editor options when settings change
  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.updateOptions({
        tabSize: settings.tabSize,
        fontSize: settings.fontSize,
        fontFamily: settings.fontFamily,
        wordWrap: settings.wordWrap ? "on" : "off",
        readOnly,
        minimap: { enabled: true },
        lineNumbers: "on",
        scrollBeyondLastLine: false,
        automaticLayout: true,
        renderWhitespace: "selection",
        bracketPairColorization: { enabled: true },
      });
    }
  }, [settings, readOnly]);

  // Editor options
  const editorOptions: editor.IStandaloneEditorConstructionOptions = {
    tabSize: settings.tabSize,
    fontSize: settings.fontSize,
    fontFamily: settings.fontFamily,
    wordWrap: settings.wordWrap ? "on" : "off",
    readOnly,
    minimap: { enabled: true },
    lineNumbers: "on",
    scrollBeyondLastLine: false,
    automaticLayout: true,
    renderWhitespace: "selection",
    bracketPairColorization: { enabled: true },
    // Find & Replace with regex support (Requirement 1.3)
    find: {
      addExtraSpaceOnTop: false,
      autoFindInSelection: "multiline",
      seedSearchStringFromSelection: "selection",
    },
    // Cursor position display (Requirement 1.4)
    cursorBlinking: "smooth",
    cursorSmoothCaretAnimation: "on",
  };

  return (
    <div className="w-full h-full">
      <Editor
        height="100%"
        language={language}
        value={content}
        theme={getMonacoTheme()}
        options={editorOptions}
        onMount={handleEditorMount}
        onChange={handleChange}
        loading={
          <div className="flex items-center justify-center h-full bg-zinc-900">
            <LoadingSpinner size="lg" />
          </div>
        }
      />
    </div>
  );
}
