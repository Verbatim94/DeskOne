import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { authService } from '@/lib/auth';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

interface TodayOccupancyProps {
  roomId: string;
  totalDesks: number;
}

export function TodayOccupancy({ roomId, totalDesks }: TodayOccupancyProps) {
  const today = format(new Date(), 'yyyy-MM-dd');

  const { data: occupancy, isLoading } = useQuery({
    queryKey: ['room-today-occupancy', roomId, today],
    queryFn: async () => {
      const session = authService.getSession();
      if (!session || totalDesks === 0) {
        return { booked: 0, available: totalDesks, percentage: 100 };
      }

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
        console.error('Error fetching today occupancy:', response.error);
        return { booked: 0, available: totalDesks, percentage: 100 };
      }

      const reservations = response.data || [];
      const bookedCount = reservations.filter((r: any) => 
        r.status === 'approved' &&
        r.date_start <= today &&
        r.date_end >= today
      ).length;

      const available = Math.max(0, totalDesks - bookedCount);
      const percentage = totalDesks > 0 ? Math.round((available / totalDesks) * 100) : 0;

      return { booked: bookedCount, available, percentage };
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2">
        <div className="h-4 w-16 bg-muted animate-pulse rounded" />
      </div>
    );
  }

  const { booked = 0, available = totalDesks, percentage = 100 } = occupancy || {};

  return (
    <div className="flex items-center gap-2">
      <div className={cn(
        "text-sm font-semibold",
        percentage > 50 ? "text-green-600 dark:text-green-400" :
        percentage > 20 ? "text-orange-600 dark:text-orange-400" :
        "text-red-600 dark:text-red-400"
      )}>
        {percentage}% available today
      </div>
      <span className="text-xs text-muted-foreground">
        ({available}/{totalDesks} free)
      </span>
    </div>
  );
}
