import { invokeReservationFunction } from "@/lib/edge-functions";
import type {
  CreateReservationInput,
  ReservationListRow,
  ReservationMutationResult,
  ReservationRecord,
  ReservationRoomSummary,
  ReservationUserSummary,
} from "./types";

interface MapReservationOptions {
  fallbackRoom?: ReservationRoomSummary;
  fallbackUser?: ReservationUserSummary;
}

function mapReservationRow(
  row: ReservationListRow,
  options: MapReservationOptions = {},
): ReservationRecord | null {
  const room = row.rooms || options.fallbackRoom;
  const user = row.users || options.fallbackUser;
  const cell = row.room_cells;
  const userId = row.user_id || row.assigned_to;

  if (!room || !user || !cell || !userId) {
    return null;
  }

  return {
    id: row.id,
    room_id: row.room_id,
    cell_id: row.cell_id,
    user_id: userId,
    room,
    user,
    cell,
    type: row.type || "day",
    status: row.status || "approved",
    date_start: row.date_start,
    date_end: row.date_end,
    time_segment: row.time_segment || "FULL",
    created_at: row.created_at,
  };
}

export async function listMyReservations(
  currentUser: ReservationUserSummary,
): Promise<ReservationRecord[]> {
  const rows = await invokeReservationFunction<ReservationListRow[]>("list_my_reservations");
  return (rows || [])
    .map((row) => mapReservationRow(row, { fallbackUser: currentUser }))
    .filter((row): row is ReservationRecord => !!row);
}

export async function listPendingApprovals(): Promise<ReservationRecord[]> {
  const rows = await invokeReservationFunction<ReservationListRow[]>("list_pending_approvals");
  return (rows || [])
    .map((row) => mapReservationRow(row))
    .filter((row): row is ReservationRecord => !!row);
}

export async function listRoomReservations(
  roomId: string,
  fallbackRoom: ReservationRoomSummary,
): Promise<ReservationRecord[]> {
  const rows = await invokeReservationFunction<ReservationListRow[], { roomId: string }>("list_room_reservations", {
    roomId,
  });

  return (rows || [])
    .map((row) => mapReservationRow(row, { fallbackRoom }))
    .filter((row): row is ReservationRecord => !!row);
}

export function createReservation(input: CreateReservationInput): Promise<ReservationMutationResult> {
  return invokeReservationFunction<ReservationMutationResult, CreateReservationInput>("create", input);
}

export function cancelReservation(reservationId: string): Promise<unknown> {
  return invokeReservationFunction("cancel", { reservationId });
}

export function approveReservation(reservationId: string): Promise<unknown> {
  return invokeReservationFunction("approve", { reservationId });
}

export function rejectReservation(reservationId: string): Promise<unknown> {
  return invokeReservationFunction("reject", { reservationId });
}

export function deleteFixedAssignment(assignmentId: string): Promise<unknown> {
  return invokeReservationFunction("delete_fixed_assignment", { assignmentId });
}
