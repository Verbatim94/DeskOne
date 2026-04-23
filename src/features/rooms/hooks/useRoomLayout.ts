import { useCallback, useEffect, useRef, useState } from "react";
import { getRoomLayout } from "../api";
import { isUserRoomAdmin } from "../access";
import type { RoomCell, RoomSummary, RoomWall } from "../types";

interface RoomAccessUser {
  id: string;
  role: string;
}

interface UseRoomLayoutOptions {
  roomId?: string;
  user?: RoomAccessUser | null;
  requireAdmin?: boolean;
  onUnauthorized?: () => void;
  onError?: (error: unknown) => void;
}

export function useRoomLayout({
  roomId,
  user,
  requireAdmin = false,
  onUnauthorized,
  onError,
}: UseRoomLayoutOptions) {
  const [room, setRoom] = useState<RoomSummary | null>(null);
  const [cells, setCells] = useState<RoomCell[]>([]);
  const [walls, setWalls] = useState<RoomWall[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRoomAdmin, setIsRoomAdmin] = useState(false);
  const onUnauthorizedRef = useRef(onUnauthorized);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onUnauthorizedRef.current = onUnauthorized;
  }, [onUnauthorized]);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  const loadRoom = useCallback(async () => {
    if (!roomId) return;

    setLoading(true);
    try {
      const result = await getRoomLayout(roomId);
      setRoom(result.room);
      setCells(result.cells || []);
      setWalls(result.walls || []);

      const canManageRoom = await isUserRoomAdmin(roomId, user);
      setIsRoomAdmin(canManageRoom);

      if (requireAdmin && !canManageRoom) {
        onUnauthorizedRef.current?.();
      }
    } catch (error) {
      onErrorRef.current?.(error);
    } finally {
      setLoading(false);
    }
  }, [roomId, user, requireAdmin]);

  useEffect(() => {
    loadRoom();
  }, [loadRoom]);

  return {
    room,
    setRoom,
    cells,
    setCells,
    walls,
    setWalls,
    loading,
    isRoomAdmin,
    loadRoom,
  };
}
