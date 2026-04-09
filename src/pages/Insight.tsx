import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { eachDayOfInterval, endOfMonth, format, parseISO, startOfMonth, subMonths } from 'date-fns';
import { Activity, ArrowRight, BrainCircuit, CalendarDays, Flame, Gauge, RefreshCw, Sparkles, TrendingUp } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MultiSelectFilter } from '@/components/MultiSelectFilter';
import { supabase } from '@/integrations/supabase/client';
import { authService } from '@/lib/auth';
import { useAuth } from '@/contexts/AuthContext';

interface RoomStructure {
  id: string;
  name: string;
  desks: Array<{
    id: string;
    label: string;
    room_id: string;
  }>;
}

interface DailyOccupancyRow {
  reservation_id: string;
  source_type: 'reservation' | 'fixed_assignment';
  room_id: string;
  room_name: string;
  desk_id: string;
  desk_label: string;
  user_id: string;
  user_full_name: string;
  username: string;
  status: string;
  reservation_type: string;
  time_segment: string;
  occupancy_date: string;
  weekday_index: number;
  weekday_name: string;
  is_weekend: boolean;
  month: string;
  year: number;
  created_at: string;
  approved_at: string | null;
  approved_by: string | null;
  approved_by_name: string | null;
}

type InsightPayload = {
  rooms: RoomStructure[];
  rows: DailyOccupancyRow[];
  generatedAt: string;
};

type SourceFilter = 'all' | 'reservation' | 'fixed_assignment';

const MIX_COLORS = ['#3b82f6', '#8b5cf6'];
const SOURCE_FILTERS: Array<{ value: SourceFilter; label: string }> = [
  { value: 'all', label: 'All occupancy' },
  { value: 'reservation', label: 'Flexible bookings' },
  { value: 'fixed_assignment', label: 'Fixed assignments' },
];

function formatPercent(value: number) {
  return `${Math.round(value)}%`;
}

function compactNumber(value: number) {
  return new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}

function buildDailyUniqueRows(rows: DailyOccupancyRow[]) {
  const uniqueMap = new Map<string, DailyOccupancyRow>();

  rows.forEach((row) => {
    const key = `${row.desk_id}-${row.occupancy_date}`;
    if (!uniqueMap.has(key)) {
      uniqueMap.set(key, row);
    }
  });

  return Array.from(uniqueMap.values());
}

const italianHolidayCache = new Map<number, Set<string>>();

function getEasterSunday(year: number) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;

  return new Date(year, month - 1, day);
}

function getItalianNationalHolidays(year: number) {
  if (italianHolidayCache.has(year)) {
    return italianHolidayCache.get(year)!;
  }

  const easterMonday = getEasterSunday(year);
  easterMonday.setDate(easterMonday.getDate() + 1);

  const fixedHolidays = [
    new Date(year, 0, 1),
    new Date(year, 0, 6),
    new Date(year, 3, 25),
    new Date(year, 4, 1),
    new Date(year, 5, 2),
    new Date(year, 7, 15),
    new Date(year, 10, 1),
    new Date(year, 11, 8),
    new Date(year, 11, 25),
    new Date(year, 11, 26),
    easterMonday,
  ];

  const holidaySet = new Set(fixedHolidays.map((holiday) => format(holiday, 'yyyy-MM-dd')));
  italianHolidayCache.set(year, holidaySet);
  return holidaySet;
}

function isItalianWorkingDay(date: Date) {
  const day = date.getDay();
  if (day === 0 || day === 6) return false;

  return !getItalianNationalHolidays(date.getFullYear()).has(format(date, 'yyyy-MM-dd'));
}

function countItalianWorkingDays(start: Date, end: Date) {
  return eachDayOfInterval({ start, end }).filter(isItalianWorkingDay).length;
}

function InsightMetric({
  label,
  value,
  detail,
  accent,
}: {
  label: string;
  value: string;
  detail: string;
  accent: string;
}) {
  return (
    <Card className="border-white/60 bg-white/90 shadow-sm backdrop-blur">
      <CardContent className="p-5">
        <div className={`mb-4 inline-flex rounded-2xl px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${accent}`}>
          {label}
        </div>
        <div className="text-3xl font-semibold tracking-tight text-slate-950">{value}</div>
        <p className="mt-2 text-sm leading-6 text-slate-500">{detail}</p>
      </CardContent>
    </Card>
  );
}

export default function Insight() {
  const { user } = useAuth();
  const today = new Date();
  const currentMonthValue = format(today, 'yyyy-MM');
  const [selectedMonth, setSelectedMonth] = useState(currentMonthValue);
  const [selectedRoomIds, setSelectedRoomIds] = useState<string[]>([]);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [selectedSource, setSelectedSource] = useState<SourceFilter>('all');
  const roomsInitialized = useRef(false);
  const usersInitialized = useRef(false);

  const monthOptions = useMemo(
    () =>
      Array.from({ length: 6 }).map((_, index) => {
        const date = subMonths(today, 5 - index);
        return {
          value: format(date, 'yyyy-MM'),
          label: format(date, 'MMMM yyyy'),
          date,
        };
      }),
    [today],
  );

  const { data, isLoading, isError, refetch, isFetching } = useQuery<InsightPayload>({
    queryKey: ['admin-insight-dashboard'],
    queryFn: async () => {
      const session = authService.getSession();
      if (!session) throw new Error('No session');

      const rangeStart = startOfMonth(subMonths(today, 5));
      const rangeEnd = endOfMonth(today);

      const [roomsResponse, reportResponse] = await Promise.all([
        supabase.functions.invoke('manage-rooms', {
          body: { operation: 'list_all_desks' },
          headers: { 'x-session-token': session.token },
        }),
        supabase.functions.invoke('manage-reservations', {
          body: {
            operation: 'export_bi_report',
            data: {
              date_start: format(rangeStart, 'yyyy-MM-dd'),
              date_end: format(rangeEnd, 'yyyy-MM-dd'),
              report_type: 'daily',
            },
          },
          headers: { 'x-session-token': session.token },
        }),
      ]);

      if (roomsResponse.error) throw roomsResponse.error;
      if (reportResponse.error) throw reportResponse.error;

      return {
        rooms: roomsResponse.data || [],
        rows: reportResponse.data?.rows || [],
        generatedAt: reportResponse.data?.generated_at || new Date().toISOString(),
      };
    },
    enabled: !!user && user.role === 'admin',
  });

  const roomOptions = useMemo(
    () =>
      (data?.rooms || [])
        .map((room) => ({ label: room.name, value: room.id }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [data?.rooms],
  );

  const userOptions = useMemo(() => {
    const uniqueUsers = new Map<string, string>();
    (data?.rows || []).forEach((row) => {
      if (!row.user_id) return;
      const label = row.user_full_name?.trim() || row.username?.trim() || row.user_id;
      if (!uniqueUsers.has(row.user_id)) {
        uniqueUsers.set(row.user_id, label);
      }
    });

    return Array.from(uniqueUsers.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [data?.rows]);

  useEffect(() => {
    if (!roomsInitialized.current && roomOptions.length > 0) {
      setSelectedRoomIds(roomOptions.map((room) => room.value));
      roomsInitialized.current = true;
    }
  }, [roomOptions]);

  useEffect(() => {
    if (!usersInitialized.current && userOptions.length > 0) {
      setSelectedUserIds(userOptions.map((person) => person.value));
      usersInitialized.current = true;
    }
  }, [userOptions]);

  const insight = useMemo(() => {
    const rooms = data?.rooms || [];
    const uniqueRows = buildDailyUniqueRows(data?.rows || []).filter((row) =>
      isItalianWorkingDay(parseISO(row.occupancy_date)),
    );
    const selectedMonthDate = parseISO(`${selectedMonth}-01`);
    const selectedMonthLabel = format(selectedMonthDate, 'MMMM yyyy');
    const isCurrentMonth = selectedMonth === currentMonthValue;
    const roomIdSet = new Set(selectedRoomIds);
    const userIdSet = new Set(selectedUserIds);
    const selectedRooms = rooms.filter((room) => roomIdSet.has(room.id));
    const selectedTotalDesks = selectedRooms.reduce((sum, room) => sum + room.desks.length, 0);
    const filteredBaseRows = uniqueRows.filter((row) => {
      const matchesRoom = roomIdSet.has(row.room_id);
      const matchesUser = userIdSet.has(row.user_id);
      const matchesSource = selectedSource === 'all' || row.source_type === selectedSource;
      return matchesRoom && matchesUser && matchesSource;
    });

    const selectedMonthRows = filteredBaseRows.filter((row) => row.month === selectedMonth);
    const workingDaysInMonth = eachDayOfInterval({
      start: startOfMonth(selectedMonthDate),
      end: isCurrentMonth ? today : endOfMonth(selectedMonthDate),
    }).filter(isItalianWorkingDay);
    const snapshotDate = workingDaysInMonth[workingDaysInMonth.length - 1] || (isCurrentMonth ? today : endOfMonth(selectedMonthDate));
    const snapshotDateStr = format(snapshotDate, 'yyyy-MM-dd');
    const snapshotRows = selectedMonthRows.filter((row) => row.occupancy_date === snapshotDateStr);
    const elapsedWindowDays = workingDaysInMonth.length;
    const uniqueBookers = new Set(selectedMonthRows.map((row) => row.user_id).filter(Boolean)).size;
    const occupiedSnapshot = snapshotRows.length;
    const occupancySnapshot = selectedTotalDesks > 0 ? (occupiedSnapshot / selectedTotalDesks) * 100 : 0;
    const availabilitySnapshot = selectedTotalDesks > 0 ? ((selectedTotalDesks - occupiedSnapshot) / selectedTotalDesks) * 100 : 0;

    const roomSnapshotMap = new Map<string, number>();
    snapshotRows.forEach((row) => {
      roomSnapshotMap.set(row.room_id, (roomSnapshotMap.get(row.room_id) || 0) + 1);
    });

    const snapshotRooms = selectedRooms
      .map((room) => {
        const occupied = roomSnapshotMap.get(room.id) || 0;
        const capacity = room.desks.length;
        const free = Math.max(capacity - occupied, 0);
        const utilization = capacity > 0 ? (occupied / capacity) * 100 : 0;
        return {
          id: room.id,
          name: room.name,
          occupied,
          capacity,
          free,
          utilization,
        };
      })
      .sort((a, b) => b.utilization - a.utilization);

    const monthlyTrend = monthOptions.map((month) => {
      const monthRows = filteredBaseRows.filter((row) => row.month === month.value);
      const isMonthCurrent = month.value === currentMonthValue;
      const visibleMonthEnd = isMonthCurrent ? today : endOfMonth(month.date);
      const days = countItalianWorkingDays(startOfMonth(month.date), visibleMonthEnd);
      const capacity = selectedTotalDesks * days;

      return {
        label: format(month.date, 'MMM'),
        deskDays: monthRows.length,
        utilization: capacity > 0 ? Math.round((monthRows.length / capacity) * 100) : 0,
        users: new Set(monthRows.map((row) => row.user_id).filter(Boolean)).size,
      };
    });

    const weekdayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
    const weekdayOccurrences = eachDayOfInterval({
      start: startOfMonth(selectedMonthDate),
      end: isCurrentMonth ? today : endOfMonth(selectedMonthDate),
    }).filter(isItalianWorkingDay).reduce<Record<number, number>>((acc, day) => {
      const weekday = day.getDay();
      acc[weekday] = (acc[weekday] || 0) + 1;
      return acc;
    }, {});

    const weekdayDemandMap = selectedMonthRows.reduce<Record<number, number>>((acc, row) => {
      const weekday = parseISO(row.occupancy_date).getDay();
      acc[weekday] = (acc[weekday] || 0) + 1;
      return acc;
    }, {});

    const weekdayIndexes = [1, 2, 3, 4, 5];
    const weekdayData = weekdayIndexes.map((weekday, index) => {
      const averageDeskDays = (weekdayDemandMap[weekday] || 0) / Math.max(weekdayOccurrences[weekday] || 1, 1);
      return {
        label: weekdayLabels[index],
        averageDeskDays: Math.round(averageDeskDays * 10) / 10,
      };
    });

    const busiestWeekday = [...weekdayData].sort((a, b) => b.averageDeskDays - a.averageDeskDays)[0];

    const sourceMixMap = selectedMonthRows.reduce<Record<string, number>>((acc, row) => {
      acc[row.source_type] = (acc[row.source_type] || 0) + 1;
      return acc;
    }, {});

    const sourceMix = [
      { name: 'Flexible bookings', value: sourceMixMap.reservation || 0 },
      { name: 'Fixed assignments', value: sourceMixMap.fixed_assignment || 0 },
    ];

    const roomMonthMap = new Map<string, number>();
    selectedMonthRows.forEach((row) => {
      roomMonthMap.set(row.room_id, (roomMonthMap.get(row.room_id) || 0) + 1);
    });

    const topRooms = selectedRooms
      .map((room) => {
        const deskDays = roomMonthMap.get(room.id) || 0;
        const capacity = room.desks.length * elapsedWindowDays;
        return {
          id: room.id,
          name: room.name,
          deskDays,
          utilization: capacity > 0 ? (deskDays / capacity) * 100 : 0,
          avgDailyBooked: elapsedWindowDays > 0 ? deskDays / elapsedWindowDays : 0,
        };
      })
      .sort((a, b) => b.utilization - a.utilization)
      .slice(0, 5);

    const dailyLoadMap = new Map<string, number>();
    selectedMonthRows.forEach((row) => {
      dailyLoadMap.set(row.occupancy_date, (dailyLoadMap.get(row.occupancy_date) || 0) + 1);
    });

    const peakDay = Array.from(dailyLoadMap.entries())
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => b.count - a.count)[0];

    const pressureRooms = snapshotRooms.filter((room) => room.utilization >= 80).length;
    const activeRooms = snapshotRooms.filter((room) => room.occupied > 0).length;
    const averageDailyDemand = elapsedWindowDays > 0 ? selectedMonthRows.length / elapsedWindowDays : 0;
    const primaryRoom = topRooms[0];
    const snapshotPulse = snapshotRooms.slice(0, 4);
    const selectedEntityLabel =
      selectedSource === 'all'
        ? 'all occupancy'
        : selectedSource === 'reservation'
          ? 'flexible bookings'
          : 'fixed assignments';

    return {
      totalDesks: selectedTotalDesks,
      occupiedSnapshot,
      availabilitySnapshot,
      occupancySnapshot,
      uniqueBookers,
      deskDaysInMonth: selectedMonthRows.length,
      pressureRooms,
      activeRooms,
      monthlyTrend,
      weekdayData,
      busiestWeekday,
      sourceMix,
      topRooms,
      peakDay,
      snapshotPulse,
      primaryRoom,
      averageDailyDemand,
      generatedAt: data?.generatedAt || new Date().toISOString(),
      selectedMonthLabel,
      snapshotDateStr,
      selectedEntityLabel,
      roomsCount: selectedRooms.length,
      peopleCount: selectedUserIds.length,
      hasRows: selectedMonthRows.length > 0,
    };
  }, [currentMonthValue, data?.generatedAt, data?.rooms, data?.rows, monthOptions, selectedMonth, selectedRoomIds, selectedSource, selectedUserIds, today]);

  if (!user) return null;

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-sm text-slate-500">Loading insight dashboard...</div>
      </div>
    );
  }

  if (isError || !insight) {
    return (
      <Card className="border-red-100 bg-red-50">
        <CardContent className="p-6">
          <h1 className="text-lg font-semibold text-red-900">Insight unavailable</h1>
          <p className="mt-2 text-sm text-red-700">
            The admin insight dashboard could not be loaded right now.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden border-0 bg-[radial-gradient(circle_at_top_left,_rgba(129,140,248,0.22),_transparent_30%),radial-gradient(circle_at_80%_20%,_rgba(34,197,94,0.16),_transparent_20%),linear-gradient(135deg,#0f172a_0%,#1d4ed8_45%,#7c3aed_100%)] text-white shadow-xl">
        <CardContent className="p-6 md:p-8">
          <div className="flex flex-col gap-8 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-3xl">
              <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-blue-50 backdrop-blur">
                <BrainCircuit className="h-3.5 w-3.5" />
                Admin Insight
              </div>
              <h1 className="text-3xl font-semibold tracking-tight md:text-5xl">
                Read workspace demand with real operational context.
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-blue-50/88 md:text-base">
                Filter the signal by month, room, people, and occupancy type to understand pressure, adoption,
                and where desk demand is concentrating.
              </p>
              <div className="mt-6 flex flex-wrap items-center gap-3">
                <Badge className="rounded-full bg-white/15 px-3 py-1 text-white hover:bg-white/20">
                  Updated {format(parseISO(insight.generatedAt), 'dd MMM yyyy, HH:mm')}
                </Badge>
                <Badge className="rounded-full bg-emerald-400/15 px-3 py-1 text-emerald-50 hover:bg-emerald-400/20">
                  {insight.selectedMonthLabel}
                </Badge>
                <Badge className="rounded-full bg-white/10 px-3 py-1 text-blue-50 hover:bg-white/15">
                  {insight.selectedEntityLabel}
                </Badge>
                <Badge className="rounded-full bg-white/10 px-3 py-1 text-blue-50 hover:bg-white/15">
                  Italian working calendar
                </Badge>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-3xl border border-white/15 bg-white/10 p-4 backdrop-blur">
                <p className="text-xs uppercase tracking-[0.18em] text-blue-100/75">Busiest weekday</p>
                <div className="mt-2 text-2xl font-semibold">{insight.busiestWeekday?.label || 'N/A'}</div>
                <p className="mt-2 text-sm text-blue-50/80">
                  averages {insight.busiestWeekday?.averageDeskDays || 0} occupied desks per day.
                </p>
              </div>
              <div className="rounded-3xl border border-white/15 bg-white/10 p-4 backdrop-blur">
                <p className="text-xs uppercase tracking-[0.18em] text-blue-100/75">Snapshot date</p>
                <div className="mt-2 text-2xl font-semibold">
                  {format(parseISO(insight.snapshotDateStr), 'dd MMM yyyy')}
                </div>
                <p className="mt-2 text-sm text-blue-50/80">
                  {insight.roomsCount} rooms and {insight.peopleCount} people currently in scope.
                </p>
              </div>
            </div>
          </div>

          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild className="rounded-full bg-white text-slate-900 hover:bg-blue-50">
              <Link to="/planner">
                Open Planner
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button asChild variant="ghost" className="rounded-full border border-white/20 bg-white/10 text-white hover:bg-white/15">
              <Link to="/rooms">Manage Rooms</Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-slate-200 bg-white shadow-sm">
        <CardContent className="p-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Filters</p>
              <h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-950">Slice the workspace signal</h2>
              <p className="mt-1 text-sm text-slate-500">
                Every metric and chart below responds to these filters and excludes non-working days.
              </p>
            </div>

            <Button
              variant="outline"
              className="rounded-full"
              onClick={() => {
                setSelectedMonth(currentMonthValue);
                setSelectedRoomIds(roomOptions.map((room) => room.value));
                setSelectedUserIds(userOptions.map((person) => person.value));
                setSelectedSource('all');
              }}
            >
              Reset filters
            </Button>
          </div>

          <div className="mt-5 grid gap-3 lg:grid-cols-2 xl:grid-cols-[220px_minmax(0,1fr)_minmax(0,1fr)_420px]">
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Month</p>
              <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                <SelectTrigger className="h-10 rounded-2xl border-slate-200">
                  <SelectValue placeholder="Select month" />
                </SelectTrigger>
                <SelectContent>
                  {monthOptions.map((month) => (
                    <SelectItem key={month.value} value={month.value}>
                      {month.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Rooms</p>
              <MultiSelectFilter
                options={roomOptions}
                selected={selectedRoomIds}
                onChange={setSelectedRoomIds}
                placeholder="Filter rooms"
              />
            </div>

            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">People</p>
              <MultiSelectFilter
                options={userOptions}
                selected={selectedUserIds}
                onChange={setSelectedUserIds}
                placeholder="Filter people"
              />
            </div>

            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Occupancy type</p>
              <div className="flex h-10 flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-1">
                {SOURCE_FILTERS.map((source) => (
                  <button
                    key={source.value}
                    type="button"
                    onClick={() => setSelectedSource(source.value)}
                    className={`rounded-xl px-3 py-1.5 text-sm font-medium transition-colors ${
                      selectedSource === source.value
                        ? 'bg-white text-slate-950 shadow-sm'
                        : 'text-slate-500 hover:text-slate-900'
                    }`}
                  >
                    {source.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
            <div className="flex flex-wrap items-center gap-3">
              <span>{insight.roomsCount} rooms selected</span>
              <span className="text-slate-300">|</span>
              <span>{insight.peopleCount} people selected</span>
              <span className="text-slate-300">|</span>
              <span>{insight.selectedMonthLabel}</span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="rounded-full text-slate-600 hover:text-slate-950"
              onClick={() => refetch()}
              disabled={isFetching}
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
              Refresh data
            </Button>
          </div>
        </CardContent>
      </Card>

      {!insight.hasRows ? (
        <Card className="border-slate-200 bg-white shadow-sm">
          <CardContent className="p-8 text-center">
            <p className="text-lg font-semibold text-slate-950">No data for the current filter set</p>
            <p className="mt-2 text-sm text-slate-500">
              Try broadening rooms, people, or occupancy type to see insight cards and charts again.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <InsightMetric
              label="Desk-days in month"
              value={compactNumber(insight.deskDaysInMonth)}
              detail={`Occupied desk-days in ${insight.selectedMonthLabel.toLowerCase()} for the current filters.`}
              accent="bg-blue-50 text-blue-700"
            />
            <InsightMetric
              label="Unique people"
              value={String(insight.uniqueBookers)}
              detail="Distinct people active in the filtered month and selected scope."
              accent="bg-emerald-50 text-emerald-700"
            />
            <InsightMetric
              label="Busy rooms at snapshot"
              value={String(insight.pressureRooms)}
              detail="Rooms above 80% utilization on the selected snapshot date."
              accent="bg-amber-50 text-amber-700"
            />
            <InsightMetric
              label="Average daily demand"
              value={insight.averageDailyDemand.toFixed(1)}
              detail="Average occupied desk-days per working day over the selected month window."
              accent="bg-violet-50 text-violet-700"
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_360px]">
            <Card className="overflow-hidden border-slate-200 bg-white shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center justify-between text-lg">
                  Occupancy momentum
                  <TrendingUp className="h-5 w-5 text-slate-400" />
                </CardTitle>
                <p className="text-sm text-slate-500">
                  Six-month trend filtered by rooms, people, and occupancy type on Italian working days.
                </p>
              </CardHeader>
              <CardContent>
                <div className="h-[320px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={insight.monthlyTrend}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                      <XAxis dataKey="label" tickLine={false} axisLine={false} />
                      <YAxis yAxisId="left" tickLine={false} axisLine={false} />
                      <YAxis yAxisId="right" orientation="right" tickLine={false} axisLine={false} unit="%" />
                      <Tooltip
                        contentStyle={{
                          borderRadius: 16,
                          border: '1px solid #e2e8f0',
                          boxShadow: '0 18px 50px rgba(15, 23, 42, 0.12)',
                        }}
                      />
                      <Area
                        yAxisId="left"
                        type="monotone"
                        dataKey="deskDays"
                        stroke="#2563eb"
                        fill="url(#insightAreaFill)"
                        strokeWidth={3}
                      />
                      <Line
                        yAxisId="right"
                        type="monotone"
                        dataKey="utilization"
                        stroke="#8b5cf6"
                        strokeWidth={3}
                        dot={{ r: 4, fill: '#8b5cf6' }}
                      />
                      <defs>
                        <linearGradient id="insightAreaFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#60a5fa" stopOpacity={0.35} />
                          <stop offset="95%" stopColor="#60a5fa" stopOpacity={0.03} />
                        </linearGradient>
                      </defs>
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card className="border-slate-200 bg-white shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center justify-between text-lg">
                  Snapshot pulse
                  <Gauge className="h-5 w-5 text-slate-400" />
                </CardTitle>
                <p className="text-sm text-slate-500">
                  Utilization for {format(parseISO(insight.snapshotDateStr), 'dd MMM yyyy')}.
                </p>
              </CardHeader>
              <CardContent className="space-y-5">
                <div>
                  <div className="flex items-end justify-between">
                    <div>
                      <p className="text-sm text-slate-500">Occupancy</p>
                      <p className="text-4xl font-semibold tracking-tight text-slate-950">
                        {formatPercent(insight.occupancySnapshot)}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-blue-50 px-3 py-2 text-right">
                      <p className="text-xs uppercase tracking-[0.16em] text-blue-700">Open seats</p>
                      <p className="text-lg font-semibold text-blue-950">
                        {Math.max(insight.totalDesks - insight.occupiedSnapshot, 0)}
                      </p>
                    </div>
                  </div>
                  <div className="mt-4 h-3 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-[linear-gradient(90deg,#2563eb_0%,#7c3aed_100%)]"
                      style={{ width: `${Math.min(insight.occupancySnapshot, 100)}%` }}
                    />
                  </div>
                </div>

                <div className="grid gap-3">
                  {insight.snapshotPulse.map((room) => (
                    <div key={room.id} className="rounded-2xl border border-slate-100 bg-slate-50/90 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-slate-900">{room.name}</p>
                          <p className="text-xs text-slate-500">{room.occupied} occupied, {room.free} free</p>
                        </div>
                        <Badge variant="secondary" className="rounded-full bg-white text-slate-700">
                          {formatPercent(room.utilization)}
                        </Badge>
                      </div>
                      <div className="mt-3 h-2 overflow-hidden rounded-full bg-white">
                        <div
                          className="h-full rounded-full bg-[linear-gradient(90deg,#22c55e_0%,#f59e0b_55%,#ef4444_100%)]"
                          style={{ width: `${Math.min(room.utilization, 100)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)_360px]">
            <Card className="border-slate-200 bg-white shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center justify-between text-lg">
                  Weekday demand
                  <CalendarDays className="h-5 w-5 text-slate-400" />
                </CardTitle>
                <p className="text-sm text-slate-500">
                  Average occupied desks by weekday for {insight.selectedMonthLabel.toLowerCase()}, excluding weekends and Italian holidays.
                </p>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={insight.weekdayData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                      <XAxis dataKey="label" tickLine={false} axisLine={false} />
                      <YAxis tickLine={false} axisLine={false} />
                      <Tooltip
                        contentStyle={{
                          borderRadius: 16,
                          border: '1px solid #e2e8f0',
                          boxShadow: '0 18px 50px rgba(15, 23, 42, 0.12)',
                        }}
                      />
                      <Bar dataKey="averageDeskDays" radius={[10, 10, 4, 4]} fill="#2563eb" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card className="border-slate-200 bg-white shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center justify-between text-lg">
                  Room ranking
                  <Flame className="h-5 w-5 text-slate-400" />
                </CardTitle>
                <p className="text-sm text-slate-500">
                  Highest utilization rooms in the selected month.
                </p>
              </CardHeader>
              <CardContent className="space-y-3">
                {insight.topRooms.map((room, index) => (
                  <div key={room.id} className="rounded-3xl border border-slate-100 bg-slate-50/80 p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                          {String(index + 1).padStart(2, '0')}
                        </p>
                        <p className="mt-2 truncate text-sm font-semibold text-slate-900">{room.name}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          {room.deskDays} desk-days, {room.avgDailyBooked.toFixed(1)} avg booked desks/day
                        </p>
                      </div>
                      <Badge variant="secondary" className="rounded-full bg-white text-slate-700">
                        {formatPercent(room.utilization)}
                      </Badge>
                    </div>
                    <div className="mt-4 h-2 overflow-hidden rounded-full bg-white">
                      <div
                        className="h-full rounded-full bg-[linear-gradient(90deg,#2563eb_0%,#8b5cf6_100%)]"
                        style={{ width: `${Math.min(room.utilization, 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <div className="space-y-4">
              <Card className="border-slate-200 bg-white shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center justify-between text-lg">
                    Occupancy mix
                    <Sparkles className="h-5 w-5 text-slate-400" />
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="h-[200px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={insight.sourceMix}
                          dataKey="value"
                          nameKey="name"
                          innerRadius={52}
                          outerRadius={82}
                          paddingAngle={4}
                        >
                          {insight.sourceMix.map((entry, index) => (
                            <Cell key={entry.name} fill={MIX_COLORS[index % MIX_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{
                            borderRadius: 16,
                            border: '1px solid #e2e8f0',
                            boxShadow: '0 18px 50px rgba(15, 23, 42, 0.12)',
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="space-y-3">
                    {insight.sourceMix.map((item, index) => (
                      <div key={item.name} className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3">
                        <div className="flex items-center gap-3">
                          <span className="h-3 w-3 rounded-full" style={{ backgroundColor: MIX_COLORS[index % MIX_COLORS.length] }} />
                          <span className="text-sm font-medium text-slate-700">{item.name}</span>
                        </div>
                        <span className="text-sm font-semibold text-slate-950">{compactNumber(item.value)}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card className="border-slate-200 bg-white shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center justify-between text-lg">
                    Planning cues
                    <Activity className="h-5 w-5 text-slate-400" />
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 text-sm text-slate-600">
                  <div className="rounded-2xl bg-blue-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-700">Primary room</p>
                    <p className="mt-2 leading-6 text-blue-950">
                      {insight.primaryRoom
                        ? `${insight.primaryRoom.name} is leading the filtered month at ${formatPercent(insight.primaryRoom.utilization)} utilization.`
                        : 'No room signal available for the current filters.'}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-emerald-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Adoption</p>
                    <p className="mt-2 leading-6 text-emerald-950">
                      {insight.uniqueBookers} people generated {compactNumber(insight.deskDaysInMonth)} desk-days in {insight.selectedMonthLabel.toLowerCase()}.
                    </p>
                  </div>
                  <div className="rounded-2xl bg-amber-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">Pressure</p>
                    <p className="mt-2 leading-6 text-amber-950">
                      {insight.pressureRooms > 0
                        ? `${insight.pressureRooms} rooms are above the 80% pressure threshold on the selected snapshot.`
                        : 'No room has crossed the 80% pressure threshold in the current snapshot.'}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
