import { Calendar } from '@/components/ui/calendar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useState } from 'react';

interface DashboardCalendarProps {
    bookedDates: Date[];
}

export function DashboardCalendar({ bookedDates }: DashboardCalendarProps) {
    const [date, setDate] = useState<Date | undefined>(new Date());

    return (
        <Card className="border-none shadow-sm">
            <CardHeader>
                <CardTitle>Calendar</CardTitle>
            </CardHeader>
            <CardContent>
                <Calendar
                    mode="single"
                    selected={date}
                    onSelect={setDate}
                    className="rounded-md border shadow-sm mx-auto"
                    modifiers={{
                        booked: bookedDates
                    }}
                    modifiersStyles={{
                        booked: {
                            fontWeight: 'bold',
                            backgroundColor: 'var(--primary)',
                            color: 'white',
                            borderRadius: '100%'
                        }
                    }}
                />
            </CardContent>
        </Card>
    );
}
