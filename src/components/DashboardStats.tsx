import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DollarSign, CalendarCheck, Eye } from 'lucide-react';

interface DashboardStatsProps {
    totalBookings: number;
    upcomingBookings: number;
    totalSpent: number;
}

export function DashboardStats({ totalBookings, upcomingBookings, totalSpent }: DashboardStatsProps) {
    return (
        <div className="grid gap-4 md:grid-cols-3">
            <Card className="bg-blue-50/50 border-none shadow-sm">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                        Total Bookings
                    </CardTitle>
                    <CalendarCheck className="h-4 w-4 text-blue-500" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">{totalBookings}</div>
                    <p className="text-xs text-muted-foreground">
                        Lifetime reservations
                    </p>
                </CardContent>
            </Card>

            <Card className="bg-orange-50/50 border-none shadow-sm">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                        Upcoming
                    </CardTitle>
                    <Eye className="h-4 w-4 text-orange-500" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">{upcomingBookings}</div>
                    <p className="text-xs text-muted-foreground">
                        Active reservations
                    </p>
                </CardContent>
            </Card>

            <Card className="bg-purple-50/50 border-none shadow-sm">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                        Total Value
                    </CardTitle>
                    <DollarSign className="h-4 w-4 text-purple-500" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">${totalSpent}</div>
                    <p className="text-xs text-muted-foreground">
                        Estimated value
                    </p>
                </CardContent>
            </Card>
        </div>
    );
}
