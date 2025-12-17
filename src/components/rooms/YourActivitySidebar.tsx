
import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Calendar, Armchair } from 'lucide-react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { format, isAfter, parseISO } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { authService } from '@/lib/auth';

interface Reservation {
    id: string;
    date_start: string;
    date_end: string;
    room_id: string;
    cell_id: string;
    rooms: { name: string };
    room_cells: { label: string };
    status: string;
}

interface ActivityStats {
    roomUsage: { name: string; value: number }[];
    favoriteDesk: { roomId: string; roomName: string; cellLabel: string; count: number } | null;
    upcomingReservation: Reservation | null;
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8'];

export function YourActivitySidebar() {
    const [stats, setStats] = useState<ActivityStats>({
        roomUsage: [],
        favoriteDesk: null,
        upcomingReservation: null
    });
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();

    useEffect(() => {
        loadActivity();
    }, []);

    const loadActivity = async () => {
        setLoading(true);
        try {
            const session = authService.getSession();
            if (!session) return;

            const { data: reservations, error } = await supabase.functions.invoke('manage-reservations', {
                body: { operation: 'list_my_reservations' },
                headers: { 'x-session-token': session.token }
            });

            if (error) throw error;
            if (reservations) {
                processStats(reservations);
            }
        } catch (error) {
            console.error('Error loading activity:', error);
        }
        setLoading(false);
    };

    const processStats = (reservations: Reservation[]) => {
        const now = new Date();

        // 1. Upcoming Reservation
        // Filter for approved reservations in the future
        // Since the prompt asks for "upcoming reservation", we find the one closest to now but in the future
        // Note: list_my_reservations returns sorted by date_start desc, so we need to reverse or find effectively
        const upcoming = reservations
            .filter(r => r.status === 'approved' && isAfter(parseISO(r.date_start), now))
            .sort((a, b) => new Date(a.date_start).getTime() - new Date(b.date_start).getTime())[0];

        // 2. Room Usage (Donut Chart)
        const roomCounts: Record<string, number> = {};
        reservations.forEach(r => {
            // Count all approved reservations (past and future) for usage stats
            if (r.status === 'approved') {
                const roomName = r.rooms?.name || 'Unknown Room'; // Handle potential missing join
                roomCounts[roomName] = (roomCounts[roomName] || 0) + 1;
            }
        });

        const totalReservations = Object.values(roomCounts).reduce((a, b) => a + b, 0);
        const roomUsage = Object.entries(roomCounts).map(([name, count]) => ({
            name,
            value: totalReservations > 0 ? Math.round((count / totalReservations) * 100) : 0
        }));

        // 3. Favorite Desk
        const deskCounts: Record<string, { count: number, roomId: string, roomName: string, cellLabel: string }> = {};
        reservations.forEach(r => {
            if (r.status === 'approved' && r.cell_id) {
                const key = r.cell_id;
                if (!deskCounts[key]) {
                    deskCounts[key] = {
                        count: 0,
                        roomId: r.room_id,
                        roomName: r.rooms?.name || 'Unknown',
                        cellLabel: r.room_cells?.label || 'Desk'
                    };
                }
                deskCounts[key].count++;
            }
        });

        let favoriteDesk = null;
        let maxCount = 0;
        Object.values(deskCounts).forEach(desk => {
            if (desk.count > maxCount) {
                maxCount = desk.count;
                favoriteDesk = desk;
            }
        });

        setStats({
            roomUsage,
            favoriteDesk,
            upcomingReservation: upcoming || null
        });
    };

    if (loading) {
        return <div className="p-4 text-center text-muted-foreground">Loading activity...</div>;
    }

    return (
        <div className="space-y-6">
            <h2 className="text-xl font-bold tracking-tight">Your Activity</h2>

            {/* Donut Chart */}
            <Card>
                <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Room Usage</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="h-[200px] w-full">
                        {stats.roomUsage.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={stats.roomUsage}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={60}
                                        outerRadius={80}
                                        paddingAngle={5}
                                        dataKey="value"
                                    >
                                        {stats.roomUsage.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                        ))}
                                    </Pie>
                                    <Tooltip />
                                </PieChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
                                No history yet
                            </div>
                        )}
                    </div>
                </CardContent>
            </Card>

            {/* Favorite Desk */}
            {stats.favoriteDesk && (
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">Favorite Desk</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex items-center space-x-4">
                            <div className="p-2 bg-primary/10 rounded-full">
                                <Armchair className="h-6 w-6 text-primary" />
                            </div>
                            <div>
                                <p className="font-medium text-sm">{stats.favoriteDesk.roomName}</p>
                                <p className="text-muted-foreground text-xs">{stats.favoriteDesk.cellLabel}</p>
                            </div>
                        </div>
                        <Button
                            variant="outline"
                            className="w-full text-xs"
                            onClick={() => navigate(`/rooms/${stats.favoriteDesk!.roomId}/view`)}
                        >
                            Book Again
                        </Button>
                    </CardContent>
                </Card>
            )}

            {/* Upcoming Reservation */}
            <Card>
                <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Upcoming Reservation</CardTitle>
                </CardHeader>
                <CardContent>
                    {stats.upcomingReservation ? (
                        <div className="space-y-3">
                            <div className="flex items-center space-x-3">
                                <Calendar className="h-4 w-4 text-muted-foreground" />
                                <div className="text-sm">
                                    <p className="font-medium">
                                        {format(parseISO(stats.upcomingReservation.date_start), 'PPP')}
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                        {format(parseISO(stats.upcomingReservation.date_start), 'p')} - {format(parseISO(stats.upcomingReservation.date_end), 'p')}
                                    </p>
                                </div>
                            </div>
                            <div className="text-xs text-muted-foreground pl-7">
                                {stats.upcomingReservation.rooms?.name} • {stats.upcomingReservation.room_cells?.label}
                            </div>
                        </div>
                    ) : (
                        <div className="text-sm text-muted-foreground py-2">
                            No upcoming reservations
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
