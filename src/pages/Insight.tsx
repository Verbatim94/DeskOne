import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from 'recharts';
import { endOfMonth, format, parseISO, startOfMonth, subMonths } from 'date-fns';
import { Activity, CalendarDays, ChevronDown, Flame, Gauge, RefreshCw, ShieldCheck, SlidersHorizontal, TrendingDown, TrendingUp } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MultiSelectFilter } from '@/components/MultiSelectFilter';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
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

interface RawOccupancyRow {
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
  date_start: string;
  date_end: string;
  month: string;
  year: number;
  created_at: string;
  approved_at: string | null;
  approved_by: string | null;
  approved_by_name: string | null;
}

interface DailyOccupancyRow extends RawOccupancyRow {
  occupancy_date: string;
  weekday_index: number;
  weekday_name: string;
  is_weekend: boolean;
}

type InsightPayload = {
  rooms: RoomStructure[];
  rows: RawOccupancyRow[];
  generatedAt: string;
};

function formatPercent(value: number) {
  return `${Math.round(value)}%`;
}

function compactNumber(value: number) {
  return new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}

function buildDailyUniqueRows(rows: DailyOccupancyRow[]) {
  const uniqueMap = new Map<string, DailyOccupancyRow>();

  rows.forEach((row) => {
    const deskIdentity = row.desk_id || row.desk_label || row.reservation_id;
    const key = `${row.room_id}-${deskIdentity}-${row.occupancy_date}`;
    if (!uniqueMap.has(key)) {
      uniqueMap.set(key, row);
    }
  });

  return Array.from(uniqueMap.values());
}

function getOccupancyMonth(row: DailyOccupancyRow) {
  return row.occupancy_date.slice(0, 7);
}

function expandRawRowsToBusinessDaily(rows: RawOccupancyRow[]) {
  const weekdayLabels = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const expandedRows: DailyOccupancyRow[] = [];

  rows.forEach((row) => {
    let cursor = parseISO(row.date_start);
    const end = parseISO(row.date_end);

    while (cursor <= end) {
      const occupancyDate = format(cursor, 'yyyy-MM-dd');
      const weekdayIndex = cursor.getDay();

      if (isItalianBusinessDay(occupancyDate)) {
        expandedRows.push({
          ...row,
          occupancy_date: occupancyDate,
          weekday_index: weekdayIndex,
          weekday_name: weekdayLabels[weekdayIndex],
          is_weekend: weekdayIndex === 0 || weekdayIndex === 6,
          month: occupancyDate.slice(0, 7),
          year: Number.parseInt(occupancyDate.slice(0, 4), 10),
        });
      }

      cursor = new Date(cursor);
      cursor.setDate(cursor.getDate() + 1);
    }
  });

  return expandedRows;
}

function getHeatSurface(intensity: number) {
  if (intensity >= 0.95) {
    return {
      background: 'linear-gradient(180deg, #1f1235 0%, #2b1750 100%)',
      borderColor: '#241248',
      textClassName: 'text-white',
      captionClassName: 'text-violet-100/90',
      shadow: '0 14px 28px rgba(43, 23, 80, 0.32)',
    };
  }
  if (intensity >= 0.75) {
    return {
      background: 'linear-gradient(180deg, #5b21b6 0%, #7c3aed 100%)',
      borderColor: '#6d28d9',
      textClassName: 'text-white',
      captionClassName: 'text-violet-100/90',
      shadow: '0 12px 24px rgba(124, 58, 237, 0.28)',
    };
  }
  if (intensity >= 0.5) {
    return {
      background: 'linear-gradient(180deg, #8b5cf6 0%, #a78bfa 100%)',
      borderColor: '#8b5cf6',
      textClassName: 'text-white',
      captionClassName: 'text-violet-100/85',
      shadow: '0 10px 20px rgba(139, 92, 246, 0.22)',
    };
  }
  if (intensity > 0) {
    return {
      background: 'linear-gradient(180deg, #ede9fe 0%, #ddd6fe 100%)',
      borderColor: '#d8b4fe',
      textClassName: 'text-slate-900',
      captionClassName: 'text-violet-900/65',
      shadow: '0 8px 18px rgba(139, 92, 246, 0.12)',
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

function getRoomBubbleColor(fixedShare: number, utilization: number) {
  if (utilization >= 80) return '#4f46e5';
  if (fixedShare >= 60) return '#7c3aed';
  if (utilization >= 45) return '#8b5cf6';
  return '#c4b5fd';
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
        <div className="text-[28px] font-semibold tracking-tight text-slate-950 md:text-[30px]">{value}</div>
        <p className="mt-2 max-w-xs text-[12px] leading-5 text-slate-500">{detail}</p>
      </CardContent>
    </Card>
  );
}

function FilterChip({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/90 px-3 py-1.5 text-[11px] text-slate-600 shadow-[0_6px_18px_rgba(15,23,42,0.04)]">
      <span className="font-semibold uppercase tracking-[0.18em] text-slate-400">{label}</span>
      <span className="max-w-[180px] truncate font-medium text-slate-900">{value}</span>
    </div>
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
  const [filtersOpen, setFiltersOpen] = useState(false);
  const roomsInitialized = useRef(false);
  const usersInitialized = useRef(false);

  const monthOptions = INSIGHT_MONTH_OPTIONS;
  const trendMonths = useMemo(() => {
    const selectedDate = parseISO(`${selectedMonth}-01`);

    return Array.from({ length: 6 }, (_, index) => {
      const date = startOfMonth(subMonths(selectedDate, 5 - index));
      return {
        value: format(date, 'yyyy-MM'),
        label: format(date, 'MMMM yyyy'),
        date,
      };
    });
  }, [selectedMonth]);

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
              report_type: 'raw',
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
    const uniqueRows = buildDailyUniqueRows(expandRawRowsToBusinessDaily(data?.rows || []));
    const selectedMonthDate = parseISO(`${selectedMonth}-01`);
    const selectedMonthLabel = format(selectedMonthDate, 'MMMM yyyy');
    const roomIdSet = new Set(selectedRoomIds);
    const userIdSet = new Set(selectedUserIds);
    const selectedRooms = rooms.filter((room) => roomIdSet.has(room.id));
    const selectedTotalDesks = selectedRooms.reduce((sum, room) => sum + room.desks.length, 0);
    const roomFilteredRows = uniqueRows.filter((row) => roomIdSet.has(row.room_id));
    const peopleFilteredRows = roomFilteredRows.filter((row) => userIdSet.has(row.user_id));

    const selectedMonthRoomRows = roomFilteredRows.filter((row) => getOccupancyMonth(row) === selectedMonth);
    const selectedMonthPeopleRows = peopleFilteredRows.filter((row) => getOccupancyMonth(row) === selectedMonth);
    const workingDaysInMonth = getBusinessDaysBetween(startOfMonth(selectedMonthDate), endOfMonth(selectedMonthDate));
    const elapsedWindowDays = workingDaysInMonth.length;
    const uniqueBookers = new Set(selectedMonthPeopleRows.map((row) => row.user_id).filter(Boolean)).size;

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
      const monthRows = roomFilteredRows.filter((row) => getOccupancyMonth(row) === month.value);
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

    const weekdayDemandMap = selectedMonthRoomRows.reduce<Record<number, number>>((acc, row) => {
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

    const roomMonthMap = new Map<string, number>();
    selectedMonthRoomRows.forEach((row) => {
      roomMonthMap.set(row.room_id, (roomMonthMap.get(row.room_id) || 0) + 1);
    });

    const roomUniqueUsersMap = new Map<string, Set<string>>();
    const roomFixedDeskDaysMap = new Map<string, number>();
    selectedMonthRoomRows.forEach((row) => {
      if (!roomUniqueUsersMap.has(row.room_id)) {
        roomUniqueUsersMap.set(row.room_id, new Set());
      }
      if (row.user_id) {
        roomUniqueUsersMap.get(row.room_id)?.add(row.user_id);
      }
      if (row.source_type === 'fixed_assignment') {
        roomFixedDeskDaysMap.set(row.room_id, (roomFixedDeskDaysMap.get(row.room_id) || 0) + 1);
      }
    });

    const roomDayOccupancyMap = new Map<string, number>();
    selectedMonthRoomRows.forEach((row) => {
      const key = `${row.room_id}-${row.occupancy_date}`;
      roomDayOccupancyMap.set(key, (roomDayOccupancyMap.get(key) || 0) + 1);
    });

    const selectedMonthRoomMetrics = computeContextMetrics(selectedMonthRoomRows, selectedMonthDate);
    const selectedMonthPeopleMetrics = computeContextMetrics(selectedMonthPeopleRows, selectedMonthDate);
    const averageFullRoomDaysPercentage = selectedMonthRoomMetrics.averageFullRoomDaysPercentage;
    const averagePersonOccupancyPercentage = selectedMonthPeopleMetrics.averagePersonOccupancyPercentage;
    const averageBookedDaysPerPerson = selectedMonthPeopleMetrics.averageBookedDaysPerPerson;
    const averageReservedDesks = elapsedWindowDays > 0 ? selectedMonthRoomRows.length / elapsedWindowDays : 0;
    const averageOpenDesks = Math.max(selectedTotalDesks - averageReservedDesks, 0);
    const monthlyOccupancyRate = selectedTotalDesks > 0 ? (averageReservedDesks / selectedTotalDesks) * 100 : 0;

    const roomMonthlySummaries = selectedRooms
      .map((room) => {
        const deskDays = roomMonthMap.get(room.id) || 0;
        const capacity = room.desks.length * elapsedWindowDays;
        const fixedDeskDays = roomFixedDeskDaysMap.get(room.id) || 0;
        const uniquePeople = roomUniqueUsersMap.get(room.id)?.size || 0;
        return {
          id: room.id,
          name: room.name,
          deskDays,
          totalPossibleDeskDays: capacity,
          utilization: capacity > 0 ? (deskDays / capacity) * 100 : 0,
          avgDailyBooked: elapsedWindowDays > 0 ? deskDays / elapsedWindowDays : 0,
          totalDesks: room.desks.length,
          uniquePeople,
          fixedShare: deskDays > 0 ? (fixedDeskDays / deskDays) * 100 : 0,
        };
      })
      .sort((a, b) => b.utilization - a.utilization);

    const topRooms = roomMonthlySummaries
      .slice(0, 5);

    const bottomRooms = [...roomMonthlySummaries]
      .sort((a, b) => a.utilization - b.utilization)
      .slice(0, 5);

    const dailyLoadMap = new Map<string, number>();
    selectedMonthRoomRows.forEach((row) => {
      dailyLoadMap.set(row.occupancy_date, (dailyLoadMap.get(row.occupancy_date) || 0) + 1);
    });

    const peakDay = Array.from(dailyLoadMap.entries())
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => b.count - a.count)[0];

    const pressureRooms = roomMonthlySummaries.filter((room) => room.utilization >= 80).length;
    const activeRooms = roomMonthlySummaries.filter((room) => room.deskDays > 0).length;
    const averageDailyDemand = elapsedWindowDays > 0 ? selectedMonthRoomRows.length / elapsedWindowDays : 0;
    const primaryRoom = topRooms[0];
    const selectedEntityLabel = 'reserved desks';

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
    const roomOpportunityMap = roomMonthlySummaries.map((room) => ({
      id: room.id,
      name: room.name,
      x: Math.round(room.utilization * 10) / 10,
      y: room.uniquePeople,
      z: Math.max(room.totalDesks, 1),
      fixedShare: Math.round(room.fixedShare),
      avgDailyBooked: Math.round(room.avgDailyBooked * 10) / 10,
      deskDays: room.deskDays,
      fill: getRoomBubbleColor(room.fixedShare, room.utilization),
    }));

    return {
      totalDesks: selectedTotalDesks,
      averageReservedDesks,
      averageOpenDesks,
      monthlyOccupancyRate,
      averageFullRoomDaysPercentage,
      uniqueBookers,
      averagePersonOccupancyPercentage,
      averageBookedDaysPerPerson,
      roomDeskDaysInMonth: selectedMonthRoomRows.length,
      peopleDeskDaysInMonth: selectedMonthPeopleRows.length,
      pressureRooms,
      activeRooms,
      monthlyTrend,
      weekdayData,
      busiestWeekday,
      topRooms,
      bottomRooms,
      peakDay,
      roomMonthlySummaries,
      primaryRoom,
      averageDailyDemand,
      workingCalendarWeeks,
      roomOpportunityMap,
      generatedAt: data?.generatedAt || new Date().toISOString(),
      selectedMonthLabel,
      selectedEntityLabel,
      roomsCount: selectedRooms.length,
      peopleCount: selectedUserIds.length,
      hasRows: selectedMonthRoomRows.length > 0,
      businessDaysInMonth: elapsedWindowDays,
    };
  }, [data?.generatedAt, data?.rooms, data?.rows, selectedMonth, selectedRoomIds, selectedUserIds, trendMonths]);

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
    <div className="space-y-4">
      <Card className="overflow-hidden border border-slate-200/80 bg-[radial-gradient(circle_at_top_left,_rgba(59,130,246,0.08),_transparent_26%),linear-gradient(180deg,#ffffff_0%,#fbfcff_100%)] shadow-[0_24px_60px_rgba(15,23,42,0.07)]">
        <CardContent className="p-4 md:p-5">
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
                <h1 className="text-xl font-semibold tracking-tight text-slate-950 md:text-2xl">
                  Workspace insight
                </h1>
                <p className="mt-1 max-w-3xl text-[12px] leading-5 text-slate-500">
                  A compact view of occupancy, adoption, and pressure across the selected workspace context.
                </p>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-3 xl:w-[520px] xl:max-w-full">
              <div className="min-w-0 rounded-[24px] border border-slate-200/80 bg-white/90 p-4 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Updated</p>
                <p className="mt-2 text-[12px] font-semibold text-slate-900">
                  {format(parseISO(insight.generatedAt), 'dd MMM yyyy, HH:mm')}
                </p>
              </div>
              <div className="min-w-0 rounded-[24px] border border-slate-200/80 bg-white/90 p-4 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Busiest day</p>
                <p className="mt-2 text-[12px] font-semibold text-slate-900">{insight.busiestWeekday?.label || 'N/A'}</p>
                <p className="mt-1 text-xs text-slate-500">{insight.busiestWeekday?.averageDeskDays || 0} avg desks</p>
              </div>
              <div className="min-w-0 rounded-[24px] border border-slate-200/80 bg-white/90 p-4 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Scope</p>
                <p className="mt-2 text-[12px] font-semibold text-slate-900">
                  {insight.roomsCount} rooms / {insight.peopleCount} people filter
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border border-slate-200/80 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.05)]">
        <CardContent className="p-4">
          <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen} className="space-y-4">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div className="space-y-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">Filters</p>
                  <h2 className="mt-1 text-base font-semibold tracking-tight text-slate-950">Context controls</h2>
                  <p className="mt-1 text-[12px] text-slate-500">
                    Metrics respond to month, rooms, and people. A desk counts as occupied whenever it is reserved.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <FilterChip label="Month" value={insight.selectedMonthLabel} />
                  <FilterChip label="Rooms" value={`${insight.roomsCount} selected`} />
                  <FilterChip label="People" value={`${insight.peopleCount} in filter`} />
                  <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-[11px] font-medium text-emerald-700">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    reserved desks only
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
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
                  }}
                >
                  Reset
                </Button>
                <CollapsibleTrigger asChild>
                  <Button variant="outline" className="rounded-full border-slate-200 bg-white shadow-[0_8px_18px_rgba(15,23,42,0.05)]">
                    <SlidersHorizontal className="mr-2 h-4 w-4" />
                    Filters
                    <ChevronDown className={`ml-2 h-4 w-4 transition-transform ${filtersOpen ? 'rotate-180' : ''}`} />
                  </Button>
                </CollapsibleTrigger>
              </div>
            </div>

            <CollapsibleContent>
              <div className="grid gap-3 rounded-[26px] border border-slate-200/70 bg-[radial-gradient(circle_at_top_left,_rgba(99,102,241,0.05),_transparent_22%),linear-gradient(180deg,#fbfcff_0%,#f8fafc_100%)] p-3.5 sm:grid-cols-2 xl:grid-cols-[220px_minmax(0,1fr)_minmax(0,1fr)]">
                <div className="space-y-2 min-w-0">
                  <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Month</p>
                  <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                    <SelectTrigger className="h-11 rounded-[18px] border-slate-200 bg-white shadow-[0_6px_16px_rgba(15,23,42,0.04)]">
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
                    className="h-11 rounded-[18px] border-slate-200 bg-white text-[12px] shadow-[0_6px_16px_rgba(15,23,42,0.04)]"
                    popoverClassName="rounded-[20px] border-slate-200 shadow-[0_22px_50px_rgba(15,23,42,0.12)]"
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
                    className="h-11 rounded-[18px] border-slate-200 bg-white text-[12px] shadow-[0_6px_16px_rgba(15,23,42,0.04)]"
                    popoverClassName="rounded-[20px] border-slate-200 shadow-[0_22px_50px_rgba(15,23,42,0.12)]"
                    searchPlaceholder="Search people..."
                    emptyText="No person found."
                  />
                </div>
              </div>
            </CollapsibleContent>

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-[20px] border border-slate-200/70 bg-slate-50/70 px-4 py-3 text-[12px] text-slate-600">
              <div className="flex flex-wrap items-center gap-3">
                <span>{insight.roomsCount} rooms selected</span>
                <span className="text-slate-300">|</span>
                <span>{insight.peopleCount} people in filter</span>
                <span className="text-slate-300">|</span>
                <span>{insight.selectedMonthLabel}</span>
              </div>
              <span className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">
                business-day model
              </span>
            </div>
          </Collapsible>
        </CardContent>
      </Card>

      <Card className="border border-slate-200/80 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.05)]">
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">Metric audit</p>
              <h2 className="mt-1 text-base font-semibold tracking-tight text-slate-950">Calculation checks</h2>
              <p className="mt-1 text-[12px] text-slate-500">
                Quick references to validate the denominator and the scope used by the KPI cards.
              </p>
            </div>
            <ShieldCheck className="mt-1 h-5 w-5 text-slate-400" />
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl border border-slate-200/70 bg-slate-50/70 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Working days</p>
              <p className="mt-2 text-lg font-semibold text-slate-950">{insight.businessDaysInMonth}</p>
              <p className="mt-1 text-[11px] text-slate-500">Italian business days in the selected month.</p>
            </div>
            <div className="rounded-2xl border border-slate-200/70 bg-slate-50/70 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Reserved desk-days</p>
              <p className="mt-2 text-lg font-semibold text-slate-950">{insight.roomDeskDaysInMonth}</p>
              <p className="mt-1 text-[11px] text-slate-500">Total reserved desk-days across the selected rooms, before applying the people filter.</p>
            </div>
            <div className="rounded-2xl border border-slate-200/70 bg-slate-50/70 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Active people</p>
              <p className="mt-2 text-lg font-semibold text-slate-950">{insight.uniqueBookers}</p>
              <p className="mt-1 text-[11px] text-slate-500">People with at least one reserved day inside the selected people filter.</p>
            </div>
            <div className="rounded-2xl border border-slate-200/70 bg-slate-50/70 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">KPI rule</p>
              <p className="mt-2 text-[12px] font-semibold text-slate-950">Reserved = occupied</p>
              <p className="mt-1 text-[11px] text-slate-500">Standard bookings and fixed assignments are merged into one occupancy model.</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {!insight.hasRows ? (
        <Card className="border-slate-200 bg-white shadow-sm">
          <CardContent className="p-8 text-center">
            <p className="text-lg font-semibold text-slate-950">No data for the current filter set</p>
            <p className="mt-2 text-[12px] text-slate-500">
              Try broadening rooms or people to see insight cards and charts again.
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
              detail="Distinct people who made at least one booking inside the selected people filter."
              accent="bg-emerald-50 text-emerald-700"
            />
            <InsightMetric
              label="Avg person occupancy"
              value={formatPercent(insight.averagePersonOccupancyPercentage)}
              detail="Average share of working days with a booked desk per active person inside the selected people filter."
              accent="bg-amber-50 text-amber-700"
            />
            <InsightMetric
              label="Avg booked days / person"
              value={insight.averageBookedDaysPerPerson.toFixed(1)}
              detail="Average number of booked working days per active person inside the filtered month."
              accent="bg-violet-50 text-violet-700"
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,0.95fr)]">
            <Card className="min-w-0 overflow-hidden border-slate-200 bg-white shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center justify-between text-base">
                  Occupancy momentum
                  <TrendingUp className="h-5 w-5 text-slate-400" />
                </CardTitle>
                <p className="text-[12px] text-slate-500">
                  Top: average desk booking rate. Bottom: unique people active in the selected room context over time.
                </p>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="rounded-[28px] border border-slate-100 bg-slate-50/40 p-4 md:p-5">
                  <div className="mb-3 flex items-center justify-between">
                    <div>
                      <p className="text-[13px] font-medium text-slate-900">Desk booking rate</p>
                      <p className="text-[11px] text-slate-500">
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
                        <YAxis tickLine={false} axisLine={false} unit="%" domain={[0, 100]} ticks={[0, 20, 40, 60, 80, 100]} />
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
                  <div className="rounded-[28px] border border-slate-100 bg-slate-50/40 p-4 md:p-5">
                  <div className="mb-3 flex items-center justify-between">
                    <div>
                      <p className="text-[13px] font-medium text-slate-900">People connected to selected rooms</p>
                      <p className="text-[11px] text-slate-500">
                        Unique active people across the selected rooms, limited by the selected people filter.
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
                        <YAxis tickLine={false} axisLine={false} allowDecimals={false} domain={[0, 100]} ticks={[0, 20, 40, 60, 80, 100]} />
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
                </div>
              </CardContent>
            </Card>

            <Card className="min-w-0 border-slate-200 bg-white shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center justify-between text-base">
                  Snapshot pulse
                  <Gauge className="h-5 w-5 text-slate-400" />
                </CardTitle>
                <p className="text-[12px] text-slate-500">
                  Average reserved desks across {insight.selectedMonthLabel.toLowerCase()} for the full selected rooms scope.
                </p>
              </CardHeader>
              <CardContent className="space-y-5">
                <div>
                  <div className="flex items-end justify-between">
                    <div>
                      <p className="text-[12px] text-slate-500">Average reserved desks</p>
                      <p className="text-4xl font-semibold tracking-tight text-slate-950">
                        {insight.averageReservedDesks.toFixed(1)}
                      </p>
                      <p className="mt-2 text-[11px] text-slate-500">
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

                <div className="grid max-h-[520px] gap-3 overflow-y-auto pr-1">
                  {insight.roomMonthlySummaries.map((room) => (
                    <div key={room.id} className="rounded-2xl border border-slate-100 bg-slate-50/90 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-[12px] font-medium text-slate-900">{room.name}</p>
                          <p className="text-[11px] text-slate-500">
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

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(280px,0.9fr)]">
            <Card className="min-w-0 border-slate-200 bg-white shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center justify-between text-base">
                  Weekday demand
                  <CalendarDays className="h-5 w-5 text-slate-400" />
                </CardTitle>
                <p className="text-[12px] text-slate-500">
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

            <Card className="min-w-0 border-slate-200 bg-white shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center justify-between text-base">
                  Room ranking
                  <Flame className="h-5 w-5 text-slate-400" />
                </CardTitle>
                <p className="text-[12px] text-slate-500">
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
                        <p className="mt-2 truncate text-[12px] font-semibold text-slate-900">{room.name}</p>
                        <p className="mt-1 text-[11px] text-slate-500">
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

            <div className="min-w-0 space-y-4">
              <Card className="min-w-0 border-slate-200 bg-white shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center justify-between text-base">
                    Data model
                    <Activity className="h-5 w-5 text-slate-400" />
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="rounded-2xl bg-slate-50 px-4 py-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Occupancy rule</p>
                    <p className="mt-2 text-[12px] leading-5 text-slate-700">
                      Every metric counts a desk as occupied whenever it is reserved, regardless of whether the source row comes from a standard booking or a fixed assignment.
                    </p>
                  </div>

                  <div className="grid gap-3">
                    <div className="rounded-2xl border border-slate-100 bg-white px-4 py-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Avg. person occupancy</p>
                      <p className="mt-1 text-[12px] leading-5 text-slate-700">
                        Mean of `reserved working days / total working days` across active people in the current context.
                      </p>
                    </div>
                    <div className="rounded-2xl border border-slate-100 bg-white px-4 py-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Room utilization</p>
                      <p className="mt-1 text-[12px] leading-5 text-slate-700">
                        `Reserved desk-days / total possible desk-days`, using desks multiplied by working days in the selected month.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="min-w-0 border-slate-200 bg-white shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center justify-between text-base">
                    Planning cues
                    <Activity className="h-5 w-5 text-slate-400" />
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 text-[12px] text-slate-600">
                  <div className="rounded-2xl bg-blue-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-700">Primary room</p>
                    <p className="mt-2 leading-5 text-blue-950">
                      {insight.primaryRoom
                        ? `${insight.primaryRoom.name} is leading the filtered month at ${formatPercent(insight.primaryRoom.utilization)} utilization.`
                        : 'No room signal available for the current filters.'}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-emerald-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Adoption</p>
                    <p className="mt-2 leading-5 text-emerald-950">
                      {insight.uniqueBookers} people generated {compactNumber(insight.peopleDeskDaysInMonth)} reserved desk-days inside the selected people filter.
                    </p>
                  </div>
                  <div className="rounded-2xl bg-amber-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">Pressure</p>
                    <p className="mt-2 leading-5 text-amber-950">
                      {insight.pressureRooms > 0
                        ? `${insight.pressureRooms} rooms are above the 80% occupancy threshold across the selected month.`
                        : 'No room has crossed the 80% monthly occupancy threshold in the current context.'}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
            <Card className="min-w-0 border-slate-200 bg-white shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center justify-between text-base">
                  Working-day heatmap
                  <CalendarDays className="h-5 w-5 text-slate-400" />
                </CardTitle>
                <p className="text-[12px] text-slate-500">
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
                              className={`group relative aspect-square rounded-[22px] border p-2 transition-all duration-200 sm:p-2.5 ${heatSurface.textClassName}`}
                              style={{
                                background: heatSurface.background,
                                borderColor: heatSurface.borderColor,
                                boxShadow: heatSurface.shadow,
                              }}
                              title={`${day.date}: ${day.occupancyCount} occupied desks (${formatPercent(day.utilization * 100)})`}
                            >
                              <div className="flex h-full flex-col justify-between">
                                <span className="text-[12px] font-semibold sm:text-[13px]">{day.dayNumber}</span>
                                <div className="space-y-0.5">
                                  <p className={`text-[9px] font-medium uppercase tracking-[0.16em] ${heatSurface.captionClassName}`}>
                                    {Math.round(day.utilization * 100)}%
                                  </p>
                                  <p className={`text-[9px] ${heatSurface.captionClassName}`}>
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

            <Card className="min-w-0 border-slate-200 bg-white shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center justify-between text-base">
                  Room opportunity map
                  <TrendingDown className="h-5 w-5 text-slate-400" />
                </CardTitle>
                <p className="text-[12px] text-slate-500">
                  X = occupancy rate, Y = unique people, bubble size = room capacity. Colors highlight concentrated fixed usage.
                </p>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <ScatterChart margin={{ top: 12, right: 12, left: 0, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis
                        type="number"
                        dataKey="x"
                        name="Occupancy"
                        unit="%"
                        tickLine={false}
                        axisLine={false}
                        domain={[0, 100]}
                      />
                      <YAxis
                        type="number"
                        dataKey="y"
                        name="Unique people"
                        tickLine={false}
                        axisLine={false}
                        allowDecimals={false}
                      />
                      <ZAxis type="number" dataKey="z" range={[120, 900]} name="Desks" />
                      <Tooltip
                        cursor={{ strokeDasharray: '3 3' }}
                        contentStyle={{
                          borderRadius: 16,
                          border: '1px solid #e2e8f0',
                          boxShadow: '0 18px 50px rgba(15, 23, 42, 0.12)',
                        }}
                        formatter={(value: number, name: string) => {
                          if (name === 'Occupancy') return [`${value}%`, 'Occupancy'];
                          return [value, name];
                        }}
                        labelFormatter={(_, payload) => payload?.[0]?.payload?.name || ''}
                      />
                      <Scatter data={insight.roomOpportunityMap} shape="circle">
                        {insight.roomOpportunityMap.map((entry) => (
                          <Cell key={entry.id} fill={entry.fill} fillOpacity={0.92} stroke="#ffffff" strokeWidth={1.5} />
                        ))}
                      </Scatter>
                    </ScatterChart>
                  </ResponsiveContainer>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-3xl border border-slate-100 bg-slate-50/80 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Leaders</p>
                    <div className="mt-3 space-y-3">
                      {insight.topRooms.slice(0, 3).map((room) => (
                        <div key={room.id} className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <span className="block truncate text-[12px] font-medium text-slate-800">{room.name}</span>
                            <span className="text-[11px] text-slate-500">{room.uniquePeople} people, {room.totalDesks} desks</span>
                          </div>
                          <Badge variant="secondary" className="rounded-full bg-white text-slate-700">
                            {formatPercent(room.utilization)}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-3xl border border-slate-100 bg-slate-50/80 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Watchlist</p>
                    <div className="mt-3 space-y-3">
                      {insight.bottomRooms.slice(0, 3).map((room) => (
                        <div key={room.id} className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <span className="block truncate text-[12px] font-medium text-slate-800">{room.name}</span>
                            <span className="text-[11px] text-slate-500">{room.uniquePeople} people, {room.totalDesks} desks</span>
                          </div>
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
