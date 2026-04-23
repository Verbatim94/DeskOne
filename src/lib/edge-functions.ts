import { supabase } from "@/integrations/supabase/client";
import { authService, type Session } from "@/lib/auth";

type EdgeFunctionName = "manage-rooms" | "manage-reservations";

interface EdgeErrorPayload {
  error?: string;
  message?: string;
  msg?: string;
}

interface EdgeFunctionErrorWithContext {
  context?: Response;
}

function isSessionErrorMessage(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("missing session token") ||
    normalized.includes("invalid or expired session") ||
    normalized.includes("user not found or inactive")
  );
}

function getEdgeErrorMessage(error: unknown): string {
  if (typeof error === "string") return error;

  if (error instanceof Error) return error.message;

  if (typeof error === "object" && error !== null) {
    const payload = error as EdgeErrorPayload;
    return payload.message || payload.error || payload.msg || "Unknown error";
  }

  return "Unknown error";
}

function getErrorResponse(error: unknown): Response | undefined {
  if (typeof error !== "object" || error === null || !("context" in error)) {
    return undefined;
  }

  return (error as EdgeFunctionErrorWithContext).context;
}

async function getHttpErrorMessage(response: Response | undefined): Promise<string | null> {
  if (!response) {
    return null;
  }

  try {
    const clonedResponse = response.clone();
    const contentType = clonedResponse.headers.get("Content-Type")?.split(";")[0].trim();

    if (contentType === "application/json") {
      const payload = await clonedResponse.json();
      const message = getEdgeErrorMessage(payload);
      if (message !== "Unknown error") {
        return message;
      }
    } else {
      const text = (await clonedResponse.text()).trim();
      if (text) {
        return text;
      }
    }
  } catch {
    // Fall back to the HTTP status details below if the body cannot be parsed.
  }

  if (response.status === 401) {
    return "Invalid or expired session";
  }

  if (response.statusText) {
    return response.statusText;
  }

  return `Request failed with status ${response.status}`;
}

export function getSessionOrThrow(): Session {
  const session = authService.getSession();
  if (!session) {
    throw new Error("No session");
  }

  return session;
}

async function invokeEdgeFunction<TResult, TData extends Record<string, unknown> | undefined = Record<string, unknown>>(
  functionName: EdgeFunctionName,
  operation: string,
  data?: TData,
): Promise<TResult> {
  const session = getSessionOrThrow();

  const response = await supabase.functions.invoke(functionName, {
    body: { operation, data },
    headers: {
      "x-session-token": session.token,
    },
  });

  if (response.error) {
    const httpMessage = await getHttpErrorMessage(response.response || getErrorResponse(response.error));
    const fallbackMessage =
      (response.data ? getEdgeErrorMessage(response.data) : null) || getEdgeErrorMessage(response.error);
    const message = httpMessage || fallbackMessage;

    if (isSessionErrorMessage(message)) {
      await authService.logout();

      if (typeof window !== "undefined" && window.location.pathname !== "/login") {
        window.location.assign("/login");
      }

      throw new Error("Session expired. Please sign in again.");
    }

    throw new Error(message);
  }

  return response.data as TResult;
}

export function invokeRoomFunction<TResult, TData extends Record<string, unknown> | undefined = Record<string, unknown>>(
  operation: string,
  data?: TData,
): Promise<TResult> {
  return invokeEdgeFunction<TResult, TData>("manage-rooms", operation, data);
}

export function invokeReservationFunction<TResult, TData extends Record<string, unknown> | undefined = Record<string, unknown>>(
  operation: string,
  data?: TData,
): Promise<TResult> {
  return invokeEdgeFunction<TResult, TData>("manage-reservations", operation, data);
}

export { getEdgeErrorMessage };
