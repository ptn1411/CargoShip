import { useCallback } from "react";
import { useAppStore } from "../store";
import { parseError, createRetryAction } from "../lib/errorHandler";

export function useErrorHandler() {
  const showError = useAppStore((state) => state.showError);
  const showWarning = useAppStore((state) => state.showWarning);

  const handleError = useCallback(
    (error: unknown, options?: { onRetry?: () => void }) => {
      const parsed = parseError(error);
      const action = options?.onRetry
        ? createRetryAction(options.onRetry)
        : parsed.action;

      showError(parsed.title, parsed.message, action);
    },
    [showError]
  );

  const handleWarning = useCallback(
    (error: unknown, options?: { onRetry?: () => void }) => {
      const parsed = parseError(error);
      const action = options?.onRetry
        ? createRetryAction(options.onRetry)
        : parsed.action;

      showWarning(parsed.title, parsed.message, action);
    },
    [showWarning]
  );

  return {
    handleError,
    handleWarning,
  };
}
