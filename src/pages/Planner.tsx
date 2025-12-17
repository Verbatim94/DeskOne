import { useState, useEffect } from 'react';
import { format, addMonths, subMonths, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay } from 'date-fns';
import { ChevronLeft, ChevronRight, Loader2, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { authService } from '@/lib/auth';
import { useToast } from '@/hooks/use-toast';
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '@/components/ui/tooltip';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';

interface Desk {
    id: string;
    label: string;
    room_id: string;
}

interface RoomWithDesks {
    id: string;
    name: string;
    desks: Desk[];
}

interface Reservation {
    id: string;
    date_start: string;
    date_end: string;
    status: string;
    room_id: string;
    cell_id: string;
    users: {
        full_name: string;
    };
    rooms: {
        name: string;
    };
    room_cells: {
        label: string;
    };
}

export default function Planner() {
    const [date, setDate] = useState(new Date());
    const [rooms, setRooms] = useState<RoomWithDesks[]>([]);
    const [reservations, setReservations] = useState<Reservation[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedReservation, setSelectedReservation] = useState<Reservation | null>(null);
    const { toast } = useToast();

    useEffect(() => {
        loadData();
    }, [date]);

    const loadData = async () => {
        setLoading(true);
        try {
            const session = authService.getSession();
            if (!session) throw new Error('No session');

            // 1. Fetch Structure (Rooms + Desks)
            // Ideally we'd cache this if it doesn't change often, but for now fetch every time or rely on a separate effect
            // Actually, let's fetch structure once or if date changes (structure rarely changes but keeping it simple)
            const roomsResponse = await supabase.functions.invoke('manage-rooms', {
                body: { operation: 'list_all_desks' },
                headers: { 'x-session-token': session.token }
            });
            if (roomsResponse.error) throw roomsResponse.error;
            setRooms(roomsResponse.data || []);

            // 2. Fetch Reservations for the month
            const start = format(startOfMonth(date), 'yyyy-MM-dd');
            const end = format(endOfMonth(date), 'yyyy-MM-dd');

            const resResponse = await supabase.functions.invoke('manage-reservations', {
                body: {
                    operation: 'list_all_reservations',
                    data: { date_start: start, date_end: end }
                },
                headers: { 'x-session-token': session.token }
            });

            if (resResponse.error) throw resResponse.error;
            setReservations(resResponse.data || []);

        } catch (error: any) {
            console.error(error);
            toast({
                title: 'Error loading planner',
                description: error.message || 'Failed to load data',
                variant: 'destructive'
            });
        }
        setLoading(false);
    };

    const daysInMonth = eachDayOfInterval({
        start: startOfMonth(date),
        end: endOfMonth(date)
    });

    const getReservation = (deskId: string, day: Date) => {
        return reservations.find(r =>
            r.cell_id === deskId &&
            r.date_start <= format(day, 'yyyy-MM-dd') &&
            r.date_end >= format(day, 'yyyy-MM-dd')
        );
    };

    return (
        <div className="h-full flex flex-col space-y-4 overflow-hidden">
            <div className="flex items-center justify-between flex-shrink-0">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Access Planner</h1>
                    <p className="text-muted-foreground text-sm">Overview of all desk reservations</p>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="icon" onClick={() => setDate(subMonths(date, 1))}>
                        <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <div className="font-semibold min-w-[140px] text-center">
                        {format(date, 'MMMM yyyy')}
                    </div>
                    <Button variant="outline" size="icon" onClick={() => setDate(addMonths(date, 1))}>
                        <ChevronRight className="h-4 w-4" />
                    </Button>
                </div>
            </div>

            <Card className="flex-1 min-h-0 overflow-hidden">
                <CardContent className="p-0 h-full overflow-auto">
                    {loading ? (
                        <div className="flex items-center justify-center h-full">
                            <Loader2 className="h-8 w-8 animate-spin text-primary" />
                        </div>
                    ) : (
                        <div className="relative min-w-[max-content]">
                            {/* Header Row */}
                            <div className="flex sticky top-0 z-20 bg-card border-b">
                                <div className="sticky left-0 z-30 w-64 bg-card border-r p-4 font-semibold text-sm flex items-center shadow-[1px_0_0_0_#e5e7eb]">
                                    Room / Desk
                                </div>
                                {daysInMonth.map(day => (
                                    <div key={day.toString()} className="w-12 flex-shrink-0 border-r p-2 text-center text-xs">
                                        <div className="font-medium">{format(day, 'd')}</div>
                                        <div className="text-muted-foreground">{format(day, 'EEEEE')}</div>
                                    </div>
                                ))}
                            </div>

                            {/* Body */}
                            <div className="divide-y">
                                {rooms.map(room => (
                                    <div key={room.id}>
                                        {/* Room Header Row (Optional, maybe just group desks) */}
                                        <div className="bg-muted/30 sticky left-0 z-10">
                                            <div className="p-2 px-4 font-semibold text-xs text-muted-foreground bg-muted/30 w-[max-content]">
                                                {room.name}
                                            </div>
                                        </div>

                                        {room.desks.map(desk => (
                                            <div key={desk.id} className="flex hover:bg-muted/5">
                                                <div className="sticky left-0 z-10 w-64 bg-card border-r p-3 text-sm flex items-center font-medium shadow-[1px_0_0_0_#e5e7eb]">
                                                    {desk.label}
                                                </div>
                                                {daysInMonth.map(day => {
                                                    const res = getReservation(desk.id, day);
                                                    return (
                                                        <div
                                                            key={day.toString()}
                                                            className="w-12 flex-shrink-0 border-r p-0.5 text-center relative group"
                                                        >
                                                            {res ? (
                                                                <TooltipProvider>
                                                                    <Tooltip>
                                                                        <TooltipTrigger asChild>
                                                                            <button
                                                                                className="w-full h-full bg-blue-100 hover:bg-blue-200 text-blue-700 text-[10px] rounded flex items-center justify-center font-medium truncate px-0.5 cursor-pointer transition-colors"
                                                                                onClick={() => setSelectedReservation(res)}
                                                                            >
                                                                                {res.users.full_name.split(' ')[0]}
                                                                            </button>
                                                                        </TooltipTrigger>
                                                                        <TooltipContent side="top">
                                                                            <p className="font-semibold">{res.users.full_name}</p>
                                                                            <p className="text-xs text-muted-foreground">
                                                                                {format(new Date(res.date_start), 'MMM d')} - {format(new Date(res.date_end), 'MMM d')}
                                                                            </p>
                                                                        </TooltipContent>
                                                                    </Tooltip>
                                                                </TooltipProvider>
                                                            ) : (
                                                                <div className="w-full h-full" />
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        ))}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>

            <Dialog open={!!selectedReservation} onOpenChange={(open) => !open && setSelectedReservation(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Reservation Details</DialogTitle>
                        <DialogDescription>
                            Full details of the selected reservation
                        </DialogDescription>
                    </DialogHeader>
                    {selectedReservation && (
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <h4 className="text-sm font-medium text-muted-foreground">User</h4>
                                    <div className="flex items-center gap-2 mt-1">
                                        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                                            <User className="h-4 w-4 text-primary" />
                                        </div>
                                        <span className="font-medium">{selectedReservation.users.full_name}</span>
                                    </div>
                                </div>
                                <div>
                                    <h4 className="text-sm font-medium text-muted-foreground">Status</h4>
                                    <div className="mt-1 capitalize px-2 py-1 bg-green-100 text-green-700 rounded-md inline-block text-sm font-medium">
                                        {selectedReservation.status}
                                    </div>
                                </div>
                                <div>
                                    <h4 className="text-sm font-medium text-muted-foreground">Room</h4>
                                    <p className="mt-1 font-medium">{selectedReservation.rooms.name}</p>
                                </div>
                                <div>
                                    <h4 className="text-sm font-medium text-muted-foreground">Desk</h4>
                                    <p className="mt-1 font-medium">{selectedReservation.room_cells.label}</p>
                                </div>
                                <div>
                                    <h4 className="text-sm font-medium text-muted-foreground">Date Start</h4>
                                    <p className="mt-1">{format(new Date(selectedReservation.date_start), 'PPP')}</p>
                                </div>
                                <div>
                                    <h4 className="text-sm font-medium text-muted-foreground">Date End</h4>
                                    <p className="mt-1">{format(new Date(selectedReservation.date_end), 'PPP')}</p>
                                </div>
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}
