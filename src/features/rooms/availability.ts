import { isWithinInterval, parseISO } from "date-fns";
import type {
  FixedAssignment,
  RoomDayStateResponse,
  RoomReservation,
  RoomCell,
} from "./types";

export type DeskStatus = "available" | "reserved" | "my-reservation";

export interface DeskStatusDetails {
  status: DeskStatus;
  reservation?: RoomReservation;
  assignedTo?: string;
}

export function mapRoomDayState(roomDayState: RoomDayStateResponse) {
  const reservations: RoomReservation[] = (roomDayState?.reservations || []).map((row) => ({
    id: row.id,
    cell_id: row.cell_id,
    user_id: row.user_id,
    status: row.status,
    date_start: row.date_start,
    date_end: row.date_end,
    time_segment: row.time_segment,
    user: row.users,
    type: "reservation",
    created_at: row.created_at,
  }));

  const fixedAssignments: FixedAssignment[] = (roomDayState?.fixed_assignments || []).map((assignment) => ({
    id: assignment.id,
    cell_id: assignment.cell_id,
    assigned_to: assignment.assigned_to,
    date_start: assignment.date_start,
    date_end: assignment.date_end,
    created_at: assignment.created_at,
    assigned_user: assignment.assigned_user
      ? {
          id: assignment.assigned_user.id,
          full_name: assignment.assigned_user.full_name,
          username: assignment.assigned_user.username,
        }
      : null,
  }));

  return { reservations, fixedAssignments };
}

export function getReservationDisplayName(reservation?: RoomReservation | null, assignedTo?: string) {
  const fullName = reservation?.user?.full_name?.trim();
  const username = reservation?.user?.username?.trim();
  const assignedName = assignedTo?.trim();

  return fullName || username || assignedName || "another user";
}

function includesDay(dateStart: string, dateEnd: string, dayToCheck: Date) {
  try {
    const startDate = parseISO(dateStart);
    const endDate = parseISO(dateEnd);
    startDate.setHours(0, 0, 0, 0);
    endDate.setHours(0, 0, 0, 0);

    return isWithinInterval(dayToCheck, { start: startDate, end: endDate });
  } catch {
    return false;
  }
}

export function buildDeskStatusMap(
  cells: RoomCell[],
  reservations: RoomReservation[],
  fixedAssignments: FixedAssignment[],
  dayToCheck: Date,
  currentUserId?: string,
): Record<string, DeskStatusDetails> {
  return cells.reduce<Record<string, DeskStatusDetails>>((acc, cell) => {
    const activeAssignment = fixedAssignments.find((assignment) => {
      return assignment.cell_id === cell.id && includesDay(assignment.date_start, assignment.date_end, dayToCheck);
    });

    if (activeAssignment) {
      const assignmentAsReservation: RoomReservation = {
        id: activeAssignment.id,
        cell_id: activeAssignment.cell_id,
        user_id: activeAssignment.assigned_to,
        status: "approved",
        date_start: activeAssignment.date_start,
        date_end: activeAssignment.date_end,
        time_segment: "FULL",
        type: "fixed_assignment",
        user: activeAssignment.assigned_user || {
          id: activeAssignment.assigned_to,
          username: "",
          full_name: "Unknown User",
        },
        created_at: activeAssignment.created_at || new Date().toISOString(),
      };

      acc[cell.id] = {
        status: activeAssignment.assigned_to === currentUserId ? "my-reservation" : "reserved",
        reservation: assignmentAsReservation,
        assignedTo: activeAssignment.assigned_user?.full_name || "Unknown User",
      };
      return acc;
    }

    const activeReservation = reservations.find((reservation) => {
      if (reservation.cell_id !== cell.id) return false;
      if (reservation.status === "cancelled" || reservation.status === "rejected") return false;
      return includesDay(reservation.date_start, reservation.date_end, dayToCheck);
    });

    if (activeReservation) {
      acc[cell.id] = {
        status: activeReservation.user_id === currentUserId ? "my-reservation" : "reserved",
        reservation: activeReservation,
      };
      return acc;
    }

    acc[cell.id] = { status: "available" };
    return acc;
  }, {});
}
