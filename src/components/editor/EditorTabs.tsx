import { useCallback, useRef, useState, useEffect } from "react";
import { ChevronLeft, ChevronRight, X, Settings } from "lucide-react";
import { useOpenFiles, useActiveFileId, useEditorActions } from "../../store";
import { EditorTab } from "./EditorTab";
import { EditorSettings } from "./EditorSettings";

/**
 * Editor tabs container component
 * Displays tabs for all open files with scroll support and close all functionality
 * 
 * Requirements: 1.5
 * - Display tabs for open files
 * - Show unsaved indicator (dot) for modified files
 * - Handle tab click, close, reorder
 */
export function EditorTabs() {
  const openFiles = useOpenFiles();
  const activeFileId = useActiveFileId();
  const { setActiveFile, closeFile, closeAllFiles } = useEditorActions();
  
  const tabsContainerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Check scroll state
  const updateScrollState = useCallback(() => {
    const container = tabsContainerRef.current;
    if (!container) return;
    
    setCanScrollLeft(container.scrollLeft > 0);
    setCanScrollRight(
      container.scrollLeft < container.scrollWidth - container.clientWidth - 1
    );
  }, []);

  // Update scroll state on mount and when files change
  useEffect(() => {
    updateScrollState();
    
    // Add resize observer to update scroll state on container resize
    const container = tabsContainerRef.current;
    if (!container) return;
    
    const resizeObserver = new ResizeObserver(updateScrollState);
    resizeObserver.observe(container);
    
    return () => resizeObserver.disconnect();
  }, [openFiles.length, updateScrollState]);

  // Scroll tabs left/right
  const scrollTabs = useCallback((direction: "left" | "right") => {
    const container = tabsContainerRef.current;
    if (!container) return;
    
    const scrollAmount = 200;
    container.scrollBy({
      left: direction === "left" ? -scrollAmount : scrollAmount,
      behavior: "smooth",
    });
  }, []);

  // Handle tab selection
  const handleSelectTab = useCallback((fileId: string) => {
    setActiveFile(fileId);
  }, [setActiveFile]);

  // Handle tab close
  const handleCloseTab = useCallback((fileId: string) => {
    closeFile(fileId);
  }, [closeFile]);

  // Handle close all tabs
  const handleCloseAll = useCallback(() => {
    // Check for unsaved files
    const hasUnsaved = openFiles.some((f) => f.isModified);
    if (hasUnsaved) {
      const confirmed = window.confirm(
        "You have unsaved changes. Are you sure you want to close all files?"
      );
      if (!confirmed) return;
    }
    closeAllFiles();
  }, [openFiles, closeAllFiles]);

  // Handle keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!activeFileId || openFiles.length === 0) return;
    
    const currentIndex = openFiles.findIndex((f) => f.id === activeFileId);
    if (currentIndex === -1) return;
    
    if (e.key === "ArrowLeft" && currentIndex > 0) {
      e.preventDefault();
      setActiveFile(openFiles[currentIndex - 1].id);
    } else if (e.key === "ArrowRight" && currentIndex < openFiles.length - 1) {
      e.preventDefault();
      setActiveFile(openFiles[currentIndex + 1].id);
    }
  }, [activeFileId, openFiles, setActiveFile]);

  // Don't render if no files are open
  if (openFiles.length === 0) {
    return null;
  }

  return (
    <>
      <div 
        className="flex items-center bg-secondary/30 border-b border-border"
        onKeyDown={handleKeyDown}
        tabIndex={0}
      >
        {/* Scroll left button */}
        {canScrollLeft && (
          <button
            onClick={() => scrollTabs("left")}
            className="p-1 hover:bg-secondary transition-colors shrink-0"
            title="Scroll tabs left"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        )}
        
        {/* Tabs container */}
        <div
          ref={tabsContainerRef}
          className="flex-1 flex overflow-x-auto scrollbar-none"
          onScroll={updateScrollState}
        >
          {openFiles.map((file) => (
            <EditorTab
              key={file.id}
              file={file}
              isActive={file.id === activeFileId}
              onSelect={() => handleSelectTab(file.id)}
              onClose={() => handleCloseTab(file.id)}
            />
          ))}
        </div>
        
        {/* Scroll right button */}
        {canScrollRight && (
          <button
            onClick={() => scrollTabs("right")}
            className="p-1 hover:bg-secondary transition-colors shrink-0"
            title="Scroll tabs right"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        )}
        
        {/* Close all button */}
        {openFiles.length > 1 && (
          <button
            onClick={handleCloseAll}
            className="p-1.5 mx-1 hover:bg-destructive/20 hover:text-destructive rounded transition-colors shrink-0"
            title="Close all files"
          >
            <X className="w-4 h-4" />
          </button>
        )}

        {/* Settings button */}
        <button
          onClick={() => setSettingsOpen(true)}
          className="p-1.5 mx-1 hover:bg-secondary rounded transition-colors shrink-0"
          title="Editor Settings"
        >
          <Settings className="w-4 h-4" />
        </button>
      </div>

      {/* Editor Settings Dialog */}
      <EditorSettings open={settingsOpen} onOpenChange={setSettingsOpen} />
    </>
  );
}
