import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { authService } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
import { Office, OfficeBooking } from '@/types/office';
import { format, addDays, startOfDay, setHours, setMinutes } from 'date-fns';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';

const HOURS = Array.from({ length: 13 }, (_, i) => i + 8); // 8 AM to 8 PM (Ending at 9 PM)
const MINUTES = [0, 15, 30, 45];

interface TimeSlot {
    hour: number;
    minute: number;
    datetime: Date;
}

export default function OfficeAdminCalendar() {
    const { officeId } = useParams();
    const navigate = useNavigate();
    const { toast } = useToast();

    const [office, setOffice] = useState<Office | null>(null);
    const [bookings, setBookings] = useState<OfficeBooking[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedDate, setSelectedDate] = useState<Date>(startOfDay(new Date()));
    const [selectionStart, setSelectionStart] = useState<TimeSlot | null>(null);
    const [selectionEnd, setSelectionEnd] = useState<TimeSlot | null>(null);
    const [blockDialogOpen, setBlockDialogOpen] = useState(false);
    const [selectedBooking, setSelectedBooking] = useState<OfficeBooking | null>(null);

    useEffect(() => {
        loadOffice();
    }, [officeId]);

    useEffect(() => {
        if (office) {
            loadBookings();
        }
    }, [selectedDate, office]);

    const callOfficeFunction = async (operation: string, data?: Record<string, unknown>) => {
        const session = authService.getSession();
        if (!session) throw new Error('No session');

        const response = await supabase.functions.invoke('manage-offices', {
            body: { operation, data },
            headers: {
                'x-session-token': session.token
            }
        });

        if (response.error) throw response.error;
        return response.data;
    };

    const callBookingFunction = async (operation: string, data?: Record<string, unknown>) => {
        const session = authService.getSession();
        if (!session) throw new Error('No session');

        const response = await supabase.functions.invoke('manage-office-bookings', {
            body: { operation, data },
            headers: {
                'x-session-token': session.token
            }
        });

        if (response.error) throw response.error;
        return response.data;
    };

    const loadOffice = async () => {
        if (!officeId) return;

        setLoading(true);
        try {
            const data = await callOfficeFunction('get', { officeId });
            setOffice(data);
        } catch (error: unknown) {
            let message = 'Unknown error';
            if (error instanceof Error) message = error.message;
            else if (typeof error === 'object' && error !== null) message = (error as { message?: string }).message || 'Unknown error';
            toast({
                title: 'Error loading office',
                description: message,
                variant: 'destructive'
            });
            navigate('/manage-offices');
        }
        setLoading(false);
    };

    const loadBookings = async () => {
        if (!officeId) return;

        try {
            const startOfDayDate = startOfDay(selectedDate);
            const endOfDayDate = addDays(startOfDayDate, 1);

            const data = await callBookingFunction('list_by_office', {
                officeId,
                startDate: startOfDayDate.toISOString(),
                endDate: endOfDayDate.toISOString()
            });
            setBookings(data || []);
        } catch (error: unknown) {
            console.error('Error loading bookings:', error);
        }
    };

    const createTimeSlot = (hour: number, minute: number): TimeSlot => {
        const datetime = setMinutes(setHours(startOfDay(selectedDate), hour), minute);
        return { hour, minute, datetime };
    };

    const handleSlotClick = (slot: TimeSlot) => {
        // Check if clicking on existing booking
        const clickedBooking = getBookingAtTime(slot.datetime);
        if (clickedBooking) {
            setSelectedBooking(clickedBooking);
            return;
        }

        // Start new selection for admin block
        if (!selectionStart) {
            setSelectionStart(slot);
            setSelectionEnd(slot);
        } else {
            // Complete selection
            setSelectionEnd(slot);
            setBlockDialogOpen(true);
        }
    };

    const getBookingAtTime = (datetime: Date): OfficeBooking | null => {
        return bookings.find(booking => {
            const start = new Date(booking.start_time);
            const end = new Date(booking.end_time);
            return datetime >= start && datetime < end;
        }) || null;
    };

    const isSlotSelected = (slot: TimeSlot): boolean => {
        if (!selectionStart || !selectionEnd) return false;

        const slotTime = slot.datetime.getTime();
        const startTime = Math.min(selectionStart.datetime.getTime(), selectionEnd.datetime.getTime());
        const endTime = Math.max(selectionStart.datetime.getTime(), selectionEnd.datetime.getTime());

        return slotTime >= startTime && slotTime <= endTime;
    };

    const handleCreateBlock = async () => {
        if (!selectionStart || !selectionEnd || !officeId) return;

        const startTime = selectionStart.datetime < selectionEnd.datetime ? selectionStart.datetime : selectionEnd.datetime;
        const endTime = selectionStart.datetime < selectionEnd.datetime ? selectionEnd.datetime : selectionStart.datetime;

        // Add 15 minutes to end time to make it inclusive
        const actualEndTime = addDays(endTime, 0);
        actualEndTime.setMinutes(actualEndTime.getMinutes() + 15);

        try {
            await callBookingFunction('create_admin_block', {
                officeId,
                startTime: startTime.toISOString(),
                endTime: actualEndTime.toISOString()
            });

            toast({ title: 'Time block created successfully' });
            setBlockDialogOpen(false);
            setSelectionStart(null);
            setSelectionEnd(null);
            loadBookings();
        } catch (error: unknown) {
            let message = 'Unknown error';
            if (error instanceof Error) message = error.message;
            else if (typeof error === 'object' && error !== null) message = (error as { message?: string }).message || 'Unknown error';
            toast({
                title: 'Error creating block',
                description: message,
                variant: 'destructive'
            });
        }
    };

    const handleDeleteBooking = async () => {
        if (!selectedBooking) return;

        try {
            await callBookingFunction('delete', {
                bookingId: selectedBooking.id
            });

            toast({ title: 'Booking deleted successfully' });
            setSelectedBooking(null);
            loadBookings();
        } catch (error: unknown) {
            let message = 'Unknown error';
            if (error instanceof Error) message = error.message;
            else if (typeof error === 'object' && error !== null) message = (error as { message?: string }).message || 'Unknown error';
            toast({
                title: 'Error deleting booking',
                description: message,
                variant: 'destructive'
            });
        }
    };

    const getSlotColor = (slot: TimeSlot): string => {
        const booking = getBookingAtTime(slot.datetime);

        if (booking) {
            if (booking.is_admin_block) {
                return 'bg-red-100 border-red-300 hover:bg-red-200 cursor-pointer';
            } else {
                return 'bg-blue-100 border-blue-300 hover:bg-blue-200 cursor-pointer';
            }
        }

        if (isSlotSelected(slot)) {
            return 'bg-orange-200 border-orange-400';
        }

        return 'bg-white border-gray-200 hover:bg-orange-50 cursor-pointer';
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-gray-50">
                <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            </div>
        );
    }

    if (!office) return null;

    return (
        <div className="min-h-screen bg-gray-50/50 p-4 flex flex-col space-y-4">
            {/* Header */}
            <div className="flex flex-col md:flex-row items-center justify-between bg-white px-4 py-3 rounded-2xl shadow-sm border border-gray-100">
                <div className="flex items-center gap-4 w-full md:w-auto">
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => navigate('/manage-offices')}
                        className="rounded-full hover:bg-gray-100"
                    >
                        <ArrowLeft className="h-5 w-5 text-gray-600" />
                    </Button>
                    <div>
                        <h1 className="text-lg font-semibold text-gray-900">{office.name} - Admin Schedule</h1>
                        <p className="text-xs text-gray-500">{office.location}</p>
                    </div>
                </div>

                <div className="flex items-center gap-4 w-full md:w-auto mt-4 md:mt-0">
                    {/* Date Navigation */}
                    <div className="flex items-center justify-between w-full sm:w-auto bg-gray-100/80 p-1 rounded-full">
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 rounded-full hover:bg-white hover:shadow-sm transition-all"
                            onClick={() => setSelectedDate(addDays(selectedDate, -1))}
                        >
                            <ChevronLeft className="h-4 w-4 text-gray-600" />
                        </Button>
                        <span className="px-4 text-sm font-medium text-gray-700 min-w-[120px] text-center">
                            {format(selectedDate, 'EEE, MMM d')}
                        </span>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 rounded-full hover:bg-white hover:shadow-sm transition-all"
                            onClick={() => setSelectedDate(addDays(selectedDate, 1))}
                        >
                            <ChevronRight className="h-4 w-4 text-gray-600" />
                        </Button>
                    </div>

                    <Button
                        variant={selectedDate.toDateString() === new Date().toDateString() ? 'default' : 'ghost'}
                        onClick={() => setSelectedDate(startOfDay(new Date()))}
                        className={`rounded-full px-6 ${selectedDate.toDateString() === new Date().toDateString()
                            ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-200'
                            : 'text-gray-600 hover:bg-gray-100'
                            }`}
                    >
                        Today
                    </Button>
                </div>
            </div>

            {/* Legend */}
            <div className="bg-white px-4 py-2 rounded-full shadow-sm border border-gray-100 inline-flex items-center gap-6 text-sm flex-shrink-0 self-start">
                <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-white border-2 border-gray-300"></div>
                    <span className="text-gray-600 font-medium">Available</span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-red-200 border-2 border-red-400"></div>
                    <span className="text-gray-600 font-medium">Admin Block</span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-blue-200 border-2 border-blue-400"></div>
                    <span className="text-gray-600 font-medium">User Booking</span>
                </div>
            </div>

            {/* Time Grid */}
            <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6 overflow-auto">
                <div className="min-w-[600px]">
                    {/* Time labels and slots */}
                    {HOURS.map((hour) => (
                        <div key={hour} className="flex border-b border-gray-100 last:border-b-0">
                            {/* Hour label */}
                            <div className="w-20 flex-shrink-0 py-2 text-sm font-medium text-gray-600">
                                {format(setMinutes(setHours(new Date(), hour), 0), 'h:mm a')}
                            </div>

                            {/* 15-minute slots */}
                            <div className="flex-1 grid grid-cols-4 gap-1 py-1">
                                {MINUTES.map((minute) => {
                                    const slot = createTimeSlot(hour, minute);
                                    const booking = getBookingAtTime(slot.datetime);

                                    return (
                                        <div
                                            key={`${hour}-${minute}`}
                                            className={`h-12 border rounded transition-all ${getSlotColor(slot)}`}
                                            onClick={() => handleSlotClick(slot)}
                                            title={booking
                                                ? booking.is_admin_block
                                                    ? 'Admin block - click to delete'
                                                    : `User booking: ${booking.user?.full_name} - click to view`
                                                : 'Click to block this time'}
                                        >
                                            {booking && minute === 0 && (
                                                <div className="text-xs p-1 truncate">
                                                    {booking.is_admin_block ? 'Blocked' : booking.user?.full_name}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Block Creation Dialog */}
            <Dialog open={blockDialogOpen} onOpenChange={(open) => {
                setBlockDialogOpen(open);
                if (!open) {
                    setSelectionStart(null);
                    setSelectionEnd(null);
                }
            }}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Create Admin Block</DialogTitle>
                        <DialogDescription>
                            Block this time period from user bookings
                        </DialogDescription>
                    </DialogHeader>
                    {selectionStart && selectionEnd && (
                        <div className="space-y-2">
                            <p><strong>Date:</strong> {format(selectedDate, 'MMMM d, yyyy')}</p>
                            <p><strong>Time:</strong> {format(selectionStart.datetime < selectionEnd.datetime ? selectionStart.datetime : selectionEnd.datetime, 'h:mm a')} - {format(selectionStart.datetime < selectionEnd.datetime ? selectionEnd.datetime : selectionStart.datetime, 'h:mm a')}</p>
                        </div>
                    )}
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setBlockDialogOpen(false)}>
                            Cancel
                        </Button>
                        <Button onClick={handleCreateBlock}>
                            Create Block
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Booking Details Dialog */}
            <Dialog open={!!selectedBooking} onOpenChange={(open) => !open && setSelectedBooking(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{selectedBooking?.is_admin_block ? 'Admin Block' : 'User Booking'}</DialogTitle>
                        <DialogDescription>
                            {selectedBooking?.is_admin_block ? 'Manage admin time block' : 'View user booking details'}
                        </DialogDescription>
                    </DialogHeader>
                    {selectedBooking && (
                        <div className="space-y-2">
                            <p><strong>Date:</strong> {format(new Date(selectedBooking.start_time), 'MMMM d, yyyy')}</p>
                            <p><strong>Time:</strong> {format(new Date(selectedBooking.start_time), 'h:mm a')} - {format(new Date(selectedBooking.end_time), 'h:mm a')}</p>
                            {!selectedBooking.is_admin_block && selectedBooking.user && (
                                <p><strong>Booked by:</strong> {selectedBooking.user.full_name}</p>
                            )}
                        </div>
                    )}
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setSelectedBooking(null)}>
                            Close
                        </Button>
                        <Button variant="destructive" onClick={handleDeleteBooking}>
                            Delete {selectedBooking?.is_admin_block ? 'Block' : 'Booking'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
