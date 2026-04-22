export type DeskType = "desk";

export interface RoomUserSummary {
  id: string;
  username: string;
  full_name: string;
}

export interface RoomCell {
  id: string;
  x: number;
  y: number;
  type: DeskType;
  label: string | null;
}

export interface RoomSummary {
  id: string;
  name: string;
  description: string | null;
  grid_width: number;
  grid_height: number;
  created_at: string;
  created_by: string;
}

export interface RoomLayoutDetails {
  room: RoomSummary;
  cells: RoomCell[];
  walls: RoomWall[];
}

export interface RoomWall {
  id: string;
  room_id: string;
  start_row: number;
  start_col: number;
  end_row: number;
  end_col: number;
  orientation: "horizontal" | "vertical";
  type: "wall" | "entrance";
}

export interface RoomReservation {
  id: string;
  cell_id: string;
  user_id: string;
  status: string;
  date_start: string;
  date_end: string;
  time_segment: string;
  user: RoomUserSummary;
  type: string;
  room?: { id: string; name: string };
  cell?: { id: string; label: string | null; type: string; x?: number; y?: number };
  created_at: string;
}

export interface FixedAssignment {
  id: string;
  cell_id: string;
  assigned_to: string;
  date_start: string;
  date_end: string;
  assigned_user: RoomUserSummary | null;
  created_at?: string;
}

export interface RoomDayStateReservationRow {
  id: string;
  cell_id: string;
  user_id: string;
  status: string;
  date_start: string;
  date_end: string;
  time_segment: string;
  created_at: string;
  users: RoomUserSummary;
}

export interface RoomDayStateAssignmentRow {
  id: string;
  cell_id: string;
  assigned_to: string;
  date_start: string;
  date_end: string;
  created_at?: string;
  assigned_user: RoomUserSummary | null;
}

export interface RoomDayStateResponse {
  reservations?: RoomDayStateReservationRow[];
  fixed_assignments?: RoomDayStateAssignmentRow[];
}

export interface RoomAccessEntry {
  id: string;
  role: "admin" | "member";
  user_id: string;
  users: RoomUserSummary & {
    is_active?: boolean;
  };
}
