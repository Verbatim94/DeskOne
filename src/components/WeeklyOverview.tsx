import { format, startOfWeek, addDays, addWeeks } from 'date-fns';
import { Check, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { Button } from '@/components/ui/button';

interface WeeklyOverviewProps {
  bookedDates: string[]; // Array of ISO date strings
}

export function WeeklyOverview({ bookedDates }: WeeklyOverviewProps) {
  const navigate = useNavigate();
  const today = new Date();
  const [weekOffset, setWeekOffset] = useState(0);
  
  const weekStart = startOfWeek(addWeeks(today, weekOffset), { weekStartsOn: 1 }); // Monday

  const days = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(weekStart, i);
    const dateStr = format(date, 'yyyy-MM-dd');
    const isBooked = bookedDates.includes(dateStr);
    const isToday = format(date, 'yyyy-MM-dd') === format(today, 'yyyy-MM-dd');
    
    return {
      date,
      dateStr,
      dayLabel: format(date, 'EEE'),
      isBooked,
      isToday,
    };
  });

  const handleDayClick = (dateStr: string) => {
    navigate(`/rooms`);
  };

  const weekTitle = weekOffset === 0 
    ? 'This week' 
    : weekOffset === 1 
    ? 'Next week' 
    : weekOffset === -1
    ? 'Last week'
    : format(weekStart, 'MMM d, yyyy');

  return (
    <div className="space-y-4">
      {/* Header with navigation */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-muted-foreground">{weekTitle}</h3>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setWeekOffset(weekOffset - 1)}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setWeekOffset(0)}
            disabled={weekOffset === 0}
          >
            <span className="text-xs">•</span>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setWeekOffset(weekOffset + 1)}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Day pills grid */}
      <div className="grid grid-cols-7 gap-2">
        {days.map((day) => (
          <button
            key={day.dateStr}
            onClick={() => handleDayClick(day.dateStr)}
            className={cn(
              "relative flex flex-col items-center gap-1 p-2 rounded-lg transition-all hover:scale-105",
              day.isBooked
                ? "bg-primary text-primary-foreground shadow-md hover:shadow-lg"
                : "border-2 border-border text-muted-foreground hover:border-primary/50 hover:bg-accent/50",
              day.isToday && "ring-2 ring-primary ring-offset-2 ring-offset-background"
            )}
          >
            <span className="text-[10px] font-medium uppercase opacity-80">
              {day.dayLabel}
            </span>
            <span className="text-xs font-semibold">
              {format(day.date, 'd')}
            </span>
          </button>
        ))}
      </div>

      {/* Improved legend */}
      <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground pt-2 border-t">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded bg-primary"></div>
          <span>Booked</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded border-2 border-border"></div>
          <span>Available</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded border-2 border-primary ring-2 ring-primary ring-offset-1 ring-offset-background"></div>
          <span>Today</span>
        </div>
      </div>
    </div>
  );
}
