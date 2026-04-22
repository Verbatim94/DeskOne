import { useCallback, useEffect, useState } from "react";
import { listRooms } from "../api";
import type { RoomSummary } from "../types";

interface UseRoomsListOptions {
  onError?: (error: unknown) => void;
  autoload?: boolean;
}

export function useRoomsList(options: UseRoomsListOptions = {}) {
  const { onError, autoload = true } = options;
  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [loading, setLoading] = useState(autoload);

  const loadRooms = useCallback(async () => {
    setLoading(true);
    try {
      const result = await listRooms();
      setRooms(result || []);
      return result || [];
    } catch (error) {
      onError?.(error);
      return [];
    } finally {
      setLoading(false);
    }
  }, [onError]);

  useEffect(() => {
    if (!autoload) return;
    loadRooms();
  }, [autoload, loadRooms]);

  return {
    rooms,
    setRooms,
    loading,
    loadRooms,
  };
}
