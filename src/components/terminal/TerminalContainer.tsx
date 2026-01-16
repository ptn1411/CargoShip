import { useState, useEffect } from "react";
import { Plus, Server, Loader2, Monitor, LayoutGrid, List, Terminal, Layers, Settings } from "lucide-react";
import { cn } from "../../lib/utils";
import { useAppStore } from "../../store";
import { parseError } from "../../lib/errorHandler";
import { TerminalTab } from "./TerminalTab";
import { TerminalView } from "./TerminalView";
import { LocalTerminalView } from "./LocalTerminalView";
import { TerminalSnapLayout } from "./TerminalSnapLayout";
import { MultiplexerSessionDialog } from "./MultiplexerSessionDialog";
import { TerminalSettings, TerminalSettingsData, DEFAULT_TERMINAL_SETTINGS } from "./TerminalSettings";
import { ServerSelectionGrid } from "../ui";
import { localTerminalApi, terminalApi, MultiplexerSession, settingsApi } from "../../lib/tauri";
import { SnippetPicker } from "../snippets";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";

// Extended session type to support both SSH and local terminals
interface ExtendedTerminalSession {
  id: string;
  serverId: string;
  serverName: string;
  isConnected: boolean;
  createdAt: Date;
  isLocal?: boolean;
}

export function TerminalContainer() {
  const servers = useAppStore((state) => state.servers);
  const serverStatus = useAppStore((state) => state.serverStatus);
  const terminalSessions = useAppStore((state) => state.terminalSessions);
  const activeTerminalId = useAppStore((state) => state.activeTerminalId);
  const isCreatingTerminal = useAppStore((state) => state.isCreatingTerminal);
  const terminalError = useAppStore((state) => state.terminalError);

  const openTerminal = useAppStore((state) => state.openTerminal);
  const closeTerminal = useAppStore((state) => state.closeTerminal);
  const setActiveTerminal = useAppStore((state) => state.setActiveTerminal);
  const showError = useAppStore((state) => state.showError);
  const showWarning = useAppStore((state) => state.showWarning);

  const [isOpening, setIsOpening] = useState(false);
  const [localSessions, setLocalSessions] = useState<ExtendedTerminalSession[]>([]);
  const [viewMode, setViewMode] = useState<"tabs" | "snap">("tabs");
  const [isSnippetPickerOpen, setIsSnippetPickerOpen] = useState(false);
  const [isMultiplexerDialogOpen, setIsMultiplexerDialogOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [terminalSettings, setTerminalSettings] = useState<TerminalSettingsData>(DEFAULT_TERMINAL_SETTINGS);

  const showSuccess = useAppStore((state) => state.showSuccess);

  // Load terminal settings from database on mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const saved = await settingsApi.getTerminalSettings();
        setTerminalSettings({
          theme: saved.theme as TerminalSettingsData["theme"],
          fontSize: saved.font_size,
          fontFamily: saved.font_family,
          cursorStyle: saved.cursor_style as TerminalSettingsData["cursorStyle"],
          cursorBlink: saved.cursor_blink,
        });
      } catch (error) {
        console.error("Failed to load terminal settings:", error);
      }
    };
    loadSettings();
  }, []);

  // Save terminal settings to database when changed
  const handleSettingsChange = async (newSettings: TerminalSettingsData) => {
    setTerminalSettings(newSettings);
    try {
      await settingsApi.saveTerminalSettings({
        theme: newSettings.theme,
        font_size: newSettings.fontSize,
        font_family: newSettings.fontFamily,
        cursor_style: newSettings.cursorStyle,
        cursor_blink: newSettings.cursorBlink,
      });
    } catch (error) {
      console.error("Failed to save terminal settings:", error);
    }
  };

  // Combine SSH and local sessions
  const allSessions: ExtendedTerminalSession[] = [
    ...localSessions,
    ...terminalSessions.map(s => ({ ...s, isLocal: false })),
  ];

  // Get active session for multiplexer detection
  const activeSession = allSessions.find(s => s.id === activeTerminalId);
  const canDetectMultiplexer = activeSession && !activeSession.isLocal;

  // Handle multiplexer session attach
  const handleMultiplexerAttach = (session: MultiplexerSession) => {
    showSuccess(
      "Attached to session",
      `Connected to ${session.multiplexer_type} session: ${session.name}`
    );
  };

  // Handle snippet insertion into active terminal
  const handleInsertSnippet = async (command: string) => {
    if (!activeTerminalId) {
      showWarning("No active terminal", "Please select a terminal first");
      return;
    }

    const activeSession = allSessions.find(s => s.id === activeTerminalId);
    if (!activeSession) return;

    try {
      const bytes = Array.from(new TextEncoder().encode(command));
      if (activeSession.isLocal) {
        await localTerminalApi.write(activeTerminalId, bytes);
      } else {
        await terminalApi.write(activeTerminalId, bytes);
      }
      showSuccess("Snippet inserted", "Command pasted to terminal");
    } catch (error) {
      const parsed = parseError(error);
      showError(parsed.title, parsed.message);
    }
  };

  const handleOpenTerminal = async (serverId: string) => {
    setIsOpening(true);
    try {
      await openTerminal(serverId);
    } catch (error) {
      const parsed = parseError(error);
      showError(parsed.title, parsed.message, {
        label: "Retry",
        onClick: () => handleOpenTerminal(serverId),
      });
    } finally {
      setIsOpening(false);
    }
  };

  const handleOpenLocalTerminal = async () => {
    setIsOpening(true);
    try {
      const sessionId = await localTerminalApi.createSession();
      const newSession: ExtendedTerminalSession = {
        id: sessionId,
        serverId: "local",
        serverName: "Local",
        isConnected: true,
        createdAt: new Date(),
        isLocal: true,
      };
      setLocalSessions(prev => [...prev, newSession]);
      setActiveTerminal(sessionId);
    } catch (error) {
      const parsed = parseError(error);
      showError(parsed.title, parsed.message);
    } finally {
      setIsOpening(false);
    }
  };

  const handleCloseTerminal = async (sessionId: string, isLocal?: boolean) => {
    try {
      if (isLocal) {
        // Remove from state first to unmount the component
        setLocalSessions(prev => prev.filter(s => s.id !== sessionId));
        
        // Set active to another session if available
        const remaining = [...localSessions.filter(s => s.id !== sessionId), ...terminalSessions];
        if (remaining.length > 0) {
          setActiveTerminal(remaining[0].id);
        }
        
        // Then close the backend session after a small delay to allow cleanup
        setTimeout(async () => {
          try {
            await localTerminalApi.closeSession(sessionId);
          } catch (error) {
            console.error("Failed to close local terminal session:", error);
          }
        }, 100);
      } else {
        await closeTerminal(sessionId);
      }
    } catch (error) {
      const parsed = parseError(error);
      showWarning(parsed.title, parsed.message);
    }
  };

  // No sessions state
  if (allSessions.length === 0) {
    return (
      <div className="h-full flex flex-col p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Terminal</h2>
        </div>

        {terminalError && (
          <div className="mb-4 p-3 rounded-md bg-destructive/10 text-destructive text-sm">
            {terminalError}
          </div>
        )}

        <div className="flex-1 flex flex-col gap-6">
          {/* Local Terminal Section */}
          <div className="p-4 border border-border rounded-lg bg-card">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-md bg-primary/10">
                  <Monitor className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-medium">Local Terminal</h3>
                  <p className="text-sm text-muted-foreground">Open a terminal on your local machine</p>
                </div>
              </div>
              <button
                onClick={handleOpenLocalTerminal}
                disabled={isOpening || isCreatingTerminal}
                className="flex items-center gap-2 px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {isOpening ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Plus className="w-4 h-4" />
                )}
                Open
              </button>
            </div>
          </div>

          {/* SSH Servers Section */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Server className="w-4 h-4 text-muted-foreground" />
              <h3 className="font-medium">SSH Servers</h3>
            </div>
            <ServerSelectionGrid
              servers={servers}
              serverStatus={serverStatus}
              onSelect={handleOpenTerminal}
              emptyTitle="No servers configured"
              emptyDescription="Add a server in the Servers tab to connect via SSH"
              isLoading={isOpening || isCreatingTerminal}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
        {/* Tab Bar */}
      <div className="flex items-center bg-secondary border-b border-border">
        {/* View Mode Toggle */}
        <div className="flex items-center border-r border-border">
          <button
            onClick={() => setViewMode("tabs")}
            className={cn(
              "p-2 transition-colors",
              viewMode === "tabs" ? "bg-accent text-foreground" : "hover:bg-accent/50 text-muted-foreground"
            )}
            title="Tab View"
          >
            <List className="w-4 h-4" />
          </button>
          <button
            onClick={() => setViewMode("snap")}
            className={cn(
              "p-2 transition-colors",
              viewMode === "snap" ? "bg-accent text-foreground" : "hover:bg-accent/50 text-muted-foreground"
            )}
            title="Snap Layout"
          >
            <LayoutGrid className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs (only in tab mode) */}
        {viewMode === "tabs" && (
          <div className="flex-1 flex items-center overflow-x-auto">
            {allSessions.map((session) => (
              <TerminalTab
                key={session.id}
                session={session}
                isActive={session.id === activeTerminalId}
                onSelect={() => setActiveTerminal(session.id)}
                onClose={() => handleCloseTerminal(session.id, session.isLocal)}
                isLocal={session.isLocal}
              />
            ))}
          </div>
        )}

        {/* Session count in snap mode */}
        {viewMode === "snap" && (
          <div className="flex-1 flex items-center px-3">
            <span className="text-sm text-muted-foreground">
              {allSessions.length} terminal{allSessions.length !== 1 ? "s" : ""} open
            </span>
          </div>
        )}

        {/* Multiplexer Sessions Button (tmux/screen) */}
        {canDetectMultiplexer && (
          <button
            onClick={() => setIsMultiplexerDialogOpen(true)}
            className="p-2 hover:bg-accent transition-colors border-l border-border"
            title="Detect tmux/screen sessions"
          >
            <Layers className="w-4 h-4" />
          </button>
        )}

        {/* Settings Button */}
        <button
          onClick={() => setIsSettingsOpen(true)}
          className="p-2 hover:bg-accent transition-colors border-l border-border"
          title="Terminal settings"
        >
          <Settings className="w-4 h-4" />
        </button>

        {/* Snippet Button */}
        <button
          onClick={() => setIsSnippetPickerOpen(true)}
          className="p-2 hover:bg-accent transition-colors border-l border-border"
          title="Insert snippet"
        >
          <Terminal className="w-4 h-4" />
        </button>

        {/* New Terminal Button */}
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button
              disabled={isOpening || isCreatingTerminal || allSessions.length >= 10}
              className={cn(
                "p-2 hover:bg-accent transition-colors disabled:opacity-50",
                allSessions.length >= 10 && "cursor-not-allowed"
              )}
              title={allSessions.length >= 10 ? "Maximum 10 terminals" : "New terminal"}
            >
              {(isOpening || isCreatingTerminal) ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Plus className="w-4 h-4" />
              )}
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              className="min-w-[200px] bg-popover border border-border rounded-md p-1 shadow-md z-50"
              sideOffset={5}
              align="end"
            >
              {/* Local Terminal Option */}
              <DropdownMenu.Item
                className="flex items-center gap-2 px-3 py-2 text-sm rounded cursor-pointer outline-none hover:bg-accent"
                onClick={handleOpenLocalTerminal}
              >
                <Monitor className="w-4 h-4" />
                Local Terminal
              </DropdownMenu.Item>
              
              {servers.length > 0 && (
                <>
                  <DropdownMenu.Separator className="h-px bg-border my-1" />
                  <DropdownMenu.Label className="px-3 py-1 text-xs text-muted-foreground">
                    SSH Servers
                  </DropdownMenu.Label>
                  {servers.map((server) => {
                    const status = serverStatus[server.id];
                    const isOnline = status === "online";
                    const isConnecting = status === "connecting";
                    return (
                      <DropdownMenu.Item
                        key={server.id}
                        className={cn(
                          "flex items-center gap-2 px-3 py-2 text-sm rounded cursor-pointer outline-none hover:bg-accent",
                          !isOnline && !isConnecting && "opacity-60"
                        )}
                        onClick={() => handleOpenTerminal(server.id)}
                      >
                        <Server className="w-4 h-4" />
                        <span className="flex-1">{server.name}</span>
                        <span className={cn(
                          "w-2 h-2 rounded-full",
                          isOnline ? "bg-green-500" : isConnecting ? "bg-yellow-500" : "bg-gray-400"
                        )} />
                      </DropdownMenu.Item>
                    );
                  })}
                </>
              )}
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>

      {/* Error Message */}
      {terminalError && (
        <div className="p-3 bg-destructive/10 text-destructive text-sm">
          {terminalError}
        </div>
      )}

      {/* Terminal Views */}
      <div className="flex-1 bg-background overflow-hidden">
        {viewMode === "tabs" ? (
          // Tab View - show one terminal at a time
          allSessions.map((session) => (
            session.isLocal ? (
              <LocalTerminalView
                key={session.id}
                sessionId={session.id}
                isActive={session.id === activeTerminalId}
                terminalSettings={terminalSettings}
              />
            ) : (
              <TerminalView
                key={session.id}
                sessionId={session.id}
                isActive={session.id === activeTerminalId}
                terminalSettings={terminalSettings}
              />
            )
          ))
        ) : (
          // Snap Layout View - show multiple terminals
          <TerminalSnapLayout
            sessions={allSessions}
            activeTerminalId={activeTerminalId}
            onSetActive={setActiveTerminal}
            onClose={handleCloseTerminal}
            terminalSettings={terminalSettings}
          />
        )}
      </div>

      {/* Terminal Settings Dialog */}
      <TerminalSettings
        open={isSettingsOpen}
        onOpenChange={setIsSettingsOpen}
        settings={terminalSettings}
        onSettingsChange={handleSettingsChange}
      />

      {/* Snippet Picker Dialog */}
      <SnippetPicker
        open={isSnippetPickerOpen}
        onOpenChange={setIsSnippetPickerOpen}
        onSelect={handleInsertSnippet}
        title="Insert Snippet to Terminal"
      />

      {/* Multiplexer Session Dialog (tmux/screen) */}
      {activeSession && !activeSession.isLocal && (
        <MultiplexerSessionDialog
          open={isMultiplexerDialogOpen}
          onOpenChange={setIsMultiplexerDialogOpen}
          serverId={activeSession.serverId}
          terminalSessionId={activeSession.id}
          onAttach={handleMultiplexerAttach}
        />
      )}
    </div>
  );
}
