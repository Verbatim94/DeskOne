import { useCallback, useEffect, useMemo, useState } from "react";
import { addDays, format, startOfDay } from "date-fns";
import {
  BriefcaseBusiness,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  Loader2,
  MapPin,
  Pencil,
  Plus,
  Trash2,
  Users,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { getEdgeErrorMessage } from "@/lib/edge-functions";
import {
  createOffice,
  createOfficeBooking,
  deleteOffice,
  deleteOfficeBooking,
  listOfficeAccess,
  listOfficeBookings,
  listOfficeUsers,
  listOffices,
  updateOffice,
} from "@/features/offices/api";
import type { Office, OfficeBooking, OfficeUser } from "@/features/offices/types";

const DURATIONS = [15, 30, 45, 60, 90, 120, 180, 240];
const DAY_START_HOUR = 8;
const DAY_END_HOUR = 20;
const SLOT_MINUTES = 15;
const SLOT_HEIGHT = 28;
const TIME_LABEL_WIDTH = 68;
const TOTAL_DAY_MINUTES = (DAY_END_HOUR - DAY_START_HOUR) * 60;
const VISIBLE_SLOTS = TOTAL_DAY_MINUTES / SLOT_MINUTES;

function toDateTimeLocalValue(date: Date): string {
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function fromDateTimeLocalValue(value: string): Date {
  return new Date(value);
}

function formatTimeRange(startTime: string, endTime: string): string {
  return `${format(new Date(startTime), "HH:mm")} - ${format(new Date(endTime), "HH:mm")}`;
}

function roundUpToNextQuarter(date: Date): Date {
  const rounded = new Date(date);
  rounded.setSeconds(0, 0);
  const remainder = rounded.getMinutes() % 15;
  if (remainder > 0) {
    rounded.setMinutes(rounded.getMinutes() + (15 - remainder));
  }
  return rounded;
}

function getMinutesFromDayStart(date: Date): number {
  return (date.getHours() - DAY_START_HOUR) * 60 + date.getMinutes();
}

function getSlotDate(day: Date, slotIndex: number): Date {
  const slotDate = new Date(day);
  slotDate.setHours(DAY_START_HOUR, slotIndex * SLOT_MINUTES, 0, 0);
  return slotDate;
}

function isBookingInVisibleRange(booking: OfficeBooking): boolean {
  const start = new Date(booking.start_time);
  const end = new Date(booking.end_time);
  return getMinutesFromDayStart(end) > 0 && getMinutesFromDayStart(start) < TOTAL_DAY_MINUTES;
}

export default function Offices() {
  const { user } = useAuth();
  const { toast } = useToast();
  const isAdmin = user?.role === "admin";

  const [offices, setOffices] = useState<Office[]>([]);
  const [selectedOfficeId, setSelectedOfficeId] = useState<string>("");
  const [bookings, setBookings] = useState<OfficeBooking[]>([]);
  const [users, setUsers] = useState<OfficeUser[]>([]);
  const [loadingOffices, setLoadingOffices] = useState(true);
  const [loadingBookings, setLoadingBookings] = useState(false);
  const [savingBooking, setSavingBooking] = useState(false);
  const [officeDialogOpen, setOfficeDialogOpen] = useState(false);
  const [editingOffice, setEditingOffice] = useState<Office | null>(null);
  const [date, setDate] = useState(() => startOfDay(new Date()));
  const [formData, setFormData] = useState({ name: "", location: "", userIds: [] as string[] });
  const [bookingForm, setBookingForm] = useState(() => ({
    start: toDateTimeLocalValue(roundUpToNextQuarter(new Date())),
    duration: "60",
    isAdminBlock: false,
  }));

  const selectedOffice = useMemo(
    () => offices.find((office) => office.id === selectedOfficeId) || null,
    [offices, selectedOfficeId],
  );

  const visibleBookings = useMemo(
    () => bookings.filter(isBookingInVisibleRange),
    [bookings],
  );

  const selectedStartLabel = useMemo(
    () => format(fromDateTimeLocalValue(bookingForm.start), "HH:mm"),
    [bookingForm.start],
  );

  const loadOffices = useCallback(async () => {
    setLoadingOffices(true);
    try {
      const data = await listOffices();
      setOffices(data || []);
      setSelectedOfficeId((current) => current || data?.[0]?.id || "");
    } catch (error) {
      toast({
        title: "Error loading offices",
        description: getEdgeErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      setLoadingOffices(false);
    }
  }, [toast]);

  const loadUsers = useCallback(async () => {
    if (!isAdmin) return;
    try {
      setUsers(await listOfficeUsers());
    } catch (error) {
      toast({
        title: "Error loading users",
        description: getEdgeErrorMessage(error),
        variant: "destructive",
      });
    }
  }, [isAdmin, toast]);

  const loadBookings = useCallback(async () => {
    if (!selectedOfficeId) {
      setBookings([]);
      return;
    }

    setLoadingBookings(true);
    try {
      const startDate = date.toISOString();
      const endDate = addDays(date, 1).toISOString();
      setBookings(await listOfficeBookings(selectedOfficeId, startDate, endDate));
    } catch (error) {
      toast({
        title: "Error loading bookings",
        description: getEdgeErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      setLoadingBookings(false);
    }
  }, [date, selectedOfficeId, toast]);

  useEffect(() => {
    loadOffices();
    loadUsers();
  }, [loadOffices, loadUsers]);

  useEffect(() => {
    loadBookings();
  }, [loadBookings]);

  const openCreateDialog = () => {
    setEditingOffice(null);
    setFormData({ name: "", location: "", userIds: [] });
    setOfficeDialogOpen(true);
  };

  const openEditDialog = async (office: Office) => {
    setEditingOffice(office);
    setFormData({ name: office.name, location: office.location, userIds: [] });
    setOfficeDialogOpen(true);

    try {
      const accessIds = await listOfficeAccess(office.id);
      setFormData({ name: office.name, location: office.location, userIds: accessIds });
    } catch (error) {
      toast({
        title: "Error loading office access",
        description: getEdgeErrorMessage(error),
        variant: "destructive",
      });
    }
  };

  const handleOfficeSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    try {
      if (editingOffice) {
        await updateOffice(editingOffice.id, formData);
        toast({ title: "Office updated successfully" });
      } else {
        await createOffice(formData);
        toast({ title: "Office created successfully" });
      }

      setOfficeDialogOpen(false);
      await loadOffices();
    } catch (error) {
      toast({
        title: editingOffice ? "Error updating office" : "Error creating office",
        description: getEdgeErrorMessage(error),
        variant: "destructive",
      });
    }
  };

  const handleDeleteOffice = async (officeId: string) => {
    if (!confirm("Are you sure you want to delete this office and its bookings?")) return;

    try {
      await deleteOffice(officeId);
      toast({ title: "Office deleted successfully" });
      setSelectedOfficeId((current) => (current === officeId ? "" : current));
      await loadOffices();
    } catch (error) {
      toast({
        title: "Error deleting office",
        description: getEdgeErrorMessage(error),
        variant: "destructive",
      });
    }
  };

  const toggleUserAccess = (userId: string, checked: boolean) => {
    setFormData((current) => ({
      ...current,
      userIds: checked
        ? [...current.userIds, userId]
        : current.userIds.filter((id) => id !== userId),
    }));
  };

  const isSlotBooked = (slotDate: Date): boolean => {
    const slotStart = slotDate.getTime();
    const slotEnd = slotStart + SLOT_MINUTES * 60_000;

    return bookings.some((booking) => {
      const bookingStart = new Date(booking.start_time).getTime();
      const bookingEnd = new Date(booking.end_time).getTime();
      return bookingStart < slotEnd && bookingEnd > slotStart;
    });
  };

  const selectSlot = (slotDate: Date) => {
    if (!selectedOffice || isSlotBooked(slotDate)) return;

    setBookingForm((current) => ({
      ...current,
      start: toDateTimeLocalValue(slotDate),
    }));
  };

  const handleBookingSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedOfficeId) return;

    const start = fromDateTimeLocalValue(bookingForm.start);
    const end = new Date(start);
    end.setMinutes(start.getMinutes() + Number(bookingForm.duration));

    if (start.getMinutes() % 15 !== 0) {
      toast({
        title: "Invalid start time",
        description: "Office bookings must start on a 15-minute boundary.",
        variant: "destructive",
      });
      return;
    }

    setSavingBooking(true);
    try {
      await createOfficeBooking({
        officeId: selectedOfficeId,
        startTime: start.toISOString(),
        endTime: end.toISOString(),
        isAdminBlock: isAdmin && bookingForm.isAdminBlock,
      });
      toast({ title: bookingForm.isAdminBlock ? "Office blocked" : "Office booked" });
      await loadBookings();
    } catch (error) {
      toast({
        title: "Error creating booking",
        description: getEdgeErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      setSavingBooking(false);
    }
  };

  const handleDeleteBooking = async (bookingId: string) => {
    try {
      await deleteOfficeBooking(bookingId);
      toast({ title: "Booking deleted" });
      await loadBookings();
    } catch (error) {
      toast({
        title: "Error deleting booking",
        description: getEdgeErrorMessage(error),
        variant: "destructive",
      });
    }
  };

  return (
    <div className="h-full min-h-0 space-y-5 overflow-hidden">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Offices</h1>
          <p className="text-sm text-muted-foreground">Book private office spaces in 15-minute increments</p>
        </div>
        {isAdmin && (
          <Button onClick={openCreateDialog}>
            <Plus className="mr-2 h-4 w-4" />
            Create Office
          </Button>
        )}
      </div>

      <div className="grid h-[calc(100%-72px)] min-h-0 gap-5 lg:grid-cols-[340px_minmax(0,1fr)]">
        <Card className="min-h-0 overflow-hidden">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <BriefcaseBusiness className="h-5 w-5" />
              Available Offices
            </CardTitle>
            <CardDescription>
              {isAdmin ? "Manage office access and details" : "Offices assigned to your account"}
            </CardDescription>
          </CardHeader>
          <CardContent className="h-[calc(100%-92px)] overflow-y-auto pr-3">
            {loadingOffices ? (
              <div className="flex justify-center py-10">
                <Loader2 className="h-7 w-7 animate-spin text-primary" />
              </div>
            ) : offices.length === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground">
                No offices available.
              </div>
            ) : (
              <div className="space-y-3">
                {offices.map((office) => (
                  <button
                    key={office.id}
                    type="button"
                    onClick={() => setSelectedOfficeId(office.id)}
                    className={cn(
                      "w-full rounded-lg border p-4 text-left transition-colors hover:bg-muted/50",
                      selectedOfficeId === office.id && "border-primary bg-primary/5",
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate font-medium">{office.name}</div>
                        <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                          <MapPin className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">{office.location}</span>
                        </div>
                      </div>
                      {isAdmin && (
                        <Badge variant="secondary" className="shrink-0">
                          {office.access_count || 0} users
                        </Badge>
                      )}
                    </div>
                    {isAdmin && (
                      <div className="mt-3 flex gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={(event) => {
                            event.stopPropagation();
                            openEditDialog(office);
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={(event) => {
                            event.stopPropagation();
                            handleDeleteOffice(office.id);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid min-h-0 gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
          <Card className="min-h-0 overflow-hidden">
            <CardHeader className="pb-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <CalendarDays className="h-5 w-5" />
                    {selectedOffice ? selectedOffice.name : "Office calendar"}
                  </CardTitle>
                  <CardDescription>
                    {selectedOffice ? selectedOffice.location : "Select an office to view bookings"}
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="icon" onClick={() => setDate(addDays(date, -1))}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Input
                    type="date"
                    value={format(date, "yyyy-MM-dd")}
                    onChange={(event) => setDate(startOfDay(new Date(`${event.target.value}T00:00:00`)))}
                    className="w-[150px]"
                  />
                  <Button variant="outline" size="icon" onClick={() => setDate(addDays(date, 1))}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="h-[calc(100%-96px)] overflow-hidden">
              {loadingBookings ? (
                <div className="flex justify-center py-10">
                  <Loader2 className="h-7 w-7 animate-spin text-primary" />
                </div>
              ) : !selectedOffice ? (
                <div className="py-10 text-center text-sm text-muted-foreground">
                  Select an office from the list.
                </div>
              ) : (
                <div className="flex h-full min-h-0 flex-col overflow-hidden">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                    <div className="flex items-center gap-3">
                      <span className="inline-flex items-center gap-1">
                        <span className="h-2.5 w-2.5 rounded-sm bg-blue-500" />
                        Booking
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <span className="h-2.5 w-2.5 rounded-sm bg-red-500" />
                        Admin block
                      </span>
                    </div>
                    <span>{DAY_START_HOUR}:00 - {DAY_END_HOUR}:00</span>
                  </div>
                  <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border bg-white">
                    <div
                      className="relative"
                      style={{ height: VISIBLE_SLOTS * SLOT_HEIGHT }}
                    >
                      {Array.from({ length: VISIBLE_SLOTS + 1 }).map((_, index) => {
                        const minutes = index * SLOT_MINUTES;
                        const hour = DAY_START_HOUR + Math.floor(minutes / 60);
                        const minute = minutes % 60;
                        const isHour = minute === 0;

                        return (
                          <div
                            key={`line-${index}`}
                            className={cn(
                              "absolute left-0 right-0 border-t",
                              isHour ? "border-slate-300" : "border-slate-100",
                            )}
                            style={{ top: index * SLOT_HEIGHT }}
                          >
                            {isHour && index < VISIBLE_SLOTS && (
                              <span className="absolute left-3 top-1 text-xs font-medium text-slate-500">
                                {String(hour).padStart(2, "0")}:00
                              </span>
                            )}
                          </div>
                        );
                      })}

                      <div
                        className="absolute bottom-0 top-0 border-l border-slate-200"
                        style={{ left: TIME_LABEL_WIDTH }}
                      />

                      {Array.from({ length: VISIBLE_SLOTS }).map((_, index) => {
                        const slotDate = getSlotDate(date, index);
                        const booked = isSlotBooked(slotDate);
                        const selected = toDateTimeLocalValue(slotDate) === bookingForm.start;
                        const minute = slotDate.getMinutes();

                        return (
                          <button
                            key={`slot-${index}`}
                            type="button"
                            disabled={booked}
                            onClick={() => selectSlot(slotDate)}
                            className={cn(
                              "absolute right-2 rounded-sm text-left transition-colors",
                              booked ? "cursor-not-allowed" : "hover:bg-blue-50",
                              selected && !booked && "bg-blue-100 ring-1 ring-blue-500",
                            )}
                            style={{
                              top: index * SLOT_HEIGHT + 1,
                              left: TIME_LABEL_WIDTH + 1,
                              height: SLOT_HEIGHT - 2,
                            }}
                            title={`${format(slotDate, "HH:mm")} ${booked ? "unavailable" : "available"}`}
                          >
                            {!booked && minute !== 0 && (
                              <span className="ml-3 text-[11px] text-slate-300">{format(slotDate, "HH:mm")}</span>
                            )}
                          </button>
                        );
                      })}

                      {visibleBookings.map((booking) => {
                        const start = new Date(booking.start_time);
                        const end = new Date(booking.end_time);
                        const startMinutes = Math.max(0, getMinutesFromDayStart(start));
                        const endMinutes = Math.min(TOTAL_DAY_MINUTES, getMinutesFromDayStart(end));
                        const top = (startMinutes / SLOT_MINUTES) * SLOT_HEIGHT + 2;
                        const height = Math.max(((endMinutes - startMinutes) / SLOT_MINUTES) * SLOT_HEIGHT - 4, 24);
                        const canDelete = isAdmin || booking.user_id === user?.id;
                        const ownerName = booking.is_admin_block ? "Admin block" : booking.users?.full_name || "Booking";
                        const compactBlock = height < 44;
                        const timeRange = formatTimeRange(booking.start_time, booking.end_time);

                        return (
                          <div
                            key={booking.id}
                            className={cn(
                              "absolute right-3 overflow-hidden rounded-md border px-3 py-1.5 shadow-sm",
                              booking.is_admin_block
                                ? "border-red-300 bg-red-50 text-red-900"
                                : "border-blue-300 bg-blue-50 text-blue-950",
                            )}
                            style={{
                              top,
                              left: TIME_LABEL_WIDTH + 8,
                              height,
                            }}
                            title={`${timeRange} - ${ownerName}`}
                          >
                            <div className="flex h-full items-center justify-between gap-2">
                              <div className="min-w-0 flex-1">
                                <div
                                  className={cn(
                                    "flex min-w-0 items-center gap-1 text-xs font-semibold",
                                    compactBlock ? "leading-4" : "leading-5",
                                  )}
                                >
                                  <Clock className="h-3.5 w-3.5 shrink-0" />
                                  <span className="shrink-0">{timeRange}</span>
                                  <span className="text-slate-400">-</span>
                                  <span className="truncate">{ownerName}</span>
                                </div>
                                {!compactBlock && (
                                  <div className="truncate text-[11px] opacity-80">
                                    {booking.is_admin_block ? "Unavailable" : "Office booking"}
                                  </div>
                                )}
                              </div>
                              {canDelete && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 w-6 shrink-0 p-0 hover:bg-white/70"
                                  onClick={() => handleDeleteBooking(booking.id)}
                                  title="Delete booking"
                                >
                                  <X className="h-3.5 w-3.5" />
                                </Button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">New Booking</CardTitle>
              <CardDescription>
                {selectedOffice ? `Selected start: ${selectedStartLabel}` : "Select an office and a time slot"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form className="space-y-4" onSubmit={handleBookingSubmit}>
                <div className="space-y-2">
                  <Label htmlFor="booking-start">Start</Label>
                  <Input
                    id="booking-start"
                    type="datetime-local"
                    step={900}
                    value={bookingForm.start}
                    onChange={(event) => setBookingForm({ ...bookingForm, start: event.target.value })}
                    disabled={!selectedOffice}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="booking-duration">Duration</Label>
                  <Select
                    value={bookingForm.duration}
                    onValueChange={(duration) => setBookingForm({ ...bookingForm, duration })}
                    disabled={!selectedOffice}
                  >
                    <SelectTrigger id="booking-duration">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DURATIONS.map((duration) => (
                        <SelectItem key={duration} value={String(duration)}>
                          {duration} minutes
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {isAdmin && (
                  <div className="flex items-center gap-2 rounded-lg border p-3">
                    <Checkbox
                      id="admin-block"
                      checked={bookingForm.isAdminBlock}
                      onCheckedChange={(checked) =>
                        setBookingForm({ ...bookingForm, isAdminBlock: checked === true })
                      }
                    />
                    <Label htmlFor="admin-block" className="text-sm font-normal">
                      Create as admin block
                    </Label>
                  </div>
                )}
                <Button className="w-full" type="submit" disabled={!selectedOffice || savingBooking}>
                  {savingBooking && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Book Office
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={officeDialogOpen} onOpenChange={setOfficeDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingOffice ? "Edit Office" : "Create Office"}</DialogTitle>
            <DialogDescription>
              Assign users who can see and book this office.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleOfficeSubmit} className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="office-name">Name</Label>
                <Input
                  id="office-name"
                  value={formData.name}
                  onChange={(event) => setFormData({ ...formData, name: event.target.value })}
                  placeholder="e.g. Executive Office"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="office-location">Location</Label>
                <Input
                  id="office-location"
                  value={formData.location}
                  onChange={(event) => setFormData({ ...formData, location: event.target.value })}
                  placeholder="e.g. Floor 2, East wing"
                  required
                />
              </div>
            </div>

            <Separator />

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <Label className="flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  User access
                </Label>
                <Badge variant="secondary">{formData.userIds.length} selected</Badge>
              </div>
              <div className="max-h-72 space-y-2 overflow-y-auto rounded-lg border p-3">
                {users.length === 0 ? (
                  <div className="py-6 text-center text-sm text-muted-foreground">No active users found.</div>
                ) : (
                  users.map((officeUser) => (
                    <label
                      key={officeUser.id}
                      className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 hover:bg-muted"
                    >
                      <Checkbox
                        checked={formData.userIds.includes(officeUser.id)}
                        onCheckedChange={(checked) => toggleUserAccess(officeUser.id, checked === true)}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{officeUser.full_name}</span>
                        <span className="block truncate text-xs text-muted-foreground">{officeUser.username}</span>
                      </span>
                      <Badge variant={officeUser.role === "admin" ? "default" : "outline"}>
                        {officeUser.role}
                      </Badge>
                    </label>
                  ))
                )}
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOfficeDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">{editingOffice ? "Update Office" : "Create Office"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
