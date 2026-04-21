export interface DeskStructure {
  id: string;
  label: string;
  room_id: string;
}

export interface RoomStructure {
  id: string;
  name: string;
  desks: DeskStructure[];
}

export interface RawOccupancyRow {
  reservation_id: string;
  source_type: 'reservation' | 'fixed_assignment';
  room_id: string;
  room_name: string;
  desk_id: string;
  desk_label: string;
  user_id: string;
  user_full_name: string;
  username: string;
  status: string;
  reservation_type: string;
  time_segment: string;
  date_start: string;
  date_end: string;
  month: string;
  year: number;
  created_at: string;
  approved_at: string | null;
  approved_by: string | null;
  approved_by_name: string | null;
}

export interface DailyOccupancyRow extends RawOccupancyRow {
  occupancy_date: string;
  weekday_index: number;
  weekday_name: string;
  is_weekend: boolean;
}

export interface RoomAccessEntry {
  room_id: string;
  user_id: string;
}

export interface InsightPayload {
  rooms: RoomStructure[];
  rows: RawOccupancyRow[];
  roomAccess: RoomAccessEntry[];
  generatedAt: string;
}

export interface RangeBucket {
  value: string;
  startValue: string;
  endValue: string;
}
