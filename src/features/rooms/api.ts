import { invokeRoomFunction } from "@/lib/edge-functions";
import type {
  DeskType,
  RoomAccessEntry,
  RoomCell,
  RoomLayoutDetails,
  RoomSummary,
  RoomUserSummary,
  RoomWall,
} from "./types";

export interface RoomFormPayload {
  name: string;
  description: string | null;
  grid_width: number;
  grid_height: number;
}

export function listRooms(): Promise<RoomSummary[]> {
  return invokeRoomFunction<RoomSummary[]>("list");
}

export function getRoomLayout(roomId: string): Promise<RoomLayoutDetails> {
  return invokeRoomFunction<RoomLayoutDetails, { roomId: string }>("get", { roomId });
}

export function createRoom(payload: RoomFormPayload): Promise<RoomSummary> {
  return invokeRoomFunction<RoomSummary, RoomFormPayload>("create", payload);
}

export function updateRoom(id: string, updates: RoomFormPayload): Promise<RoomSummary> {
  return invokeRoomFunction<RoomSummary, { id: string; updates: RoomFormPayload }>("update", { id, updates });
}

export function deleteRoom(id: string): Promise<unknown> {
  return invokeRoomFunction("delete", { id });
}

export function listRoomUsers(roomId: string): Promise<RoomAccessEntry[]> {
  return invokeRoomFunction<RoomAccessEntry[], { roomId: string }>("list_room_users", { roomId });
}

export function listAvailableRoomUsers(roomId: string): Promise<RoomUserSummary[]> {
  return invokeRoomFunction<RoomUserSummary[], { roomId: string }>("list_available_users", { roomId });
}

export function addRoomUser(roomId: string, userId: string, role: "admin" | "member"): Promise<unknown> {
  return invokeRoomFunction("add_room_user", { roomId, userId, role });
}

export function removeRoomUser(roomId: string, accessId: string): Promise<unknown> {
  return invokeRoomFunction("remove_room_user", { roomId, accessId });
}

export function createRoomCell(roomId: string, x: number, y: number, type: DeskType): Promise<RoomCell> {
  return invokeRoomFunction<RoomCell, { cell: { room_id: string; x: number; y: number; type: DeskType } }>("create_cell", {
    cell: { room_id: roomId, x, y, type },
  });
}

export function updateRoomCell(cellId: string, updates: Partial<Pick<RoomCell, "x" | "y" | "label">>): Promise<RoomCell> {
  return invokeRoomFunction<RoomCell, { cellId: string; updates: Partial<Pick<RoomCell, "x" | "y" | "label">> }>("update_cell", {
    cellId,
    updates,
  });
}

export function deleteRoomCell(cellId: string): Promise<unknown> {
  return invokeRoomFunction("delete_cell", { cellId });
}

export function deleteAllRoomCells(roomId: string): Promise<unknown> {
  return invokeRoomFunction("delete_all_cells", { roomId });
}

export function createRoomWall(wall: Omit<RoomWall, "id">): Promise<RoomWall> {
  return invokeRoomFunction<RoomWall, { wall: Omit<RoomWall, "id"> }>("create_wall", { wall });
}

export function deleteRoomWall(wallId: string): Promise<unknown> {
  return invokeRoomFunction("delete_wall", { wallId });
}
