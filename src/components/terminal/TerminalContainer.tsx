import { useState } from "react";
import { Plus, Server, ChevronDown, Loader2, Terminal } from "lucide-react";
import { cn } from "../../lib/utils";
import { useAppStore } from "../../store";
import { parseError } from "../../lib/errorHandler";
import { TerminalTab } from "./TerminalTab";
import { TerminalView } from "./TerminalView";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";

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

  const onlineServers = servers.filter((s) => serverStatus[s.id] === "online");

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

  const handleCloseTerminal = async (sessionId: string) => {
    try {
      await closeTerminal(sessionId);
    } catch (error) {
      const parsed = parseError(error);
      showWarning(parsed.title, parsed.message);
    }
  };

  // No sessions state
  if (terminalSessions.length === 0) {
    return (
      <div className="h-full flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Terminal</h2>
        </div>

        {/* Error Message */}
        {terminalError && (
          <div className="mb-4 p-3 rounded-md bg-destructive/10 text-destructive text-sm">
            {terminalError}
          </div>
        )}

        <div className="flex-1 flex flex-col items-center justify-center text-center">
          <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center mb-4">
            <Terminal className="w-8 h-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-medium mb-2">No terminal sessions</h3>
          <p className="text-muted-foreground mb-4">
            Open a terminal to a connected server
          </p>

          {onlineServers.length > 0 ? (
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <button
                  disabled={isOpening || isCreatingTerminal}
                  className="flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/90 disabled:opacity-50"
                >
                  {(isOpening || isCreatingTerminal) ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Plus className="w-4 h-4" />
                  )}
                  New Terminal
                  <ChevronDown className="w-4 h-4" />
                </button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content
                  className="min-w-[200px] bg-popover border border-border rounded-md p-1 shadow-md z-50"
                  sideOffset={5}
                >
                  {onlineServers.map((server) => (
                    <DropdownMenu.Item
                      key={server.id}
                      className="flex items-center gap-2 px-3 py-2 text-sm rounded cursor-pointer outline-none hover:bg-accent"
                      onClick={() => handleOpenTerminal(server.id)}
                    >
                      <Server className="w-4 h-4" />
                      {server.name}
                    </DropdownMenu.Item>
                  ))}
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          ) : (
            <p className="text-sm text-muted-foreground">
              No connected servers. Test a connection first.
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col -m-4">
      {/* Tab Bar */}
      <div className="flex items-center bg-secondary border-b border-border">
        {/* Tabs */}
        <div className="flex-1 flex items-center overflow-x-auto">
          {terminalSessions.map((session) => (
            <TerminalTab
              key={session.id}
              session={session}
              isActive={session.id === activeTerminalId}
              onSelect={() => setActiveTerminal(session.id)}
              onClose={() => handleCloseTerminal(session.id)}
            />
          ))}
        </div>

        {/* New Terminal Button */}
        {onlineServers.length > 0 && (
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button
                disabled={isOpening || isCreatingTerminal || terminalSessions.length >= 10}
                className={cn(
                  "p-2 hover:bg-accent transition-colors disabled:opacity-50",
                  terminalSessions.length >= 10 && "cursor-not-allowed"
                )}
                title={terminalSessions.length >= 10 ? "Maximum 10 terminals" : "New terminal"}
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
                {onlineServers.map((server) => (
                  <DropdownMenu.Item
                    key={server.id}
                    className="flex items-center gap-2 px-3 py-2 text-sm rounded cursor-pointer outline-none hover:bg-accent"
                    onClick={() => handleOpenTerminal(server.id)}
                  >
                    <Server className="w-4 h-4" />
                    {server.name}
                  </DropdownMenu.Item>
                ))}
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        )}
      </div>

      {/* Error Message */}
      {terminalError && (
        <div className="p-3 bg-destructive/10 text-destructive text-sm">
          {terminalError}
        </div>
      )}

      {/* Terminal Views */}
      <div className="flex-1 bg-background overflow-hidden">
        {terminalSessions.map((session) => (
          <TerminalView
            key={session.id}
            sessionId={session.id}
            isActive={session.id === activeTerminalId}
          />
        ))}
      </div>
    </div>
  );
}
