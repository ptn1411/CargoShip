import { useState, useCallback } from "react";
import {
  LayoutGrid,
  Square,
  Columns2,
  Rows2,
  Grid2x2,
  LayoutPanelLeft,
  X,
  Monitor,
  Server,
  Maximize2,
  Grid3x3,
} from "lucide-react";
import { cn } from "../../lib/utils";
import { TerminalView } from "./TerminalView";
import { LocalTerminalView } from "./LocalTerminalView";
import { TerminalSettingsData } from "./TerminalSettings";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";

// Layout types
export type LayoutType = 
  | "single" 
  | "split-h" 
  | "split-v" 
  | "quad" 
  | "triple-left" 
  | "triple-right"
  | "grid-2x3"
  | "grid-3x2"
  | "grid-3x3";

interface TerminalSession {
  id: string;
  serverId: string;
  serverName: string;
  isConnected: boolean;
  createdAt: Date;
  isLocal?: boolean;
}

interface TerminalSnapLayoutProps {
  sessions: TerminalSession[];
  activeTerminalId: string | null;
  onSetActive: (id: string) => void;
  onClose: (id: string, isLocal?: boolean) => void;
  terminalSettings?: TerminalSettingsData;
}

interface LayoutOption {
  type: LayoutType;
  icon: React.ReactNode;
  label: string;
  minPanels: number;
  maxPanels: number;
}

const layoutOptions: LayoutOption[] = [
  { type: "single", icon: <Square className="w-4 h-4" />, label: "Single", minPanels: 1, maxPanels: 1 },
  { type: "split-v", icon: <Columns2 className="w-4 h-4" />, label: "Split Vertical", minPanels: 2, maxPanels: 2 },
  { type: "split-h", icon: <Rows2 className="w-4 h-4" />, label: "Split Horizontal", minPanels: 2, maxPanels: 2 },
  { type: "triple-left", icon: <LayoutPanelLeft className="w-4 h-4" />, label: "1 + 2 Left", minPanels: 3, maxPanels: 3 },
  { type: "triple-right", icon: <LayoutPanelLeft className="w-4 h-4 rotate-180" />, label: "1 + 2 Right", minPanels: 3, maxPanels: 3 },
  { type: "quad", icon: <Grid2x2 className="w-4 h-4" />, label: "2x2 Grid", minPanels: 4, maxPanels: 4 },
  { type: "grid-2x3", icon: <GridIcon rows={2} cols={3} />, label: "2x3 Grid", minPanels: 5, maxPanels: 6 },
  { type: "grid-3x2", icon: <GridIcon rows={3} cols={2} />, label: "3x2 Grid", minPanels: 5, maxPanels: 6 },
  { type: "grid-3x3", icon: <Grid3x3 className="w-4 h-4" />, label: "3x3 Grid", minPanels: 7, maxPanels: 9 },
];

// Custom grid icon component
function GridIcon({ rows, cols }: { rows: number; cols: number }) {
  return (
    <div className="w-4 h-4 grid gap-0.5" style={{ gridTemplateRows: `repeat(${rows}, 1fr)`, gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
      {Array.from({ length: rows * cols }).map((_, i) => (
        <div key={i} className="bg-current rounded-[1px]" />
      ))}
    </div>
  );
}

export function TerminalSnapLayout({
  sessions,
  activeTerminalId,
  onSetActive,
  onClose,
  terminalSettings,
}: TerminalSnapLayoutProps) {
  const [layout, setLayout] = useState<LayoutType>("single");
  const [panelAssignments, setPanelAssignments] = useState<(string | null)[]>(
    Array(9).fill(null)
  );

  // Get number of panels for current layout
  const getPanelCount = (layoutType: LayoutType): number => {
    switch (layoutType) {
      case "single": return 1;
      case "split-h":
      case "split-v": return 2;
      case "triple-left":
      case "triple-right": return 3;
      case "quad": return 4;
      case "grid-2x3":
      case "grid-3x2": return 6;
      case "grid-3x3": return 9;
      default: return 1;
    }
  };

  const panelCount = getPanelCount(layout);

  // Auto-assign sessions to panels when layout changes
  const getEffectivePanelAssignments = useCallback((): (string | null)[] => {
    const assignments = [...panelAssignments];
    let sessionIndex = 0;

    for (let i = 0; i < panelCount; i++) {
      if (!assignments[i] || !sessions.find(s => s.id === assignments[i])) {
        // Find next unassigned session
        while (sessionIndex < sessions.length) {
          const session = sessions[sessionIndex];
          if (!assignments.slice(0, panelCount).includes(session.id)) {
            assignments[i] = session.id;
            break;
          }
          sessionIndex++;
        }
        if (sessionIndex >= sessions.length && !assignments[i]) {
          assignments[i] = null;
        }
      }
    }

    return assignments;
  }, [panelAssignments, sessions, panelCount]);

  const effectiveAssignments = getEffectivePanelAssignments();

  const handleAssignToPanel = (panelIndex: number, sessionId: string) => {
    setPanelAssignments(prev => {
      const newAssignments = [...prev];
      // Remove session from other panels
      for (let i = 0; i < newAssignments.length; i++) {
        if (newAssignments[i] === sessionId) {
          newAssignments[i] = null;
        }
      }
      newAssignments[panelIndex] = sessionId;
      return newAssignments;
    });
    onSetActive(sessionId);
  };

  const handleMaximize = (sessionId: string) => {
    setLayout("single");
    setPanelAssignments([sessionId, null, null, null]);
    onSetActive(sessionId);
  };

  const renderTerminalPanel = (panelIndex: number, className: string) => {
    const sessionId = effectiveAssignments[panelIndex];
    const session = sessionId ? sessions.find(s => s.id === sessionId) : null;
    const isActive = sessionId === activeTerminalId;

    return (
      <div
        className={cn(
          "relative flex flex-col border border-border rounded overflow-hidden",
          isActive && "ring-2 ring-primary",
          className
        )}
        onClick={() => sessionId && onSetActive(sessionId)}
      >
        {session ? (
          <>
            {/* Panel Header */}
            <div className={cn(
              "flex items-center justify-between px-2 py-1 bg-secondary border-b border-border text-xs",
              isActive && "bg-primary/10"
            )}>
              <div className="flex items-center gap-1.5">
                {session.isLocal ? (
                  <Monitor className="w-3 h-3" />
                ) : (
                  <Server className="w-3 h-3" />
                )}
                <span className="truncate max-w-[120px]">{session.serverName}</span>
              </div>
              <div className="flex items-center gap-1">
                {panelCount > 1 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleMaximize(session.id);
                    }}
                    className="p-0.5 hover:bg-accent rounded"
                    title="Maximize"
                  >
                    <Maximize2 className="w-3 h-3" />
                  </button>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onClose(session.id, session.isLocal);
                  }}
                  className="p-0.5 hover:bg-destructive/20 hover:text-destructive rounded"
                  title="Close"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            </div>
            {/* Terminal Content */}
            <div className="flex-1 overflow-hidden">
              {session.isLocal ? (
                <LocalTerminalView
                  sessionId={session.id}
                  isActive={isActive}
                  alwaysVisible={true}
                  terminalSettings={terminalSettings}
                />
              ) : (
                <TerminalView
                  sessionId={session.id}
                  isActive={isActive}
                  alwaysVisible={true}
                  terminalSettings={terminalSettings}
                />
              )}
            </div>
          </>
        ) : (
          <EmptyPanel
            panelIndex={panelIndex}
            sessions={sessions}
            assignedIds={effectiveAssignments.filter(Boolean) as string[]}
            onAssign={handleAssignToPanel}
          />
        )}
      </div>
    );
  };

  const renderLayout = () => {
    switch (layout) {
      case "single":
        return renderTerminalPanel(0, "w-full h-full");

      case "split-v":
        return (
          <div className="flex h-full gap-1">
            {renderTerminalPanel(0, "w-1/2 h-full")}
            {renderTerminalPanel(1, "w-1/2 h-full")}
          </div>
        );

      case "split-h":
        return (
          <div className="flex flex-col h-full gap-1">
            {renderTerminalPanel(0, "w-full h-1/2")}
            {renderTerminalPanel(1, "w-full h-1/2")}
          </div>
        );

      case "quad":
        return (
          <div className="grid grid-cols-2 grid-rows-2 h-full gap-1">
            {renderTerminalPanel(0, "")}
            {renderTerminalPanel(1, "")}
            {renderTerminalPanel(2, "")}
            {renderTerminalPanel(3, "")}
          </div>
        );

      case "triple-left":
        return (
          <div className="flex h-full gap-1">
            {renderTerminalPanel(0, "w-1/2 h-full")}
            <div className="w-1/2 flex flex-col gap-1">
              {renderTerminalPanel(1, "h-1/2")}
              {renderTerminalPanel(2, "h-1/2")}
            </div>
          </div>
        );

      case "triple-right":
        return (
          <div className="flex h-full gap-1">
            <div className="w-1/2 flex flex-col gap-1">
              {renderTerminalPanel(1, "h-1/2")}
              {renderTerminalPanel(2, "h-1/2")}
            </div>
            {renderTerminalPanel(0, "w-1/2 h-full")}
          </div>
        );

      case "grid-2x3":
        return (
          <div className="grid grid-cols-3 grid-rows-2 h-full gap-1">
            {renderTerminalPanel(0, "")}
            {renderTerminalPanel(1, "")}
            {renderTerminalPanel(2, "")}
            {renderTerminalPanel(3, "")}
            {renderTerminalPanel(4, "")}
            {renderTerminalPanel(5, "")}
          </div>
        );

      case "grid-3x2":
        return (
          <div className="grid grid-cols-2 grid-rows-3 h-full gap-1">
            {renderTerminalPanel(0, "")}
            {renderTerminalPanel(1, "")}
            {renderTerminalPanel(2, "")}
            {renderTerminalPanel(3, "")}
            {renderTerminalPanel(4, "")}
            {renderTerminalPanel(5, "")}
          </div>
        );

      case "grid-3x3":
        return (
          <div className="grid grid-cols-3 grid-rows-3 h-full gap-1">
            {renderTerminalPanel(0, "")}
            {renderTerminalPanel(1, "")}
            {renderTerminalPanel(2, "")}
            {renderTerminalPanel(3, "")}
            {renderTerminalPanel(4, "")}
            {renderTerminalPanel(5, "")}
            {renderTerminalPanel(6, "")}
            {renderTerminalPanel(7, "")}
            {renderTerminalPanel(8, "")}
          </div>
        );

      default:
        return renderTerminalPanel(0, "w-full h-full");
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Layout Selector */}
      <div className="flex items-center justify-end gap-1 p-1 bg-secondary border-b border-border">
        <span className="text-xs text-muted-foreground mr-2">Layout:</span>
        <div className="flex items-center gap-0.5 flex-wrap">
          {layoutOptions.map((option) => {
            const canUse = sessions.length >= option.minPanels;
            return (
              <button
                key={option.type}
                onClick={() => setLayout(option.type)}
                disabled={!canUse}
                className={cn(
                  "p-1.5 rounded transition-colors",
                  layout === option.type
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-accent",
                  !canUse && "opacity-30 cursor-not-allowed"
                )}
                title={`${option.label} (${option.minPanels === option.maxPanels ? option.maxPanels : `${option.minPanels}-${option.maxPanels}`} panels)`}
              >
                {option.icon}
              </button>
            );
          })}
        </div>
      </div>

      {/* Layout Content */}
      <div className="flex-1 p-1 bg-background overflow-hidden">
        {renderLayout()}
      </div>
    </div>
  );
}

// Empty panel component for assigning terminals
function EmptyPanel({
  panelIndex,
  sessions,
  assignedIds,
  onAssign,
}: {
  panelIndex: number;
  sessions: TerminalSession[];
  assignedIds: string[];
  onAssign: (panelIndex: number, sessionId: string) => void;
}) {
  const unassignedSessions = sessions.filter(s => !assignedIds.includes(s.id));

  return (
    <div className="h-full flex items-center justify-center bg-secondary/50">
      {unassignedSessions.length > 0 ? (
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button className="flex flex-col items-center gap-2 p-4 rounded-lg border-2 border-dashed border-border hover:border-primary hover:bg-accent/50 transition-colors">
              <LayoutGrid className="w-8 h-8 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Assign Terminal</span>
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              className="min-w-[180px] bg-popover border border-border rounded-md p-1 shadow-md z-50"
              sideOffset={5}
            >
              {unassignedSessions.map((session) => (
                <DropdownMenu.Item
                  key={session.id}
                  className="flex items-center gap-2 px-3 py-2 text-sm rounded cursor-pointer outline-none hover:bg-accent"
                  onClick={() => onAssign(panelIndex, session.id)}
                >
                  {session.isLocal ? (
                    <Monitor className="w-4 h-4" />
                  ) : (
                    <Server className="w-4 h-4" />
                  )}
                  {session.serverName}
                </DropdownMenu.Item>
              ))}
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      ) : (
        <div className="flex flex-col items-center gap-2 text-muted-foreground">
          <LayoutGrid className="w-8 h-8" />
          <span className="text-sm">No terminals available</span>
        </div>
      )}
    </div>
  );
}
