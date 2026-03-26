import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Percent, CalendarCheck, Eye } from 'lucide-react';

interface DashboardStatsProps {
    totalBookings: number;
    upcomingBookings: number;
    availabilityPercentage: number;
}

export function DashboardStats({ totalBookings, upcomingBookings, availabilityPercentage }: DashboardStatsProps) {
    const stats = [
        {
            title: 'Total Bookings',
            value: totalBookings,
            description: 'Confirmed and pending reservations',
            icon: CalendarCheck,
            accent: 'text-sky-700',
            iconBg: 'bg-sky-100 text-sky-700',
            cardBg: 'bg-gradient-to-br from-sky-50 via-white to-sky-100/70',
            border: 'border-sky-100',
        },
        {
            title: 'Upcoming',
            value: upcomingBookings,
            description: 'Reservations still ahead of today',
            icon: Eye,
            accent: 'text-amber-700',
            iconBg: 'bg-amber-100 text-amber-700',
            cardBg: 'bg-gradient-to-br from-amber-50 via-white to-amber-100/70',
            border: 'border-amber-100',
        },
        {
            title: 'Availability Today',
            value: `${availabilityPercentage}%`,
            description: 'Free desks across your visible rooms',
            icon: Percent,
            accent: 'text-emerald-700',
            iconBg: 'bg-emerald-100 text-emerald-700',
            cardBg: 'bg-gradient-to-br from-emerald-50 via-white to-emerald-100/70',
            border: 'border-emerald-100',
        },
    ];

    return (
        <div className="grid gap-4 md:grid-cols-3">
            {stats.map((stat) => {
                const Icon = stat.icon;

                return (
                    <Card key={stat.title} className={`${stat.cardBg} ${stat.border} shadow-sm`}>
                        <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-3">
                            <div>
                                <CardTitle className="text-sm font-medium text-muted-foreground">
                                    {stat.title}
                                </CardTitle>
                                <div className={`mt-3 text-3xl font-semibold tracking-tight ${stat.accent}`}>
                                    {stat.value}
                                </div>
                            </div>
                            <div className={`rounded-2xl p-3 ${stat.iconBg}`}>
                                <Icon className="h-5 w-5" />
                            </div>
                        </CardHeader>
                        <CardContent className="pt-0">
                            <p className="text-xs text-muted-foreground">
                                {stat.description}
                            </p>
                        </CardContent>
                    </Card>
                );
            })}
        </div>
    );
}
