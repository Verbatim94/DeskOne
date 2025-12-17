
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { authService } from '@/lib/auth';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Grid3x3, ArrowRight, Loader2, Calendar as CalendarIcon, Users, ChevronLeft, ChevronRight } from 'lucide-react';
import { format, addDays, subDays } from 'date-fns';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { YourActivitySidebar } from '@/components/rooms/YourActivitySidebar';

interface Room {
    id: string;
    name: string;
    description: string | null;
    grid_width: number;
    grid_height: number;
    totalDesks: number;
    activeReservations: number;
}

export default function SharedRooms() {
    const [rooms, setRooms] = useState<Room[]>([]);
    const [loading, setLoading] = useState(true);
    const [date, setDate] = useState<Date>(new Date());
    const { toast } = useToast();
    const navigate = useNavigate();

    useEffect(() => {
        loadRooms();
    }, [date]);

    const loadRooms = async () => {
        setLoading(true);
        try {
            const session = authService.getSession();
            if (!session) throw new Error('No session');

            const dateStr = format(date, 'yyyy-MM-dd');

            const response = await supabase.functions.invoke('manage-rooms', {
                body: {
                    operation: 'list',
                    data: { date: dateStr }
                },
                headers: {
                    'x-session-token': session.token
                }
            });

            if (response.error) throw response.error;
            setRooms(response.data || []);

        } catch (error: unknown) {
            console.error(error);
            toast({
                title: 'Error loading rooms',
                description: 'Failed to load shared rooms availability',
                variant: 'destructive'
            });
        }
        setLoading(false);
    };

    const getAvailabilityColor = (percentage: number) => {
        if (percentage >= 70) return 'text-green-600';
        if (percentage >= 30) return 'text-yellow-600';
        return 'text-red-600';
    };

    const getAvailabilityBgCallback = (percentage: number) => { // Just for variety if needed, but text color is fine
        if (percentage >= 70) return 'bg-green-100';
        if (percentage >= 30) return 'bg-yellow-100';
        return 'bg-red-100';
    };

    return (
        <div className="h-full flex flex-col space-y-6 overflow-hidden">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 flex-shrink-0">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Shared Rooms</h1>
                    <p className="text-muted-foreground text-sm">Check availability and book desks in shared spaces</p>
                </div>

                <div className="flex items-center gap-2">
                    <Label className="font-medium mr-2">Check Availability for:</Label>
                    <div className="flex items-center gap-1">
                        <Button
                            variant="outline"
                            size="icon"
                            onClick={() => setDate(subDays(date, 1))}
                        >
                            <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button
                                    variant={"outline"}
                                    className={cn(
                                        "w-[240px] justify-start text-left font-normal",
                                        !date && "text-muted-foreground"
                                    )}
                                >
                                    <CalendarIcon className="mr-2 h-4 w-4" />
                                    {date ? format(date, "PPP") : <span>Pick a date</span>}
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="end">
                                <Calendar
                                    mode="single"
                                    selected={date}
                                    onSelect={(d) => d && setDate(d)}
                                    initialFocus
                                />
                            </PopoverContent>
                        </Popover>
                        <Button
                            variant="outline"
                            size="icon"
                            onClick={() => setDate(addDays(date, 1))}
                        >
                            <ChevronRight className="h-4 w-4" />
                        </Button>
                    </div>
                </div>
            </div>

            <div className="flex-1 min-h-0 container mx-auto p-0">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6 h-full">
                    <div className="md:col-span-3 h-full overflow-y-auto pr-2 pb-10">
                        {loading ? (
                            <div className="flex justify-center py-12">
                                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                            </div>
                        ) : rooms.length === 0 ? (
                            <Card>
                                <CardContent className="flex flex-col items-center justify-center py-12">
                                    <Grid3x3 className="h-12 w-12 text-muted-foreground mb-4" />
                                    <h3 className="text-lg font-semibold mb-2">No shared rooms</h3>
                                    <p className="text-muted-foreground text-center mb-4">
                                        You don't have access to any shared rooms yet.
                                    </p>
                                </CardContent>
                            </Card>
                        ) : (
                            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3">
                                {rooms.map((room) => {
                                    const availableDesks = room.totalDesks - room.activeReservations;
                                    const percentage = room.totalDesks > 0
                                        ? Math.round((availableDesks / room.totalDesks) * 100)
                                        : 0;

                                    return (
                                        <Card key={room.id} className="hover:shadow-lg transition-shadow flex flex-col">
                                            <CardHeader className="pb-3">
                                                <CardTitle className="flex items-center gap-2 text-xl">
                                                    <Grid3x3 className="h-5 w-5 text-primary" />
                                                    {room.name}
                                                </CardTitle>
                                                {room.description && (
                                                    <CardDescription className="line-clamp-2">{room.description}</CardDescription>
                                                )}
                                            </CardHeader>
                                            <CardContent className="flex-1 flex flex-col justify-between gap-4">
                                                <div className="space-y-3">


                                                    <div className="space-y-1">
                                                        <div className="flex items-center justify-between text-sm">
                                                            <span className="text-muted-foreground">Availability</span>
                                                            <span className={cn("font-bold", getAvailabilityColor(percentage))}>
                                                                {percentage}% Free
                                                            </span>
                                                        </div>
                                                        <div className="h-2 w-full bg-secondary rounded-full overflow-hidden">
                                                            <div
                                                                className={cn("h-full transition-all duration-500",
                                                                    percentage >= 70 ? 'bg-green-500' :
                                                                        percentage >= 30 ? 'bg-yellow-500' : 'bg-red-500'
                                                                )}
                                                                style={{ width: `${percentage}%` }}
                                                            />
                                                        </div>
                                                        <div className="flex justify-between text-xs text-muted-foreground mt-1">
                                                            <span>{availableDesks} desks free</span>
                                                            <span>{room.totalDesks} total</span>
                                                        </div>
                                                    </div>
                                                </div>

                                                <Button
                                                    className="w-full mt-2"
                                                    onClick={() => navigate(`/rooms/${room.id}/view`)}
                                                >
                                                    View & Book <ArrowRight className="ml-2 h-4 w-4" />
                                                </Button>
                                            </CardContent>
                                        </Card>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    <div className="hidden md:block md:col-span-1 border-l pl-6">
                        <YourActivitySidebar />
                    </div>
                </div>
            </div>
        </div>
    );
}
