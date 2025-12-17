import { useState, useEffect } from 'react';
import { format, addMonths, subMonths, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, isWeekend } from 'date-fns';
import { ChevronLeft, ChevronRight, Loader2, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { authService } from '@/lib/auth';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
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
    user_id: string;
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

import { MultiSelectFilter } from '@/components/MultiSelectFilter';

// ... (existing interfaces)

export default function Planner() {
    const [date, setDate] = useState(new Date());
    const [rooms, setRooms] = useState<RoomWithDesks[]>([]);
    const [reservations, setReservations] = useState<Reservation[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedReservation, setSelectedReservation] = useState<Reservation | null>(null);
    const [selectedRoomIds, setSelectedRoomIds] = useState<string[]>([]);
    const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
    const { toast } = useToast();

    useEffect(() => {
        loadData();
    }, [date]);

    // Compute unique users from reservations for the filter options
    const uniqueUsers = Array.from(new Set(
        reservations
            .filter(r => r.users && r.user_id)
            .map(r => JSON.stringify({ id: r.user_id, name: r.users.full_name }))
    )).map(s => JSON.parse(s));

    const loadData = async () => {
        setLoading(true);
        try {
            const session = authService.getSession();
            if (!session) throw new Error('No session');

            // 1. Fetch Structure (Rooms + Desks)
            const roomsResponse = await supabase.functions.invoke('manage-rooms', {
                body: { operation: 'list_all_desks' },
                headers: { 'x-session-token': session.token }
            });
            if (roomsResponse.error) throw roomsResponse.error;

            const fetchedRooms = roomsResponse.data || [];
            console.log('Planner rooms structure:', fetchedRooms);
            setRooms(fetchedRooms);
            // Select all rooms by default
            setSelectedRoomIds(fetchedRooms.map((r: any) => r.id));

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
            console.log('Planner reservations:', resResponse.data);
            const fetchedReservations = resResponse.data || [];
            setReservations(fetchedReservations);

            // Select all users by default
            const allUserIds = Array.from(new Set(fetchedReservations.filter((r: any) => r.user_id).map((r: any) => r.user_id))) as string[];
            setSelectedUserIds(allUserIds);

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
            r.date_end >= format(day, 'yyyy-MM-dd') &&
            selectedUserIds.includes(r.user_id)
        );
    };

    // If we have selected rooms, show only them. If usage clears all, show none or all? 
    // User requested "Show all by default". If they uncheck all, it should probably show none or all.
    // Let's strictly follow "checked = visible".
    const filteredRooms = rooms.filter(room => selectedRoomIds.includes(room.id));

    const roomOptions = rooms.map(room => ({ label: room.name, value: room.id }));
    const userOptions = uniqueUsers.map((u: any) => ({ label: u.name, value: u.id }));

    return (
        <div className="h-full flex flex-col space-y-4 overflow-hidden">
            <div className="flex items-center justify-between flex-shrink-0">
                <div className="flex items-center gap-4">
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight">Access Planner</h1>
                        <p className="text-muted-foreground text-sm">Overview of all desk reservations</p>
                    </div>
                    <div className="hidden md:block h-8 w-[1px] bg-border" />
                    <MultiSelectFilter
                        options={roomOptions}
                        selected={selectedRoomIds}
                        onChange={setSelectedRoomIds}
                        placeholder="Filter rooms..."
                    />
                    <MultiSelectFilter
                        options={userOptions}
                        selected={selectedUserIds}
                        onChange={setSelectedUserIds}
                        placeholder="Filter users..."
                    />
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

            <Card className="flex-1 min-h-0 overflow-hidden border-0 shadow-none sm:border sm:shadow-sm sm:rounded-lg">
                <CardContent className="p-0 h-full overflow-auto relative">
                    {loading ? (
                        <div className="flex items-center justify-center h-full">
                            <Loader2 className="h-8 w-8 animate-spin text-primary" />
                        </div>
                    ) : (
                        <div className="relative min-w-[max-content]">
                            {/* Header Row */}
                            <div className="flex sticky top-0 z-40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b shadow-sm">
                                <div className="sticky left-0 z-50 w-64 bg-background border-r p-4 font-medium text-sm text-foreground flex items-center shadow-[4px_0_12px_-4px_rgba(0,0,0,0.1)]">
                                    Room / Desk
                                </div>
                                {daysInMonth.map(day => (
                                    <div
                                        key={day.toString()}
                                        className={cn(
                                            "w-12 flex-shrink-0 border-r border-border/50 last:border-0 p-2 text-center text-xs group hover:bg-muted/50 transition-colors",
                                            isWeekend(day) && "bg-muted/30"
                                        )}
                                    >
                                        <div className={cn("font-medium", isSameDay(day, new Date()) ? "text-primary" : "text-foreground")}>
                                            {format(day, 'd')}
                                        </div>
                                        <div className="text-[10px] text-muted-foreground uppercase tracking-widest">{format(day, 'EEEEE')}</div>
                                    </div>
                                ))}
                            </div>

                            {/* Body */}
                            <div className="divide-y divide-border/50">
                                {filteredRooms.map(room => (
                                    <div key={room.id} className="contents">
                                        {/* Room Header Row */}
                                        <div className="flex bg-muted/20 hover:bg-muted/30 transition-colors">
                                            <div className="sticky left-0 z-30 w-64 bg-muted/20 border-r border-border/50 p-2 px-4 shadow-[4px_0_12px_-4px_rgba(0,0,0,0.1)]">
                                                <TooltipProvider>
                                                    <Tooltip>
                                                        <TooltipTrigger asChild>
                                                            <div className="font-semibold text-xs text-foreground/70 truncate cursor-help">
                                                                {room.name}
                                                            </div>
                                                        </TooltipTrigger>
                                                        <TooltipContent>
                                                            <p>{room.name}</p>
                                                        </TooltipContent>
                                                    </Tooltip>
                                                </TooltipProvider>
                                            </div>
                                            {daysInMonth.map(day => (
                                                <div
                                                    key={`room-${room.id}-${day}`}
                                                    className={cn(
                                                        "w-12 flex-shrink-0 border-r border-border/50 last:border-0",
                                                        isWeekend(day) && "bg-muted/30"
                                                    )}
                                                />
                                            ))}
                                        </div>

                                        {/* Desks */}
                                        {room.desks.map(desk => (
                                            <div key={desk.id} className="flex hover:bg-muted/5 group/row transition-colors">
                                                <div className="sticky left-0 z-30 w-64 bg-background border-r border-border/50 p-3 pl-8 text-sm flex items-center shadow-[4px_0_12px_-4px_rgba(0,0,0,0.1)] group-hover/row:bg-muted/5 transition-colors">
                                                    <span className={cn("truncate font-medium", !desk.label ? "text-muted-foreground italic text-xs" : "text-foreground")}>
                                                        {desk.label || '(No Label)'}
                                                    </span>
                                                </div>
                                                {daysInMonth.map(day => {
                                                    const res = getReservation(desk.id, day);
                                                    return (
                                                        <div
                                                            key={day.toString()}
                                                            className={cn(
                                                                "w-12 flex-shrink-0 border-r border-border/50 last:border-0 p-0.5 text-center relative transition-colors",
                                                                isWeekend(day) && "bg-muted/30",
                                                                isSameDay(day, new Date()) && "bg-muted/10", // Keep Today highlight logic, maybe needs adjustment precedence?
                                                            )}
                                                        >
                                                            {res ? (
                                                                <TooltipProvider>
                                                                    <Tooltip>
                                                                        <TooltipTrigger asChild>
                                                                            <button
                                                                                className={cn(
                                                                                    "w-full h-full text-[10px] rounded flex items-center justify-center font-medium truncate px-0.5 cursor-pointer transition-all shadow-sm",
                                                                                    res.status === 'pending' ? "bg-amber-100 text-amber-700 hover:bg-amber-200" : "bg-primary/15 text-primary hover:bg-primary/25"
                                                                                )}
                                                                                onClick={() => setSelectedReservation(res)}
                                                                            >
                                                                                {res.users.full_name.split(' ')[0]}
                                                                            </button>
                                                                        </TooltipTrigger>
                                                                        <TooltipContent side="top" className="z-50">
                                                                            <div className="flex flex-col gap-1">
                                                                                <p className="font-semibold">{res.users.full_name}</p>
                                                                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                                                                    <span className="capitalize">{res.status}</span>
                                                                                    <span>•</span>
                                                                                    <span>{format(new Date(res.date_start), 'MMM d')} - {format(new Date(res.date_end), 'MMM d')}</span>
                                                                                </div>
                                                                            </div>
                                                                        </TooltipContent>
                                                                    </Tooltip>
                                                                </TooltipProvider>
                                                            ) : (
                                                                <div className="w-full h-full hover:bg-muted/10 transition-colors" />
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
        </div >
    );
}
