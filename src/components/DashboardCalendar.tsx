import { Calendar } from '@/components/ui/calendar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useState } from 'react';

interface DashboardCalendarProps {
    bookedDates: Date[];
    availableDates?: Date[];
    unavailableDates?: Date[];
}

export function DashboardCalendar({ bookedDates, availableDates = [], unavailableDates = [] }: DashboardCalendarProps) {
    const [date, setDate] = useState<Date | undefined>(new Date());

    return (
        <Card className="border-none shadow-sm">
            <CardHeader>
                <CardTitle>Calendar</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col items-center">
                <Calendar
                    mode="single"
                    selected={date}
                    onSelect={setDate}
                    className="rounded-md border shadow-sm"
                    modifiers={{
                        hasReservation: bookedDates,
                        hasAvailability: availableDates,
                        noAvailability: unavailableDates
                    }}
                    modifiersClassNames={{
                        hasReservation: 'has-reservation',
                        hasAvailability: 'has-availability',
                        noAvailability: 'no-availability'
                    }}
                />

                {/* Legend */}
                <div className="mt-4 w-full flex items-center justify-center gap-4 text-xs">
                    <div className="flex items-center gap-1.5">
                        <div className="w-3 h-3 rounded-full bg-purple-500"></div>
                        <span className="text-muted-foreground">Reserved</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <div className="w-3 h-3 rounded-full bg-green-500"></div>
                        <span className="text-muted-foreground">Available</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <div className="w-3 h-3 rounded-full bg-red-500"></div>
                        <span className="text-muted-foreground">Not available</span>
                    </div>
                </div>

                <style>{`
                    .has-reservation {
                        position: relative;
                        font-weight: 600;
                    }
                    .has-reservation::before {
                        content: '';
                        position: absolute;
                        bottom: 2px;
                        left: 50%;
                        transform: translateX(-50%);
                        width: 6px;
                        height: 6px;
                        border-radius: 50%;
                        background-color: #a855f7;
                    }
                    .has-availability {
                        position: relative;
                        font-weight: 500;
                    }
                    .has-availability::before {
                        content: '';
                        position: absolute;
                        bottom: 2px;
                        left: 50%;
                        transform: translateX(-50%);
                        width: 6px;
                        height: 6px;
                        border-radius: 50%;
                        background-color: #10b981;
                    }
                    .no-availability {
                        position: relative;
                        font-weight: 500;
                    }
                    .no-availability::before {
                        content: '';
                        position: absolute;
                        bottom: 2px;
                        left: 50%;
                        transform: translateX(-50%);
                        width: 6px;
                        height: 6px;
                        border-radius: 50%;
                        background-color: #ef4444;
                    }
                    /* Today styling with red text */
                    .rdp-day_today {
                        color: #ef4444 !important;
                        font-weight: 700;
                    }
                `}</style>
            </CardContent>
        </Card>
    );
}
