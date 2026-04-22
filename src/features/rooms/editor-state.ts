import type { DeskType, RoomCell, RoomWall } from "./types";

interface WallSegment {
  start_row: number;
  start_col: number;
  end_row: number;
  end_col: number;
  orientation: "horizontal" | "vertical";
}

interface BuildTempWallOptions extends WallSegment {
  roomId: string;
  tempId: string;
  type: "wall" | "entrance";
}

export function findRoomCell(cells: RoomCell[], x: number, y: number): RoomCell | undefined {
  return cells.find((cell) => cell.x === x && cell.y === y);
}

export function insertRoomCell(cells: RoomCell[], newCell: RoomCell): RoomCell[] {
  return [...cells, newCell];
}

export function moveRoomCell(cells: RoomCell[], cellId: string, x: number, y: number): RoomCell[] {
  return cells.map((cell) => (cell.id === cellId ? { ...cell, x, y } : cell));
}

export function replaceRoomCell(cells: RoomCell[], updatedCell: RoomCell): RoomCell[] {
  return cells.map((cell) => (cell.id === updatedCell.id ? updatedCell : cell));
}

export function removeRoomCell(cells: RoomCell[], cellId: string): RoomCell[] {
  return cells.filter((cell) => cell.id !== cellId);
}

export function sortDeskCells(cells: RoomCell[]): RoomCell[] {
  return [...cells]
    .filter((cell) => cell.type === "desk")
    .sort((a, b) => {
      const aLabel = a.label || `${a.x}-${a.y}`;
      const bLabel = b.label || `${b.x}-${b.y}`;
      return aLabel.localeCompare(bLabel);
    });
}

export function findMatchingWall(walls: RoomWall[], segment: WallSegment): RoomWall | undefined {
  return walls.find(
    (wall) =>
      wall.start_row === segment.start_row &&
      wall.start_col === segment.start_col &&
      wall.end_row === segment.end_row &&
      wall.end_col === segment.end_col,
  );
}

export function buildTempWall({
  roomId,
  tempId,
  type,
  ...segment
}: BuildTempWallOptions): RoomWall {
  return {
    id: tempId,
    room_id: roomId,
    type,
    ...segment,
  };
}

export function applyOptimisticWallState(
  walls: RoomWall[],
  existingWall: RoomWall | undefined,
  nextWallType: "wall" | "entrance",
  tempWall: RoomWall,
): RoomWall[] {
  if (existingWall) {
    if (existingWall.type === nextWallType) {
      return walls.filter((wall) => wall.id !== existingWall.id);
    }

    return walls.map((wall) => (wall.id === existingWall.id ? { ...wall, type: nextWallType } : wall));
  }

  return [...walls, tempWall];
}

export function replaceWallById(walls: RoomWall[], wallId: string, nextWall: RoomWall): RoomWall[] {
  return walls.map((wall) => (wall.id === wallId ? nextWall : wall));
}
