import { useCallback, useEffect, useRef, useState } from "react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { invokeReservationFunction } from "@/lib/edge-functions";
import { mapRoomDayState } from "../availability";
import type { FixedAssignment, RoomDayStateResponse, RoomReservation } from "../types";

interface UseRoomAvailabilityOptions {
  roomId?: string;
  selectedDate: Date;
}

export function useRoomAvailability({ roomId, selectedDate }: UseRoomAvailabilityOptions) {
  const [reservations, setReservations] = useState<RoomReservation[]>([]);
  const [fixedAssignments, setFixedAssignments] = useState<FixedAssignment[]>([]);
  const [availabilityError, setAvailabilityError] = useState<string | null>(null);
  const latestAvailabilityRequestRef = useRef(0);
  const selectedDateRef = useRef(selectedDate);

  useEffect(() => {
    selectedDateRef.current = selectedDate;
  }, [selectedDate]);

  const loadAvailabilityState = useCallback(async () => {
    if (!roomId) return;
    const requestId = ++latestAvailabilityRequestRef.current;

    try {
      const roomDayState = await invokeReservationFunction<RoomDayStateResponse, { roomId: string; date: string }>(
        "get_room_day_state",
        {
          roomId,
          date: format(selectedDateRef.current, "yyyy-MM-dd"),
        },
      );

      const { reservations: mappedReservations, fixedAssignments: mappedAssignments } = mapRoomDayState(roomDayState);

      if (requestId === latestAvailabilityRequestRef.current) {
        setReservations(mappedReservations);
        setFixedAssignments(mappedAssignments);
        setAvailabilityError(null);
      }
    } catch (error) {
      if (requestId === latestAvailabilityRequestRef.current) {
        console.error("Error loading room availability:", error);
        setAvailabilityError("Availability could not be synchronized. Showing the latest loaded state.");
      }
    }
  }, [roomId]);

  useEffect(() => {
    if (!roomId) return;
    loadAvailabilityState();
  }, [roomId, selectedDate, loadAvailabilityState]);

  useEffect(() => {
    if (!roomId) return;

    const channel = supabase
      .channel(`room-viewer-${roomId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "reservations",
          filter: `room_id=eq.${roomId}`,
        },
        () => {
          loadAvailabilityState();
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "fixed_assignments",
          filter: `room_id=eq.${roomId}`,
        },
        () => {
          loadAvailabilityState();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [roomId, loadAvailabilityState]);

  useEffect(() => {
    if (!roomId) return;

    const intervalId = window.setInterval(() => {
      loadAvailabilityState();
    }, 30000);

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        loadAvailabilityState();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [roomId, loadAvailabilityState]);

  return {
    reservations,
    setReservations,
    fixedAssignments,
    setFixedAssignments,
    availabilityError,
    loadAvailabilityState,
  };
}
