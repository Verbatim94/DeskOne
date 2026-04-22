export interface ReservationRoomSummary {
  id: string;
  name: string;
}

export interface ReservationUserSummary {
  id: string;
  username: string;
  full_name: string;
}

export interface ReservationCellSummary {
  id: string;
  label: string | null;
  type: string;
  x?: number;
  y?: number;
}

export interface ReservationRecord {
  id: string;
  room_id: string;
  cell_id: string;
  user_id: string;
  room: ReservationRoomSummary;
  user: ReservationUserSummary;
  cell: ReservationCellSummary;
  type: string;
  status: string;
  date_start: string;
  date_end: string;
  time_segment: string;
  created_at: string;
}

export interface ReservationListRow {
  id: string;
  room_id: string;
  cell_id: string;
  user_id?: string;
  assigned_to?: string;
  type?: string;
  status?: string;
  date_start: string;
  date_end: string;
  time_segment?: string;
  created_at: string;
  rooms?: ReservationRoomSummary | null;
  users?: ReservationUserSummary | null;
  room_cells?: ReservationCellSummary | null;
}

export interface ReservationMutationResult {
  id: string;
  room_id: string;
  cell_id: string;
  user_id: string;
  date_start: string;
  date_end: string;
  status: string;
  type: string;
  time_segment?: string;
  created_at?: string;
}

export interface CreateReservationInput {
  room_id: string;
  cell_id: string;
  type: string;
  date_start: string;
  date_end: string;
  time_segment: string;
}
