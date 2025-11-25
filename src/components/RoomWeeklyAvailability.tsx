import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { authService } from '@/lib/auth';
import { format, startOfWeek, addDays } from 'date-fns';
import { cn } from '@/lib/utils';

interface RoomWeeklyAvailabilityProps {
  roomId: string;
  totalDesks: number;
}

export function RoomWeeklyAvailability({ roomId, totalDesks }: RoomWeeklyAvailabilityProps) {
  const today = new Date();
  const weekStart = startOfWeek(today, { weekStartsOn: 1 });

  const { data: weeklyOccupancy = {}, isLoading } = useQuery({
    queryKey: ['room-weekly-occupancy', roomId],
    queryFn: async () => {
      const session = authService.getSession();
      if (!session || totalDesks === 0) {
        console.log('No session or no desks for room', roomId);
        return {};
      }

      const days = Array.from({ length: 7 }, (_, i) => {
        const date = addDays(weekStart, i);
        return format(date, 'yyyy-MM-dd');
      });

      console.log('Fetching weekly occupancy for room:', roomId);

      const response = await supabase.functions.invoke('manage-reservations', {
        body: {
          operation: 'list_room_reservations',
          data: { roomId }
        },
        headers: {
          'x-session-token': session.token,
        },
      });

      if (response.error) {
        console.error('Error fetching room reservations:', response.error);
        return {};
      }

      const reservations = response.data || [];
      console.log('Reservations for room', roomId, ':', reservations.length);
      
      const occupancyMap: Record<string, number> = {};

      days.forEach(day => {
        const bookedCount = reservations.filter((r: any) => 
          r.status === 'approved' &&
          r.date_start <= day &&
          r.date_end >= day
        ).length;
        
        occupancyMap[day] = bookedCount;
      });

      console.log('Occupancy map:', occupancyMap);
      return occupancyMap;
    },
  });

  if (isLoading) {
    return (
      <div className="flex gap-1 justify-between">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="flex flex-col items-center justify-center rounded px-2 py-1.5 text-xs flex-1 bg-muted/30 animate-pulse h-12" />
        ))}
      </div>
    );
  }

  const days = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(weekStart, i);
    const dateStr = format(date, 'yyyy-MM-dd');
    const bookedDesks = weeklyOccupancy[dateStr] || 0;
    const availableDesks = Math.max(0, totalDesks - bookedDesks);
    const availabilityPercentage = totalDesks > 0 ? Math.round((availableDesks / totalDesks) * 100) : 0;
    const isToday = format(date, 'yyyy-MM-dd') === format(today, 'yyyy-MM-dd');

    return {
      date,
      dateStr,
      dayLabel: format(date, 'EEE'),
      availabilityPercentage,
      isToday,
    };
  });

  return (
    <div className="flex gap-1 justify-between">
      {days.map((day) => (
        <div
          key={day.dateStr}
          className={cn(
            "flex flex-col items-center justify-center rounded px-2 py-1.5 text-xs flex-1",
            day.isToday ? "bg-primary/10 border border-primary/20" : "bg-muted/30"
          )}
        >
          <span className="font-medium text-[10px] text-muted-foreground mb-0.5">
            {day.dayLabel}
          </span>
          <span className={cn(
            "font-bold text-sm",
            day.availabilityPercentage > 50 ? "text-green-600 dark:text-green-400" :
            day.availabilityPercentage > 20 ? "text-orange-600 dark:text-orange-400" :
            "text-red-600 dark:text-red-400"
          )}>
            {day.availabilityPercentage}%
          </span>
        </div>
      ))}
    </div>
  );
}
