import { RefObject, useEffect, useRef } from "react";
import { Snippet } from "../../lib/tauri";

interface TerminalSuggestionsProps {
  isOpen: boolean;
  suggestions: Snippet[];
  selectedIndex: number;
  onSelect: (snippet: Snippet) => void;
  position: { top: number; left: number };
  containerRef?: RefObject<HTMLDivElement | null>;
}

export function TerminalSuggestions({
  isOpen,
  suggestions,
  selectedIndex,
  onSelect,
  position,
  containerRef,
}: TerminalSuggestionsProps) {
  const suggestionRef = useRef<HTMLDivElement>(null);

  // Auto scroll selected item into view
  useEffect(() => {
    if (suggestionRef.current && isOpen) {
      const selected = suggestionRef.current.querySelector(
        `[data-index="${selectedIndex}"]`,
      );
      selected?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [selectedIndex, isOpen]);

  if (!isOpen || suggestions.length === 0) return null;

  // Check if position is invalid
  const isValidPosition = !isNaN(position.top) && !isNaN(position.left);

  // Calculate if we need to flip the dropdown above
  const dropdownHeight = 288; // max-h-72 = 18rem = 288px
  const windowHeight = typeof window !== "undefined" ? window.innerHeight : 800;
  const spaceBelow = windowHeight - position.top;
  const shouldFlipUp =
    spaceBelow < dropdownHeight && position.top > dropdownHeight;

  // Adjust left position to stay within screen bounds
  const windowWidth = typeof window !== "undefined" ? window.innerWidth : 1200;
  const dropdownWidth = 288; // w-72 = 18rem = 288px
  let adjustedLeft = position.left;
  if (position.left + dropdownWidth > windowWidth - 10) {
    adjustedLeft = windowWidth - dropdownWidth - 10;
  }
  if (adjustedLeft < 10) {
    adjustedLeft = 10;
  }

  return (
    <div
      ref={suggestionRef}
      className={`fixed z-[9999] w-72 max-h-72 animate-in fade-in duration-200 ${
        shouldFlipUp ? "slide-in-from-bottom-2" : "slide-in-from-top-2"
      }`}
      style={
        isValidPosition
          ? {
              top: shouldFlipUp ? "auto" : `${position.top}px`,
              bottom: shouldFlipUp
                ? `${windowHeight - position.top + 20}px`
                : "auto",
              left: `${adjustedLeft}px`,
            }
          : {
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
            }
      }>
      {/* Glassmorphism container with gradient border */}
      <div className="relative rounded-xl overflow-hidden shadow-2xl">
        {/* Gradient border effect */}
        <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/30 via-cyan-500/20 to-blue-500/30 rounded-xl" />

        {/* Inner content with glass effect */}
        <div className="relative m-[1px] rounded-xl backdrop-blur-xl bg-slate-900/95">
          {/* Header with icon */}
          <div className="px-3 py-2.5 border-b border-slate-700/50 flex items-center gap-2">
            <div className="flex items-center justify-center w-5 h-5 rounded bg-gradient-to-br from-emerald-500 to-cyan-500">
              <svg
                className="w-3 h-3 text-white"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2.5}
                  d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
            </div>
            <span className="text-xs font-medium text-slate-300">Snippets</span>
            <span className="ml-auto text-[10px] font-medium text-slate-500 bg-slate-800 px-1.5 py-0.5 rounded">
              {suggestions.length}
            </span>
          </div>

          {/* List */}
          <ul className="overflow-y-auto max-h-48 py-1 m-0 p-0 list-none scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
            {suggestions.map((snippet, index) => (
              <li
                key={snippet.id}
                data-index={index}
                className={`group mx-1 px-2.5 py-2 cursor-pointer text-sm rounded-lg transition-all duration-150 ${
                  index === selectedIndex
                    ? "bg-gradient-to-r from-emerald-600/90 to-cyan-600/90 text-white shadow-lg shadow-emerald-500/20"
                    : "text-slate-200 hover:bg-slate-800/80"
                }`}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onSelect(snippet);
                }}
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}>
                <div className="flex items-center gap-2">
                  {/* Command icon */}
                  <div
                    className={`flex-shrink-0 w-6 h-6 rounded flex items-center justify-center ${
                      index === selectedIndex
                        ? "bg-white/20"
                        : "bg-slate-800 group-hover:bg-slate-700"
                    }`}>
                    <svg
                      className={`w-3.5 h-3.5 ${index === selectedIndex ? "text-white" : "text-emerald-400"}`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 5l7 7-7 7"
                      />
                    </svg>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate text-[13px]">
                      {snippet.name}
                    </div>
                    <div
                      className={`text-[11px] truncate mt-0.5 font-mono ${
                        index === selectedIndex
                          ? "text-emerald-100"
                          : "text-slate-500"
                      }`}>
                      {snippet.command}
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>

          {/* Footer with keyboard hints */}
          <div className="px-3 py-2 border-t border-slate-700/50 flex items-center justify-center gap-4">
            <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
              <span className="px-1 py-0.5 bg-slate-800 rounded text-slate-400 font-mono">
                ↑↓
              </span>
              <span>Navigate</span>
            </div>
            <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
              <span className="px-1 py-0.5 bg-slate-800 rounded text-slate-400 font-mono">
                Tab
              </span>
              <span>Select</span>
            </div>
            <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
              <span className="px-1 py-0.5 bg-slate-800 rounded text-slate-400 font-mono">
                Esc
              </span>
              <span>Close</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
