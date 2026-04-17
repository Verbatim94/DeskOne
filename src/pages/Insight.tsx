import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { endOfMonth, format, parseISO, startOfMonth, subMonths } from 'date-fns';
import { Activity, CalendarDays, Flame, Gauge, RefreshCw, Sparkles, TrendingDown, TrendingUp } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MultiSelectFilter } from '@/components/MultiSelectFilter';
import { supabase } from '@/integrations/supabase/client';
import { authService } from '@/lib/auth';
import { useAuth } from '@/contexts/AuthContext';
import {
  BUSINESS_CALENDAR_END,
  BUSINESS_CALENDAR_START,
  getBusinessDaysBetween,
  INSIGHT_MONTH_OPTIONS,
  isItalianBusinessDay,
} from '@/lib/italianBusinessCalendar';

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

function getHeatSurface(intensity: number) {
  if (intensity >= 0.95) {
    return {
      background: 'linear-gradient(180deg, #7f1d1d 0%, #991b1b 100%)',
      borderColor: '#7f1d1d',
      textClassName: 'text-white',
      captionClassName: 'text-rose-100',
      shadow: '0 12px 30px rgba(127, 29, 29, 0.26)',
    };
  }
  if (intensity >= 0.75) {
    return {
      background: 'linear-gradient(180deg, #dc2626 0%, #ef4444 100%)',
      borderColor: '#dc2626',
      textClassName: 'text-white',
      captionClassName: 'text-rose-100',
      shadow: '0 10px 24px rgba(239, 68, 68, 0.24)',
    };
  }
  if (intensity >= 0.5) {
    return {
      background: 'linear-gradient(180deg, #f59e0b 0%, #f97316 100%)',
      borderColor: '#f59e0b',
      textClassName: 'text-white',
      captionClassName: 'text-amber-100',
      shadow: '0 10px 22px rgba(245, 158, 11, 0.22)',
    };
  }
  if (intensity > 0) {
    return {
      background: 'linear-gradient(180deg, #d1fae5 0%, #86efac 100%)',
      borderColor: '#86efac',
      textClassName: 'text-slate-900',
      captionClassName: 'text-emerald-900/70',
      shadow: '0 8px 18px rgba(16, 185, 129, 0.14)',
    };
  }

  return {
    background: 'linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)',
    borderColor: '#e2e8f0',
    textClassName: 'text-slate-500',
    captionClassName: 'text-slate-300',
    shadow: 'none',
  };
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
    <Card className="overflow-hidden border border-slate-200/80 bg-[linear-gradient(180deg,#ffffff_0%,#fbfdff_100%)] shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
      <CardContent className="p-5">
        <div className={`mb-4 inline-flex rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] ${accent}`}>
          {label}
        </div>
        <div className="text-3xl font-semibold tracking-tight text-slate-950 md:text-[2rem]">{value}</div>
        <p className="mt-2 max-w-xs text-sm leading-6 text-slate-500">{detail}</p>
      </CardContent>
    </Card>
  );
}

export default function Insight() {
  const { user } = useAuth();
  const today = new Date();
  const currentMonthValue = INSIGHT_MONTH_OPTIONS.some((option) => option.value === format(today, 'yyyy-MM'))
    ? format(today, 'yyyy-MM')
    : INSIGHT_MONTH_OPTIONS[0].value;
  const [selectedMonth, setSelectedMonth] = useState(currentMonthValue);
  const [selectedRoomIds, setSelectedRoomIds] = useState<string[]>([]);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [selectedSource, setSelectedSource] = useState<SourceFilter>('all');
  const roomsInitialized = useRef(false);
  const usersInitialized = useRef(false);

  const monthOptions = INSIGHT_MONTH_OPTIONS;
  const selectedMonthIndex = monthOptions.findIndex((option) => option.value === selectedMonth);
  const trendMonths =
    selectedMonthIndex >= 0
      ? monthOptions.slice(Math.max(0, selectedMonthIndex - 5), selectedMonthIndex + 1)
      : monthOptions.slice(0, 6);

  const { data, isLoading, isError, refetch, isFetching } = useQuery<InsightPayload>({
    queryKey: ['admin-insight-dashboard', selectedMonth],
    queryFn: async () => {
      const session = authService.getSession();
      if (!session) throw new Error('No session');

      const selectedMonthDate = parseISO(`${selectedMonth}-01`);
      const desiredRangeStart = startOfMonth(subMonths(selectedMonthDate, 5));
      const desiredRangeEnd = endOfMonth(selectedMonthDate);
      const rangeStart = desiredRangeStart < BUSINESS_CALENDAR_START ? BUSINESS_CALENDAR_START : desiredRangeStart;
      const rangeEnd = desiredRangeEnd > BUSINESS_CALENDAR_END ? BUSINESS_CALENDAR_END : desiredRangeEnd;

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
      isItalianBusinessDay(row.occupancy_date),
    );
    const selectedMonthDate = parseISO(`${selectedMonth}-01`);
    const selectedMonthLabel = format(selectedMonthDate, 'MMMM yyyy');
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
    const workingDaysInMonth = getBusinessDaysBetween(startOfMonth(selectedMonthDate), endOfMonth(selectedMonthDate));
    const snapshotDate = workingDaysInMonth[workingDaysInMonth.length - 1] || endOfMonth(selectedMonthDate);
    const snapshotDateStr = format(snapshotDate, 'yyyy-MM-dd');
    const elapsedWindowDays = workingDaysInMonth.length;
    const uniqueBookers = new Set(selectedMonthRows.map((row) => row.user_id).filter(Boolean)).size;

    const computeContextMetrics = (monthRows: DailyOccupancyRow[], monthDate: Date) => {
      const businessDays = getBusinessDaysBetween(startOfMonth(monthDate), endOfMonth(monthDate));
      const businessDayCount = businessDays.length;

      const monthRoomDayOccupancyMap = new Map<string, number>();
      monthRows.forEach((row) => {
        const key = `${row.room_id}-${row.occupancy_date}`;
        monthRoomDayOccupancyMap.set(key, (monthRoomDayOccupancyMap.get(key) || 0) + 1);
      });

      const fullRoomPercentages = selectedRooms.map((room) => {
        if (room.desks.length === 0 || businessDayCount === 0) return 0;

        const fullyOccupiedDays = businessDays.reduce((count, day) => {
          const dayKey = format(day, 'yyyy-MM-dd');
          const occupiedDesks = monthRoomDayOccupancyMap.get(`${room.id}-${dayKey}`) || 0;
          return count + (occupiedDesks >= room.desks.length ? 1 : 0);
        }, 0);

        return (fullyOccupiedDays / businessDayCount) * 100;
      });

      const activeUsers = Array.from(new Set(monthRows.map((row) => row.user_id).filter(Boolean)));
      const userMetrics = activeUsers.map((userId) => {
        const bookedDays = new Set(
          monthRows
            .filter((row) => row.user_id === userId)
            .map((row) => row.occupancy_date),
        ).size;

        return {
          bookedDays,
          bookedDayPercentage: businessDayCount > 0 ? (bookedDays / businessDayCount) * 100 : 0,
        };
      });

      return {
        businessDayCount,
        reservationRate:
          selectedTotalDesks > 0 && businessDayCount > 0
            ? (monthRows.length / (selectedTotalDesks * businessDayCount)) * 100
            : 0,
        averageFullRoomDaysPercentage:
          fullRoomPercentages.length > 0
            ? fullRoomPercentages.reduce((sum, value) => sum + value, 0) / fullRoomPercentages.length
            : 0,
        uniquePeople: activeUsers.length,
        averagePersonOccupancyPercentage:
          userMetrics.length > 0
            ? userMetrics.reduce((sum, item) => sum + item.bookedDayPercentage, 0) / userMetrics.length
            : 0,
        averageBookedDaysPerPerson:
          userMetrics.length > 0
            ? userMetrics.reduce((sum, item) => sum + item.bookedDays, 0) / userMetrics.length
            : 0,
      };
    };

    const monthlyTrend = trendMonths.map((month) => {
      const monthRows = filteredBaseRows.filter((row) => row.month === month.value);
      const monthMetrics = computeContextMetrics(monthRows, month.date);

      return {
        label: format(month.date, 'MMM'),
        reservationRate: Math.round(monthMetrics.reservationRate * 10) / 10,
        users: monthMetrics.uniquePeople,
      };
    });

    const weekdayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
    const weekdayOccurrences = workingDaysInMonth.reduce<Record<number, number>>((acc, day) => {
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

    const roomDayOccupancyMap = new Map<string, number>();
    selectedMonthRows.forEach((row) => {
      const key = `${row.room_id}-${row.occupancy_date}`;
      roomDayOccupancyMap.set(key, (roomDayOccupancyMap.get(key) || 0) + 1);
    });

    const selectedMonthMetrics = computeContextMetrics(selectedMonthRows, selectedMonthDate);
    const averageFullRoomDaysPercentage = selectedMonthMetrics.averageFullRoomDaysPercentage;
    const averagePersonOccupancyPercentage = selectedMonthMetrics.averagePersonOccupancyPercentage;
    const averageBookedDaysPerPerson = selectedMonthMetrics.averageBookedDaysPerPerson;
    const averageReservedDesks = elapsedWindowDays > 0 ? selectedMonthRows.length / elapsedWindowDays : 0;
    const averageOpenDesks = Math.max(selectedTotalDesks - averageReservedDesks, 0);
    const monthlyOccupancyRate = selectedTotalDesks > 0 ? (averageReservedDesks / selectedTotalDesks) * 100 : 0;

    const roomMonthlySummaries = selectedRooms
      .map((room) => {
        const deskDays = roomMonthMap.get(room.id) || 0;
        const capacity = room.desks.length * elapsedWindowDays;
        return {
          id: room.id,
          name: room.name,
          deskDays,
          totalPossibleDeskDays: capacity,
          utilization: capacity > 0 ? (deskDays / capacity) * 100 : 0,
          avgDailyBooked: elapsedWindowDays > 0 ? deskDays / elapsedWindowDays : 0,
          totalDesks: room.desks.length,
        };
      })
      .sort((a, b) => b.utilization - a.utilization);

    const topRooms = roomMonthlySummaries
      .slice(0, 5);

    const bottomRooms = [...roomMonthlySummaries]
      .sort((a, b) => a.utilization - b.utilization)
      .slice(0, 5);

    const dailyLoadMap = new Map<string, number>();
    selectedMonthRows.forEach((row) => {
      dailyLoadMap.set(row.occupancy_date, (dailyLoadMap.get(row.occupancy_date) || 0) + 1);
    });

    const peakDay = Array.from(dailyLoadMap.entries())
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => b.count - a.count)[0];

    const pressureRooms = roomMonthlySummaries.filter((room) => room.utilization >= 80).length;
    const activeRooms = roomMonthlySummaries.filter((room) => room.deskDays > 0).length;
    const averageDailyDemand = elapsedWindowDays > 0 ? selectedMonthRows.length / elapsedWindowDays : 0;
    const primaryRoom = topRooms[0];
    const selectedEntityLabel =
      selectedSource === 'all'
        ? 'all occupancy'
        : selectedSource === 'reservation'
          ? 'flexible bookings'
          : 'fixed assignments';

    const workingCalendarWeeksMap = new Map<string, {
      key: string;
      label: string;
      days: Array<{
        key: string;
        date: string;
        dayNumber: string;
        occupancyCount: number;
        utilization: number;
      } | null>;
    }>();

    workingDaysInMonth.forEach((day) => {
      const dayStr = format(day, 'yyyy-MM-dd');
      const occupancyCount = dailyLoadMap.get(dayStr) || 0;
      const utilization = selectedTotalDesks > 0 ? occupancyCount / selectedTotalDesks : 0;
      const monday = new Date(day);
      monday.setDate(day.getDate() - (day.getDay() - 1));
      const weekKey = format(monday, 'yyyy-MM-dd');

      if (!workingCalendarWeeksMap.has(weekKey)) {
        workingCalendarWeeksMap.set(weekKey, {
          key: weekKey,
          label: format(monday, 'dd MMM'),
          days: [null, null, null, null, null],
        });
      }

      const week = workingCalendarWeeksMap.get(weekKey);
      const weekdayIndex = day.getDay() - 1;
      if (week && weekdayIndex >= 0 && weekdayIndex < 5) {
        week.days[weekdayIndex] = {
          key: dayStr,
          date: dayStr,
          dayNumber: format(day, 'd'),
          occupancyCount,
          utilization,
        };
      }
    });

    const workingCalendarWeeks = Array.from(workingCalendarWeeksMap.values());

    const roomComparison = [
      ...topRooms.map((room) => ({
        name: room.name.length > 20 ? `${room.name.slice(0, 20)}…` : room.name,
        utilization: Math.round(room.utilization),
        band: 'Top rooms',
      })),
      ...bottomRooms.map((room) => ({
        name: room.name.length > 20 ? `${room.name.slice(0, 20)}…` : room.name,
        utilization: Math.round(room.utilization),
        band: 'Underused rooms',
      })),
    ];

    return {
      totalDesks: selectedTotalDesks,
      averageReservedDesks,
      averageOpenDesks,
      monthlyOccupancyRate,
      averageFullRoomDaysPercentage,
      uniqueBookers,
      averagePersonOccupancyPercentage,
      averageBookedDaysPerPerson,
      deskDaysInMonth: selectedMonthRows.length,
      pressureRooms,
      activeRooms,
      monthlyTrend,
      weekdayData,
      busiestWeekday,
      sourceMix,
      topRooms,
      bottomRooms,
      peakDay,
      roomMonthlySummaries,
      primaryRoom,
      averageDailyDemand,
      workingCalendarWeeks,
      roomComparison,
      generatedAt: data?.generatedAt || new Date().toISOString(),
      selectedMonthLabel,
      snapshotDateStr,
      selectedEntityLabel,
      roomsCount: selectedRooms.length,
      peopleCount: selectedUserIds.length,
      hasRows: selectedMonthRows.length > 0,
      businessDaysInMonth: elapsedWindowDays,
    };
  }, [data?.generatedAt, data?.rooms, data?.rows, selectedMonth, selectedRoomIds, selectedSource, selectedUserIds, trendMonths]);

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
    <div className="space-y-5">
      <Card className="overflow-hidden border border-slate-200/80 bg-[radial-gradient(circle_at_top_left,_rgba(59,130,246,0.08),_transparent_26%),linear-gradient(180deg,#ffffff_0%,#fbfcff_100%)] shadow-[0_24px_60px_rgba(15,23,42,0.07)]">
        <CardContent className="p-5 md:p-6">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-700 hover:bg-white">
                  Insight
                </Badge>
                <Badge className="rounded-full bg-slate-950 px-3 py-1 text-white hover:bg-slate-950">
                  {insight.selectedMonthLabel}
                </Badge>
                <Badge className="rounded-full bg-emerald-50 px-3 py-1 text-emerald-700 hover:bg-emerald-50">
                  {insight.selectedEntityLabel}
                </Badge>
                <Badge className="rounded-full bg-slate-100 px-3 py-1 text-slate-600 hover:bg-slate-100">
                  Italian business calendar 2026-2036
                </Badge>
              </div>

              <div>
                <h1 className="text-2xl font-semibold tracking-tight text-slate-950 md:text-3xl">
                  Workspace insight
                </h1>
                <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">
                  A compact view of occupancy, adoption, and pressure across the selected workspace context.
                </p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3 xl:min-w-[520px]">
              <div className="rounded-[24px] border border-slate-200/80 bg-white/90 p-4 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Updated</p>
                <p className="mt-2 text-sm font-semibold text-slate-900">
                  {format(parseISO(insight.generatedAt), 'dd MMM yyyy, HH:mm')}
                </p>
              </div>
              <div className="rounded-[24px] border border-slate-200/80 bg-white/90 p-4 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Busiest day</p>
                <p className="mt-2 text-sm font-semibold text-slate-900">{insight.busiestWeekday?.label || 'N/A'}</p>
                <p className="mt-1 text-xs text-slate-500">{insight.busiestWeekday?.averageDeskDays || 0} avg desks</p>
              </div>
              <div className="rounded-[24px] border border-slate-200/80 bg-white/90 p-4 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Scope</p>
                <p className="mt-2 text-sm font-semibold text-slate-900">
                  {insight.roomsCount} rooms / {insight.peopleCount} people
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border border-slate-200/80 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.05)]">
        <CardContent className="p-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">Filters</p>
              <h2 className="mt-1 text-lg font-semibold tracking-tight text-slate-950">Context controls</h2>
              <p className="mt-1 text-sm text-slate-500">
                Metrics respond to the selected month, rooms, people, and occupancy type.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="rounded-full px-4 text-slate-600 hover:text-slate-950"
                onClick={() => refetch()}
                disabled={isFetching}
              >
                <RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
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
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 2xl:grid-cols-[220px_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.2fr)]">
            <div className="space-y-2 min-w-0">
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Month</p>
              <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                <SelectTrigger className="h-11 rounded-[20px] border-slate-200 bg-slate-50/60">
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

            <div className="space-y-2 min-w-0">
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Rooms</p>
              <MultiSelectFilter
                options={roomOptions}
                selected={selectedRoomIds}
                onChange={setSelectedRoomIds}
                placeholder="Filter rooms"
                searchPlaceholder="Search rooms..."
                emptyText="No room found."
              />
            </div>

            <div className="space-y-2 min-w-0">
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">People</p>
              <MultiSelectFilter
                options={userOptions}
                selected={selectedUserIds}
                onChange={setSelectedUserIds}
                placeholder="Filter people"
                searchPlaceholder="Search people..."
                emptyText="No person found."
              />
            </div>

            <div className="space-y-2 min-w-0">
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Occupancy type</p>
              <div className="flex min-h-11 flex-wrap items-center gap-2 rounded-[20px] border border-slate-200 bg-slate-50/70 p-1.5">
                {SOURCE_FILTERS.map((source) => (
                  <button
                    key={source.value}
                    type="button"
                    onClick={() => setSelectedSource(source.value)}
                    className={`rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
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

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-[20px] border border-slate-200/70 bg-slate-50/70 px-4 py-3 text-sm text-slate-600">
            <div className="flex flex-wrap items-center gap-3">
              <span>{insight.roomsCount} rooms selected</span>
              <span className="text-slate-300">|</span>
              <span>{insight.peopleCount} people selected</span>
              <span className="text-slate-300">|</span>
              <span>{insight.selectedMonthLabel}</span>
            </div>
            <span className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">
              business-day model
            </span>
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
              label="Full-room days"
              value={formatPercent(insight.averageFullRoomDaysPercentage)}
              detail="Average share of working days with selected rooms fully occupied. With multiple rooms, the dashboard averages the room percentages."
              accent="bg-blue-50 text-blue-700"
            />
            <InsightMetric
              label="Unique people"
              value={String(insight.uniqueBookers)}
              detail="Distinct people who made at least one booking inside the current filter context."
              accent="bg-emerald-50 text-emerald-700"
            />
            <InsightMetric
              label="Avg person occupancy"
              value={formatPercent(insight.averagePersonOccupancyPercentage)}
              detail="Average share of working days with a booked desk per active person in the current filter context."
              accent="bg-amber-50 text-amber-700"
            />
            <InsightMetric
              label="Avg booked days / person"
              value={insight.averageBookedDaysPerPerson.toFixed(1)}
              detail="Average number of booked working days per active person inside the filtered month."
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
                  Top: average desk booking rate. Bottom: unique people active in the selected room context over time.
                </p>
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <div className="mb-3 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-slate-900">Desk booking rate</p>
                      <p className="text-xs text-slate-500">
                        Occupied desk-days / total available desk-days in the selected scope.
                      </p>
                    </div>
                    <Badge variant="secondary" className="rounded-full bg-blue-50 text-blue-700">
                      %
                    </Badge>
                  </div>
                  <div className="h-[220px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={insight.monthlyTrend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                        <XAxis dataKey="label" tickLine={false} axisLine={false} />
                        <YAxis tickLine={false} axisLine={false} unit="%" />
                        <Tooltip
                          formatter={(value: number) => [`${value}%`, 'Booking rate']}
                          contentStyle={{
                            borderRadius: 16,
                            border: '1px solid #e2e8f0',
                            boxShadow: '0 18px 50px rgba(15, 23, 42, 0.12)',
                          }}
                        />
                        <Line
                          type="monotone"
                          dataKey="reservationRate"
                          stroke="#2563eb"
                          strokeWidth={3}
                          dot={{ r: 4, fill: '#2563eb' }}
                          activeDot={{ r: 6 }}
                          name="Booking rate"
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="border-t border-slate-100 pt-6">
                  <div className="mb-3 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-slate-900">People connected to selected rooms</p>
                      <p className="text-xs text-slate-500">
                        Unique active people across the selected rooms and filters, month by month.
                      </p>
                    </div>
                    <Badge variant="secondary" className="rounded-full bg-emerald-50 text-emerald-700">
                      Count
                    </Badge>
                  </div>
                  <div className="h-[220px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={insight.monthlyTrend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                        <XAxis dataKey="label" tickLine={false} axisLine={false} />
                        <YAxis tickLine={false} axisLine={false} allowDecimals={false} />
                        <Tooltip
                          formatter={(value: number) => [value, 'Unique people']}
                          contentStyle={{
                            borderRadius: 16,
                            border: '1px solid #e2e8f0',
                            boxShadow: '0 18px 50px rgba(15, 23, 42, 0.12)',
                          }}
                        />
                        <Line
                          type="monotone"
                          dataKey="users"
                          stroke="#10b981"
                          strokeWidth={3}
                          dot={{ r: 4, fill: '#10b981' }}
                          activeDot={{ r: 6 }}
                          name="Unique people"
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
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
                  Average reserved desks across {insight.selectedMonthLabel.toLowerCase()} in the current filter context.
                </p>
              </CardHeader>
              <CardContent className="space-y-5">
                <div>
                  <div className="flex items-end justify-between">
                    <div>
                      <p className="text-sm text-slate-500">Average reserved desks</p>
                      <p className="text-4xl font-semibold tracking-tight text-slate-950">
                        {insight.averageReservedDesks.toFixed(1)}
                      </p>
                      <p className="mt-2 text-sm text-slate-500">
                        out of {insight.totalDesks} total desks on average
                      </p>
                    </div>
                    <div className="rounded-2xl bg-blue-50 px-3 py-2 text-right">
                      <p className="text-xs uppercase tracking-[0.16em] text-blue-700">Average open desks</p>
                      <p className="text-lg font-semibold text-blue-950">
                        {insight.averageOpenDesks.toFixed(1)}
                      </p>
                    </div>
                  </div>
                  <div className="mt-4 h-3 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-[linear-gradient(90deg,#2563eb_0%,#7c3aed_100%)]"
                      style={{ width: `${Math.min(insight.monthlyOccupancyRate, 100)}%` }}
                    />
                  </div>
                </div>

                <div className="grid gap-3">
                  {insight.roomMonthlySummaries.map((room) => (
                    <div key={room.id} className="rounded-2xl border border-slate-100 bg-slate-50/90 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-slate-900">{room.name}</p>
                          <p className="text-xs text-slate-500">
                            {room.deskDays} reserved desk-days / {room.totalPossibleDeskDays} possible
                          </p>
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
                  Highest room utilization based on booked desk-days / total available desk-days in the selected month.
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
                        ? `${insight.pressureRooms} rooms are above the 80% occupancy threshold across the selected month.`
                        : 'No room has crossed the 80% monthly occupancy threshold in the current context.'}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
            <Card className="border-slate-200 bg-white shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center justify-between text-lg">
                  Working-day heatmap
                  <CalendarDays className="h-5 w-5 text-slate-400" />
                </CardTitle>
                <p className="text-sm text-slate-500">
                  Calendar view of daily occupancy intensity across the working days of {insight.selectedMonthLabel.toLowerCase()}.
                </p>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="rounded-[28px] border border-slate-100 bg-[linear-gradient(180deg,#ffffff_0%,#f8fbff_100%)] p-4 shadow-[0_18px_40px_rgba(15,23,42,0.06)] sm:p-5">
                    <div className="grid grid-cols-5 gap-2 sm:gap-3">
                      {['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].map((label) => (
                        <div
                          key={label}
                          className="pb-1 text-center text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400"
                        >
                          {label}
                        </div>
                      ))}

                      {insight.workingCalendarWeeks.flatMap((week) =>
                        week.days.map((day, index) => {
                          if (!day) {
                            return (
                              <div
                                key={`${week.key}-${index}`}
                                className="aspect-square rounded-[22px] border border-dashed border-slate-200/80 bg-slate-50/70"
                              />
                            );
                          }

                          const heatSurface = getHeatSurface(day.utilization);

                          return (
                            <div
                              key={day.key}
                              className={`group relative aspect-square rounded-[22px] border p-2.5 transition-all duration-200 sm:p-3 ${heatSurface.textClassName}`}
                              style={{
                                background: heatSurface.background,
                                borderColor: heatSurface.borderColor,
                                boxShadow: heatSurface.shadow,
                              }}
                              title={`${day.date}: ${day.occupancyCount} occupied desks (${formatPercent(day.utilization * 100)})`}
                            >
                              <div className="flex h-full flex-col justify-between">
                                <span className="text-sm font-semibold sm:text-base">{day.dayNumber}</span>
                                <div className="space-y-0.5">
                                  <p className={`text-[10px] font-medium uppercase tracking-[0.16em] ${heatSurface.captionClassName}`}>
                                    {Math.round(day.utilization * 100)}%
                                  </p>
                                  <p className={`text-[10px] ${heatSurface.captionClassName}`}>
                                    {day.occupancyCount} reserved
                                  </p>
                                </div>
                              </div>
                            </div>
                          );
                        }),
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
                    <span className="font-medium text-slate-600">Intensity</span>
                    <div className="flex items-center gap-2"><span className="h-3 w-3 rounded-full border border-slate-200 bg-white" />0%</div>
                    <div className="flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-emerald-300" />Low</div>
                    <div className="flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-amber-400" />Medium</div>
                    <div className="flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-red-500" />High</div>
                    <div className="flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-red-900" />Critical</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-slate-200 bg-white shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center justify-between text-lg">
                  Top vs underused rooms
                  <TrendingDown className="h-5 w-5 text-slate-400" />
                </CardTitle>
                <p className="text-sm text-slate-500">
                  Compare where booked desk-days are concentrating and where business-day capacity stays underused.
                </p>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="h-[260px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={insight.roomComparison} layout="vertical" margin={{ left: 8, right: 12 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                      <XAxis type="number" tickLine={false} axisLine={false} unit="%" />
                      <YAxis dataKey="name" type="category" tickLine={false} axisLine={false} width={138} />
                      <Tooltip
                        contentStyle={{
                          borderRadius: 16,
                          border: '1px solid #e2e8f0',
                          boxShadow: '0 18px 50px rgba(15, 23, 42, 0.12)',
                        }}
                      />
                      <Bar dataKey="utilization" radius={[0, 8, 8, 0]} barSize={18}>
                        {insight.roomComparison.map((entry) => (
                          <Cell
                            key={`${entry.band}-${entry.name}`}
                            fill={entry.band === 'Top rooms' ? '#2563eb' : '#cbd5e1'}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-3xl border border-slate-100 bg-slate-50/80 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Top rooms</p>
                    <div className="mt-3 space-y-3">
                      {insight.topRooms.slice(0, 3).map((room) => (
                        <div key={room.id} className="flex items-center justify-between gap-3">
                          <span className="truncate text-sm font-medium text-slate-800">{room.name}</span>
                          <Badge variant="secondary" className="rounded-full bg-white text-slate-700">
                            {formatPercent(room.utilization)}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-3xl border border-slate-100 bg-slate-50/80 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Underused rooms</p>
                    <div className="mt-3 space-y-3">
                      {insight.bottomRooms.slice(0, 3).map((room) => (
                        <div key={room.id} className="flex items-center justify-between gap-3">
                          <span className="truncate text-sm font-medium text-slate-800">{room.name}</span>
                          <Badge variant="secondary" className="rounded-full bg-white text-slate-700">
                            {formatPercent(room.utilization)}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
