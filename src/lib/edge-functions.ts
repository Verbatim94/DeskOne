import { supabase } from "@/integrations/supabase/client";
import { authService, type Session } from "@/lib/auth";

type EdgeFunctionName = "manage-rooms" | "manage-reservations";

interface EdgeErrorPayload {
  error?: string;
  message?: string;
  msg?: string;
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
    throw new Error(getEdgeErrorMessage(response.data) || getEdgeErrorMessage(response.error));
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
