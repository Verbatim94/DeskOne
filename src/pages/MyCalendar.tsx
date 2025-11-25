import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Calendar as CalendarIcon } from 'lucide-react';

export default function MyCalendar() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">My Calendar</h1>
        <p className="text-muted-foreground">View your desk bookings</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarIcon className="h-5 w-5" />
            Upcoming Bookings
          </CardTitle>
          <CardDescription>Your scheduled desk reservations</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-12 text-muted-foreground">
            <CalendarIcon className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No bookings scheduled</p>
            <p className="text-sm mt-2">Book a desk to see it appear here</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
