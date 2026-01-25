import { ToastAction } from "../store";

interface ParsedError {
  title: string;
  message: string;
  action?: ToastAction;
}

// Common error patterns and their user-friendly messages
const errorPatterns: Array<{
  pattern: RegExp;
  title: string;
  getMessage: (match: RegExpMatchArray) => string;
  getAction?: () => ToastAction | undefined;
}> = [
  {
    pattern: /connection refused/i,
    title: "Connection Refused",
    getMessage: () =>
      "The server refused the connection. Check if SSH is running on the server.",
    getAction: () => undefined,
  },
  {
    pattern: /Ed25519 authentication failed/i,
    title: "SSH Agent Required",
    getMessage: (match) =>
      match.input || "Ed25519 keys require SSH Agent on Windows.",
    getAction: () => undefined,
  },
  {
    pattern: /authentication failed/i,
    title: "Authentication Failed",
    getMessage: () =>
      "Invalid credentials. Please check your username and password/key.",
    getAction: () => undefined,
  },
  {
    pattern: /host key verification failed/i,
    title: "Host Key Verification Failed",
    getMessage: () => "The server's host key has changed or is not trusted.",
    getAction: () => undefined,
  },
  {
    pattern: /permission denied/i,
    title: "Permission Denied",
    getMessage: () => "You don't have permission to access this resource.",
    getAction: () => undefined,
  },
  {
    pattern: /timeout|timed out/i,
    title: "Connection Timeout",
    getMessage: () =>
      "The connection timed out. Check your network and server availability.",
    getAction: () => undefined,
  },
  {
    pattern: /network (is )?unreachable/i,
    title: "Network Unreachable",
    getMessage: () => "Cannot reach the server. Check your network connection.",
    getAction: () => undefined,
  },
  {
    pattern: /no route to host/i,
    title: "No Route to Host",
    getMessage: () =>
      "Cannot find a route to the server. Check the hostname and your network.",
    getAction: () => undefined,
  },
  {
    pattern: /name or service not known|could not resolve/i,
    title: "DNS Resolution Failed",
    getMessage: () =>
      "Could not resolve the hostname. Check if the hostname is correct.",
    getAction: () => undefined,
  },
  {
    pattern: /server not found/i,
    title: "Server Not Found",
    getMessage: () =>
      "The specified server was not found in your configuration.",
    getAction: () => undefined,
  },
  {
    pattern: /credential.*not found|no credential/i,
    title: "Credentials Not Found",
    getMessage: () =>
      "No credentials found for this server. Please add credentials.",
    getAction: () => undefined,
  },
  {
    pattern: /keychain|keyring.*unavailable/i,
    title: "Keychain Unavailable",
    getMessage: () =>
      "System keychain is not available. Credentials cannot be stored securely.",
    getAction: () => undefined,
  },
  {
    pattern: /session limit|too many sessions/i,
    title: "Session Limit Reached",
    getMessage: () =>
      "Maximum number of terminal sessions reached. Close some sessions first.",
    getAction: () => undefined,
  },
  {
    pattern: /database|sqlite/i,
    title: "Database Error",
    getMessage: () =>
      "A database error occurred. Try restarting the application.",
    getAction: () => undefined,
  },
  {
    pattern: /file not found|no such file/i,
    title: "File Not Found",
    getMessage: () => "The requested file or directory does not exist.",
    getAction: () => undefined,
  },
  {
    pattern: /directory not empty/i,
    title: "Directory Not Empty",
    getMessage: () => "The directory is not empty and cannot be deleted.",
    getAction: () => undefined,
  },
];

export function parseError(error: unknown): ParsedError {
  const errorMessage = error instanceof Error ? error.message : String(error);

  // Try to match against known patterns
  for (const { pattern, title, getMessage, getAction } of errorPatterns) {
    const match = errorMessage.match(pattern);
    if (match) {
      return {
        title,
        message: getMessage(match),
        action: getAction?.(),
      };
    }
  }

  // Default error handling
  return {
    title: "Error",
    message: errorMessage || "An unexpected error occurred.",
  };
}

export function formatErrorForDisplay(error: unknown): string {
  const parsed = parseError(error);
  return parsed.message;
}

// Helper to create retry action
export function createRetryAction(onRetry: () => void): ToastAction {
  return {
    label: "Retry",
    onClick: onRetry,
  };
}

// Helper to create navigate action
export function createNavigateAction(
  label: string,
  navigate: () => void,
): ToastAction {
  return {
    label,
    onClick: navigate,
  };
}
