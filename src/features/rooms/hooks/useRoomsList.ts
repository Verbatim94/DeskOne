import { useCallback, useEffect, useRef, useState } from "react";
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
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  const loadRooms = useCallback(async () => {
    setLoading(true);
    try {
      const result = await listRooms();
      setRooms(result || []);
      return result || [];
    } catch (error) {
      onErrorRef.current?.(error);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

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
