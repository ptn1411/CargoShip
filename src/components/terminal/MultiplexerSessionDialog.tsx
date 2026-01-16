import { useState, useEffect } from "react";
import { Loader2, Terminal, Layers, RefreshCw, ExternalLink } from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
import { cn } from "../../lib/utils";
import { terminalApi, MultiplexerSession } from "../../lib/tauri";

interface MultiplexerSessionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  serverId: string;
  terminalSessionId: string;
  onAttach: (session: MultiplexerSession) => void;
}

export function MultiplexerSessionDialog({
  open,
  onOpenChange,
  serverId,
  terminalSessionId,
  onAttach,
}: MultiplexerSessionDialogProps) {
  const [sessions, setSessions] = useState<MultiplexerSession[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadSessions = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const detected = await terminalApi.detectMultiplexerSessions(serverId);
      setSessions(detected);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (open && serverId) {
      loadSessions();
    }
  }, [open, serverId]);

  const handleAttach = async (session: MultiplexerSession) => {
    try {
      await terminalApi.attachMultiplexerSession(
        terminalSessionId,
        session.multiplexer_type,
        session.name
      );
      onAttach(session);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const tmuxSessions = sessions.filter((s) => s.multiplexer_type === "tmux");
  const screenSessions = sessions.filter((s) => s.multiplexer_type === "screen");

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-50" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-background border border-border rounded-lg shadow-lg z-50 p-6">
          <Dialog.Title className="text-lg font-semibold flex items-center gap-2">
            <Layers className="w-5 h-5" />
            Multiplexer Sessions
          </Dialog.Title>
          <Dialog.Description className="text-sm text-muted-foreground mt-1">
            Detected tmux and screen sessions on this server
          </Dialog.Description>

          <div className="mt-4">
            {/* Refresh Button */}
            <div className="flex justify-end mb-3">
              <button
                onClick={loadSessions}
                disabled={isLoading}
                className="flex items-center gap-1 px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-accent rounded transition-colors"
              >
                <RefreshCw className={cn("w-3 h-3", isLoading && "animate-spin")} />
                Refresh
              </button>
            </div>

            {/* Loading State */}
            {isLoading && (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            )}

            {/* Error State */}
            {error && (
              <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm">
                {error}
              </div>
            )}

            {/* No Sessions */}
            {!isLoading && !error && sessions.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <Terminal className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No tmux or screen sessions found</p>
              </div>
            )}

            {/* Session Lists */}
            {!isLoading && !error && sessions.length > 0 && (
              <div className="space-y-4 max-h-[300px] overflow-y-auto">
                {/* Tmux Sessions */}
                {tmuxSessions.length > 0 && (
                  <div>
                    <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                      Tmux Sessions
                    </h4>
                    <div className="space-y-1">
                      {tmuxSessions.map((session) => (
                        <SessionItem
                          key={`tmux-${session.name}`}
                          session={session}
                          onAttach={handleAttach}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Screen Sessions */}
                {screenSessions.length > 0 && (
                  <div>
                    <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                      Screen Sessions
                    </h4>
                    <div className="space-y-1">
                      {screenSessions.map((session) => (
                        <SessionItem
                          key={`screen-${session.name}`}
                          session={session}
                          onAttach={handleAttach}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Close Button */}
          <div className="mt-6 flex justify-end">
            <Dialog.Close asChild>
              <button className="px-4 py-2 text-sm rounded-md border border-border hover:bg-accent transition-colors">
                Close
              </button>
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function SessionItem({
  session,
  onAttach,
}: {
  session: MultiplexerSession;
  onAttach: (session: MultiplexerSession) => void;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between p-2 rounded-md border border-border",
        "hover:bg-accent/50 transition-colors"
      )}
    >
      <div className="flex items-center gap-2">
        <div
          className={cn(
            "w-2 h-2 rounded-full",
            session.attached ? "bg-yellow-500" : "bg-green-500"
          )}
          title={session.attached ? "Attached" : "Detached"}
        />
        <div>
          <div className="text-sm font-medium">{session.name}</div>
          <div className="text-xs text-muted-foreground flex items-center gap-2">
            <span className="capitalize">{session.multiplexer_type}</span>
            {session.windows !== null && (
              <span>• {session.windows} window{session.windows !== 1 ? "s" : ""}</span>
            )}
            {session.attached && <span className="text-yellow-600">• Attached</span>}
          </div>
        </div>
      </div>
      <button
        onClick={() => onAttach(session)}
        disabled={session.attached}
        className={cn(
          "flex items-center gap-1 px-2 py-1 text-xs rounded",
          session.attached
            ? "text-muted-foreground cursor-not-allowed"
            : "bg-primary text-primary-foreground hover:bg-primary/90"
        )}
        title={session.attached ? "Session is already attached" : "Attach to session"}
      >
        <ExternalLink className="w-3 h-3" />
        Attach
      </button>
    </div>
  );
}
