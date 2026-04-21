import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, LabelList, Pie, PieChart, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from 'recharts';
import { endOfMonth, endOfWeek, format, parseISO, startOfMonth, startOfWeek, subMonths, subWeeks } from 'date-fns';
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
  buildDailyUniqueRows,
  buildDeskMonthlySummaries,
  buildRoomAdoptionSummaries,
  buildRoomEligibleUsersMap,
  buildRoomMonthlySummaries,
  buildRowsByMonthMap,
  buildRowsByRangeMap,
  buildSelectedMonthRoomIndexes,
  buildWeekdayDemandSummary,
  buildWorkingCalendarWeeks,
  computeContextMetrics,
  countUniqueUsers,
  expandRawRowsToBusinessDaily,
} from '@/features/insight/metrics';
import {
  FilterChip,
  getHeatSurface,
  getRoomBubbleColor,
  InsightMetric,
} from '@/features/insight/presentation';
import type { InsightPayload } from '@/features/insight/types';
import {
  BUSINESS_CALENDAR_END,
  BUSINESS_CALENDAR_START,
  getBusinessDaysBetween,
  INSIGHT_MONTH_OPTIONS,
} from '@/lib/italianBusinessCalendar';

function formatPercent(value: number) {
  return `${Math.round(value)}%`;
}

function compactNumber(value: number) {
  return new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}

function formatSignedNumber(value: number, maximumFractionDigits = 0) {
  const sign = value > 0 ? '+' : value < 0 ? '−' : '';
  const absolute = Math.abs(value);
  return `${sign}${absolute.toLocaleString('en-US', { maximumFractionDigits, minimumFractionDigits: maximumFractionDigits > 0 ? maximumFractionDigits : 0 })}`;
}

function formatSignedDelta(value: number, maximumFractionDigits = 0) {
  const sign = value > 0 ? '+' : value < 0 ? '-' : '';
  const absolute = Math.abs(value);
  return `${sign}${absolute.toLocaleString('en-US', { maximumFractionDigits, minimumFractionDigits: maximumFractionDigits > 0 ? maximumFractionDigits : 0 })}`;
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
  const [trendGranularity, setTrendGranularity] = useState<'monthly' | 'weekly'>('monthly');
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

  const trendWeeks = useMemo(() => {
    const selectedDate = parseISO(`${selectedMonth}-01`);
    const selectedMonthEnd = endOfMonth(selectedDate);

    return Array.from({ length: 6 }, (_, index) => {
      const anchor = subWeeks(selectedMonthEnd, 5 - index);
      const dateStart = startOfWeek(anchor, { weekStartsOn: 1 });
      const dateEnd = endOfWeek(anchor, { weekStartsOn: 1 });
      return {
        value: format(dateStart, 'yyyy-MM-dd'),
        label: format(dateStart, 'dd MMM'),
        dateStart,
        dateEnd,
        startValue: format(dateStart, 'yyyy-MM-dd'),
        endValue: format(dateEnd, 'yyyy-MM-dd'),
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

      const [roomsResponse, accessResponse, reportResponse] = await Promise.all([
        supabase.functions.invoke('manage-rooms', {
          body: { operation: 'list_all_desks' },
          headers: { 'x-session-token': session.token },
        }),
        supabase.functions.invoke('manage-rooms', {
          body: { operation: 'list_all_room_access' },
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
      if (accessResponse.error) throw accessResponse.error;
      if (reportResponse.error) throw reportResponse.error;

      return {
        rooms: roomsResponse.data || [],
        rows: reportResponse.data?.rows || [],
        roomAccess: accessResponse.data || [],
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

  const rooms = data?.rooms || [];
  const roomAccess = data?.roomAccess || [];
  const rawRows = data?.rows || [];
  const selectedMonthDate = useMemo(() => parseISO(`${selectedMonth}-01`), [selectedMonth]);
  const selectedMonthLabel = useMemo(() => format(selectedMonthDate, 'MMMM yyyy'), [selectedMonthDate]);
  const uniqueRows = useMemo(() => buildDailyUniqueRows(expandRawRowsToBusinessDaily(rawRows)), [rawRows]);
  const selectedRoomIdSet = useMemo(() => new Set(selectedRoomIds), [selectedRoomIds]);
  const selectedUserIdSet = useMemo(() => new Set(selectedUserIds), [selectedUserIds]);
  const selectedRooms = useMemo(
    () => rooms.filter((room) => selectedRoomIdSet.has(room.id)),
    [rooms, selectedRoomIdSet],
  );
  const selectedTotalDesks = useMemo(
    () => selectedRooms.reduce((sum, room) => sum + room.desks.length, 0),
    [selectedRooms],
  );
  const roomFilteredRows = useMemo(
    () => uniqueRows.filter((row) => selectedRoomIdSet.has(row.room_id)),
    [uniqueRows, selectedRoomIdSet],
  );
  const peopleFilteredRows = useMemo(
    () => roomFilteredRows.filter((row) => selectedUserIdSet.has(row.user_id)),
    [roomFilteredRows, selectedUserIdSet],
  );
  const roomRowsByMonth = useMemo(() => buildRowsByMonthMap(roomFilteredRows), [roomFilteredRows]);
  const peopleRowsByMonth = useMemo(() => buildRowsByMonthMap(peopleFilteredRows), [peopleFilteredRows]);
  const roomRowsByWeek = useMemo(() => buildRowsByRangeMap(roomFilteredRows, trendWeeks), [roomFilteredRows, trendWeeks]);
  const peopleRowsByWeek = useMemo(() => buildRowsByRangeMap(peopleFilteredRows, trendWeeks), [peopleFilteredRows, trendWeeks]);
  const selectedMonthRoomRows = useMemo(
    () => roomRowsByMonth.get(selectedMonth) || [],
    [roomRowsByMonth, selectedMonth],
  );
  const selectedMonthPeopleRows = useMemo(
    () => peopleRowsByMonth.get(selectedMonth) || [],
    [peopleRowsByMonth, selectedMonth],
  );
  const workingDaysInMonth = useMemo(
    () => getBusinessDaysBetween(startOfMonth(selectedMonthDate), endOfMonth(selectedMonthDate)),
    [selectedMonthDate],
  );
  const elapsedWindowDays = workingDaysInMonth.length;
  const uniqueBookers = useMemo(
    () => countUniqueUsers(selectedMonthPeopleRows),
    [selectedMonthPeopleRows],
  );
  const selectedMonthRoomIndexes = useMemo(
    () => buildSelectedMonthRoomIndexes(selectedMonthRoomRows),
    [selectedMonthRoomRows],
  );
  const roomEligibleUsersMap = useMemo(
    () => buildRoomEligibleUsersMap(roomAccess, selectedRoomIdSet),
    [roomAccess, selectedRoomIdSet],
  );
  const eligiblePeopleCount = useMemo(
    () =>
      new Set(
        Array.from(roomEligibleUsersMap.values()).flatMap((users) => Array.from(users)),
      ).size,
    [roomEligibleUsersMap],
  );

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
    const previousMonthDate = startOfMonth(subMonths(selectedMonthDate, 1));
    const hasPreviousMonth = previousMonthDate >= BUSINESS_CALENDAR_START;
    const previousMonthValue = format(previousMonthDate, 'yyyy-MM');
    const previousMonthLabel = format(previousMonthDate, 'MMM');

    const monthlyTrend = trendMonths.map((month) => {
      const monthRoomRows = roomRowsByMonth.get(month.value) || [];
      const monthPeopleRows = peopleRowsByMonth.get(month.value) || [];
      const monthRoomMetrics = computeContextMetrics(
        monthRoomRows,
        selectedRooms,
        selectedTotalDesks,
        startOfMonth(month.date),
        endOfMonth(month.date),
      );
      const monthPeopleMetrics = computeContextMetrics(
        monthPeopleRows,
        selectedRooms,
        selectedTotalDesks,
        startOfMonth(month.date),
        endOfMonth(month.date),
      );

      return {
        label: format(month.date, 'MMM'),
        reservationRate: Math.round(monthRoomMetrics.reservationRate * 10) / 10,
        users: monthPeopleMetrics.uniquePeople,
        eligibleUsers: eligiblePeopleCount,
      };
    });

    const weeklyTrend = trendWeeks.map((week) => {
      const weekStart = week.dateStart;
      const weekEnd = week.dateEnd;
      const weekRoomRows = roomRowsByWeek.get(week.value) || [];
      const weekPeopleRows = peopleRowsByWeek.get(week.value) || [];
      const weekRoomMetrics = computeContextMetrics(weekRoomRows, selectedRooms, selectedTotalDesks, weekStart, weekEnd);
      const weekPeopleMetrics = computeContextMetrics(
        weekPeopleRows,
        selectedRooms,
        selectedTotalDesks,
        weekStart,
        weekEnd,
      );

      return {
        label: week.label,
        reservationRate: Math.round(weekRoomMetrics.reservationRate * 10) / 10,
        users: weekPeopleMetrics.uniquePeople,
        eligibleUsers: eligiblePeopleCount,
      };
    });

    const { weekdayData, busiestWeekday, weekdayAxisMax, weekdayAverage } = buildWeekdayDemandSummary(
      workingDaysInMonth,
      selectedMonthRoomRows,
    );

    const {
      roomMonthMap,
      roomUniqueUsersMap,
      roomFixedDeskDaysMap,
      roomDayOccupancyMap,
      roomAdoptionBookedUsersMap,
      deskReservedDaysMap,
      dailyLoadMap,
      userDeskDayCounts,
    } = selectedMonthRoomIndexes;

    const selectedMonthRoomMetrics = computeContextMetrics(
      selectedMonthRoomRows,
      selectedRooms,
      selectedTotalDesks,
      startOfMonth(selectedMonthDate),
      endOfMonth(selectedMonthDate),
    );
    const selectedMonthPeopleMetrics = computeContextMetrics(
      selectedMonthPeopleRows,
      selectedRooms,
      selectedTotalDesks,
      startOfMonth(selectedMonthDate),
      endOfMonth(selectedMonthDate),
    );
    const averageFullRoomDaysPercentage = selectedMonthRoomMetrics.averageFullRoomDaysPercentage;
    const averagePersonOccupancyPercentage = selectedMonthPeopleMetrics.averagePersonOccupancyPercentage;
    const averageBookedDaysPerPerson = selectedMonthPeopleMetrics.averageBookedDaysPerPerson;
    const averageReservedDesks = elapsedWindowDays > 0 ? selectedMonthRoomRows.length / elapsedWindowDays : 0;
    const averageOpenDesks = Math.max(selectedTotalDesks - averageReservedDesks, 0);
    const monthlyOccupancyRate = selectedTotalDesks > 0 ? (averageReservedDesks / selectedTotalDesks) * 100 : 0;

    const previousMonthRoomRows = hasPreviousMonth ? roomRowsByMonth.get(previousMonthValue) || [] : [];
    const previousMonthPeopleRows = hasPreviousMonth ? peopleRowsByMonth.get(previousMonthValue) || [] : [];
    const previousMonthRoomMetrics = hasPreviousMonth
      ? computeContextMetrics(
          previousMonthRoomRows,
          selectedRooms,
          selectedTotalDesks,
          startOfMonth(previousMonthDate),
          endOfMonth(previousMonthDate),
        )
      : null;
    const previousMonthPeopleMetrics = hasPreviousMonth
      ? computeContextMetrics(
          previousMonthPeopleRows,
          selectedRooms,
          selectedTotalDesks,
          startOfMonth(previousMonthDate),
          endOfMonth(previousMonthDate),
        )
      : null;
    const previousMonthUniqueBookers = hasPreviousMonth
      ? countUniqueUsers(previousMonthPeopleRows)
      : 0;

    const metricDeltas = {
      averageFullRoomDaysPercentage: previousMonthRoomMetrics
        ? averageFullRoomDaysPercentage - previousMonthRoomMetrics.averageFullRoomDaysPercentage
        : null,
      uniqueBookers: previousMonthPeopleMetrics ? uniqueBookers - previousMonthUniqueBookers : null,
      averagePersonOccupancyPercentage: previousMonthPeopleMetrics
        ? averagePersonOccupancyPercentage - previousMonthPeopleMetrics.averagePersonOccupancyPercentage
        : null,
      averageBookedDaysPerPerson: previousMonthPeopleMetrics
        ? averageBookedDaysPerPerson - previousMonthPeopleMetrics.averageBookedDaysPerPerson
        : null,
    };

    const roomMonthlySummaries = buildRoomMonthlySummaries(
      selectedRooms,
      elapsedWindowDays,
      roomMonthMap,
      roomFixedDeskDaysMap,
      roomUniqueUsersMap,
    );

    const topRooms = roomMonthlySummaries
      .slice(0, 5);

    const bottomRooms = [...roomMonthlySummaries]
      .sort((a, b) => a.utilization - b.utilization)
      .slice(0, 5);

    const roomAdoptionSummaries = buildRoomAdoptionSummaries(
      selectedRooms,
      roomAdoptionBookedUsersMap,
      roomEligibleUsersMap,
    );

    const roomScopeUniqueBookers = countUniqueUsers(selectedMonthRoomRows);
    const adoptionCoverageRate = eligiblePeopleCount > 0 ? (roomScopeUniqueBookers / eligiblePeopleCount) * 100 : 0;
    const inactiveEligiblePeople = Math.max(eligiblePeopleCount - roomScopeUniqueBookers, 0);

    const deskMonthlySummaries = buildDeskMonthlySummaries(selectedRooms, elapsedWindowDays, deskReservedDaysMap);

    const coldDeskThreshold = 20;
    const idleDeskCount = deskMonthlySummaries.filter((desk) => desk.reservedDays === 0).length;
    const coldDeskCount = deskMonthlySummaries.filter((desk) => desk.utilization < coldDeskThreshold).length;
    const coldDeskLeaders = deskMonthlySummaries.slice(0, 6);

    const peakDay = Array.from(dailyLoadMap.entries())
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => b.count - a.count)[0];

    const pressure80Days = workingDaysInMonth.reduce((count, day) => {
      const dayKey = format(day, 'yyyy-MM-dd');
      const occupiedDesks = dailyLoadMap.get(dayKey) || 0;
      const utilization = selectedTotalDesks > 0 ? occupiedDesks / selectedTotalDesks : 0;
      return count + (utilization >= 0.8 ? 1 : 0);
    }, 0);
    const pressure90Days = workingDaysInMonth.reduce((count, day) => {
      const dayKey = format(day, 'yyyy-MM-dd');
      const occupiedDesks = dailyLoadMap.get(dayKey) || 0;
      const utilization = selectedTotalDesks > 0 ? occupiedDesks / selectedTotalDesks : 0;
      return count + (utilization >= 0.9 ? 1 : 0);
    }, 0);
    const fullCapacityDays = workingDaysInMonth.reduce((count, day) => {
      const dayKey = format(day, 'yyyy-MM-dd');
      const occupiedDesks = dailyLoadMap.get(dayKey) || 0;
      const utilization = selectedTotalDesks > 0 ? occupiedDesks / selectedTotalDesks : 0;
      return count + (utilization >= 1 ? 1 : 0);
    }, 0);

    const pressureRooms = roomMonthlySummaries.filter((room) => room.utilization >= 80).length;
    const activeRooms = roomMonthlySummaries.filter((room) => room.deskDays > 0).length;
    const averageDailyDemand = elapsedWindowDays > 0 ? selectedMonthRoomRows.length / elapsedWindowDays : 0;
    const primaryRoom = topRooms[0];
    const selectedEntityLabel = 'reserved desks';

    const topFiveDeskDays = userDeskDayCounts.slice(0, 5).reduce((sum, userEntry) => sum + userEntry.count, 0);
    const concentrationRiskShare = selectedMonthRoomRows.length > 0 ? (topFiveDeskDays / selectedMonthRoomRows.length) * 100 : 0;
    const concentrationLeader = userDeskDayCounts[0];
    const concentrationLeaderShare = concentrationLeader && selectedMonthRoomRows.length > 0
      ? (concentrationLeader.count / selectedMonthRoomRows.length) * 100
      : 0;

    const executiveSignals = [
      {
        key: 'adoption',
        label: 'Adoption',
        status: adoptionCoverageRate >= 70 ? 'Healthy' : adoptionCoverageRate >= 50 ? 'Watch' : 'Action',
        detail: `${formatPercent(adoptionCoverageRate)} of eligible people booked at least once in the selected rooms.`,
        accent: adoptionCoverageRate >= 70 ? 'bg-emerald-50 text-emerald-700' : adoptionCoverageRate >= 50 ? 'bg-amber-50 text-amber-700' : 'bg-rose-50 text-rose-700',
      },
      {
        key: 'pressure',
        label: 'Pressure',
        status: fullCapacityDays > 0 ? 'Action' : pressure80Days >= Math.max(2, Math.ceil(elapsedWindowDays * 0.2)) ? 'Watch' : 'Stable',
        detail: `${pressure80Days} days above 80% occupancy, with ${fullCapacityDays} days fully occupied.`,
        accent: fullCapacityDays > 0 ? 'bg-rose-50 text-rose-700' : pressure80Days >= Math.max(2, Math.ceil(elapsedWindowDays * 0.2)) ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-700',
      },
      {
        key: 'cold',
        label: 'Cold footprint',
        status: coldDeskCount >= Math.ceil(selectedTotalDesks * 0.35) ? 'Action' : coldDeskCount >= Math.ceil(selectedTotalDesks * 0.2) ? 'Watch' : 'Stable',
        detail: `${coldDeskCount} desks are below ${coldDeskThreshold}% utilization, including ${idleDeskCount} idle desks.`,
        accent: coldDeskCount >= Math.ceil(selectedTotalDesks * 0.35) ? 'bg-rose-50 text-rose-700' : coldDeskCount >= Math.ceil(selectedTotalDesks * 0.2) ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-700',
      },
      {
        key: 'concentration',
        label: 'Concentration',
        status: concentrationRiskShare >= 45 ? 'Action' : concentrationRiskShare >= 30 ? 'Watch' : 'Stable',
        detail: `${formatPercent(concentrationRiskShare)} of reserved desk-days come from the top 5 users in this room context.`,
        accent: concentrationRiskShare >= 45 ? 'bg-rose-50 text-rose-700' : concentrationRiskShare >= 30 ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-700',
      },
    ];

    const recommendedActions = [
      {
        key: 'adoption',
        title:
          adoptionCoverageRate < 55
            ? 'Re-activate eligible people in low-adoption rooms'
            : 'Keep adoption momentum in the current room set',
        detail:
          adoptionCoverageRate < 55
            ? `${inactiveEligiblePeople} eligible people have not booked yet. Prioritize onboarding or nudges in rooms with the widest adoption gap.`
            : `${formatPercent(adoptionCoverageRate)} of eligible people booked at least once. Protect this usage pattern with stable comms and room visibility.`,
        metric: `${roomScopeUniqueBookers}/${eligiblePeopleCount} active`,
        accent:
          adoptionCoverageRate < 55 ? 'bg-rose-50 text-rose-700' : adoptionCoverageRate < 70 ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700',
      },
      {
        key: 'pressure',
        title:
          fullCapacityDays > 0
            ? 'Mitigate full-capacity days in the selected month'
            : pressure80Days >= Math.max(2, Math.ceil(elapsedWindowDays * 0.2))
              ? 'Watch recurring high-pressure days'
              : 'Capacity pressure is currently under control',
        detail:
          fullCapacityDays > 0
            ? `${fullCapacityDays} working days hit full capacity and ${pressure90Days} days moved above 90%. Consider opening spillover rooms or redistributing demand.`
            : pressure80Days >= Math.max(2, Math.ceil(elapsedWindowDays * 0.2))
              ? `${pressure80Days} days crossed 80% occupancy. A light intervention on peak weekdays could smooth the load before it turns critical.`
              : 'No sustained pressure pattern is visible. Keep monitoring the busiest weekdays and protect room balance.',
        metric: `${pressure80Days} days >80%`,
        accent:
          fullCapacityDays > 0 ? 'bg-rose-50 text-rose-700' : pressure80Days >= Math.max(2, Math.ceil(elapsedWindowDays * 0.2)) ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-700',
      },
      {
        key: 'cold',
        title:
          coldDeskCount >= Math.ceil(selectedTotalDesks * 0.25)
            ? 'Review cold desks and room layout efficiency'
            : 'Cold desk footprint is limited',
        detail:
          coldDeskCount >= Math.ceil(selectedTotalDesks * 0.25)
            ? `${coldDeskCount} desks are below ${coldDeskThreshold}% utilization, including ${idleDeskCount} completely idle desks. Review visibility, proximity, and seat attractiveness.`
            : `${coldDeskCount} desks sit below the cold threshold. Keep monitoring underused seats, but the footprint is not yet structurally problematic.`,
        metric: `${coldDeskCount} cold desks`,
        accent:
          coldDeskCount >= Math.ceil(selectedTotalDesks * 0.25) ? 'bg-violet-50 text-violet-700' : 'bg-slate-100 text-slate-700',
      },
      {
        key: 'concentration',
        title:
          concentrationRiskShare >= 40
            ? 'Reduce reliance on a small group of heavy users'
            : 'Demand is reasonably distributed across users',
        detail:
          concentrationRiskShare >= 40
            ? `${formatPercent(concentrationRiskShare)} of reserved desk-days come from the top 5 users. This suggests a shared-capacity risk if those users dominate the best seats.`
            : `${formatPercent(concentrationRiskShare)} of desk-days come from the top 5 users. The current demand mix looks broadly distributed.`,
        metric: `Top 5 = ${formatPercent(concentrationRiskShare)}`,
        accent:
          concentrationRiskShare >= 40 ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-700',
      },
    ];

    const workingCalendarWeeks = buildWorkingCalendarWeeks(workingDaysInMonth, dailyLoadMap, selectedTotalDesks);
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
    const totalPossibleDeskDays = selectedTotalDesks * elapsedWindowDays;
    const openDeskDays = Math.max(totalPossibleDeskDays - selectedMonthRoomRows.length, 0);
    const weekdayOccupancyBreakdown = [
      {
        name: 'Reserved',
        value: selectedMonthRoomRows.length,
        fill: '#2563eb',
      },
      {
        name: 'Open',
        value: openDeskDays,
        fill: '#e2e8f0',
      },
    ];

    return {
      totalDesks: selectedTotalDesks,
      averageReservedDesks,
      averageOpenDesks,
      monthlyOccupancyRate,
      metricDeltas,
      previousMonthLabel,
      averageFullRoomDaysPercentage,
      uniqueBookers,
      averagePersonOccupancyPercentage,
      averageBookedDaysPerPerson,
      roomDeskDaysInMonth: selectedMonthRoomRows.length,
      totalPossibleDeskDays,
      weekdayOccupancyBreakdown,
      peopleDeskDaysInMonth: selectedMonthPeopleRows.length,
      pressureRooms,
      activeRooms,
      monthlyTrend,
      weeklyTrend,
      weekdayData,
      busiestWeekday,
      weekdayAxisMax,
      weekdayAverage,
      topRooms,
      bottomRooms,
      peakDay,
      roomMonthlySummaries,
      primaryRoom,
      roomScopeUniqueBookers,
      adoptionCoverageRate,
      inactiveEligiblePeople,
      roomAdoptionSummaries,
      coldDeskThreshold,
      coldDeskCount,
      idleDeskCount,
      coldDeskLeaders,
      executiveSignals,
      recommendedActions,
      concentrationRiskShare,
      concentrationLeader,
      concentrationLeaderShare,
      pressure80Days,
      pressure90Days,
      fullCapacityDays,
      averageDailyDemand,
      workingCalendarWeeks,
      roomOpportunityMap,
      generatedAt: data?.generatedAt || new Date().toISOString(),
      selectedMonthLabel,
      selectedEntityLabel,
      roomsCount: selectedRooms.length,
      peopleCount: selectedUserIds.length,
      eligiblePeopleCount,
      hasRows: selectedMonthRoomRows.length > 0,
      businessDaysInMonth: elapsedWindowDays,
    };
  }, [
    data?.generatedAt,
    selectedMonth,
    selectedMonthDate,
    selectedMonthLabel,
    selectedRooms,
    selectedTotalDesks,
    selectedMonthRoomRows,
    selectedMonthPeopleRows,
    roomRowsByMonth,
    peopleRowsByMonth,
    roomRowsByWeek,
    peopleRowsByWeek,
    workingDaysInMonth,
    elapsedWindowDays,
    uniqueBookers,
    selectedMonthRoomIndexes,
    eligiblePeopleCount,
    roomEligibleUsersMap,
    trendMonths,
    trendWeeks,
  ]);

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

  const trendData = trendGranularity === 'monthly' ? insight.monthlyTrend : insight.weeklyTrend;
  const trendWindowLabel = trendGranularity === 'monthly' ? 'Last 6 months' : 'Last 6 weeks';

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
              delta={insight.metricDeltas.averageFullRoomDaysPercentage !== null ? `${formatSignedDelta(insight.metricDeltas.averageFullRoomDaysPercentage, 1)} pts` : null}
              deltaCaption={insight.metricDeltas.averageFullRoomDaysPercentage !== null ? `vs ${insight.previousMonthLabel}` : null}
            />
            <InsightMetric
              label="Unique people"
              value={String(insight.uniqueBookers)}
              detail="Distinct people who made at least one booking inside the selected people filter."
              accent="bg-emerald-50 text-emerald-700"
              delta={insight.metricDeltas.uniqueBookers !== null ? formatSignedDelta(insight.metricDeltas.uniqueBookers) : null}
              deltaCaption={insight.metricDeltas.uniqueBookers !== null ? `vs ${insight.previousMonthLabel}` : null}
            />
            <InsightMetric
              label="Avg person occupancy"
              value={formatPercent(insight.averagePersonOccupancyPercentage)}
              detail="Average share of working days with a booked desk per active person inside the selected people filter."
              accent="bg-amber-50 text-amber-700"
              delta={insight.metricDeltas.averagePersonOccupancyPercentage !== null ? `${formatSignedDelta(insight.metricDeltas.averagePersonOccupancyPercentage, 1)} pts` : null}
              deltaCaption={insight.metricDeltas.averagePersonOccupancyPercentage !== null ? `vs ${insight.previousMonthLabel}` : null}
            />
            <InsightMetric
              label="Avg booked days / person"
              value={insight.averageBookedDaysPerPerson.toFixed(1)}
              detail="Average number of booked working days per active person inside the filtered month."
              accent="bg-violet-50 text-violet-700"
              delta={insight.metricDeltas.averageBookedDaysPerPerson !== null ? `${formatSignedDelta(insight.metricDeltas.averageBookedDaysPerPerson, 1)} d` : null}
              deltaCaption={insight.metricDeltas.averageBookedDaysPerPerson !== null ? `vs ${insight.previousMonthLabel}` : null}
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.82fr)_minmax(320px,0.82fr)]">
            <Card className="min-w-0 border-slate-200 bg-white shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center justify-between text-base">
                  Executive signals
                  <ShieldCheck className="h-5 w-5 text-slate-400" />
                </CardTitle>
                <p className="text-[12px] text-slate-500">
                  Fast reads on adoption, pressure, cold footprint, and concentration for the selected month.
                </p>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3 md:grid-cols-2">
                  {insight.executiveSignals.map((signal) => (
                    <div
                      key={signal.key}
                      className="rounded-[24px] border border-slate-100 bg-[linear-gradient(180deg,#ffffff_0%,#f8fbff_100%)] p-4 shadow-[0_14px_32px_rgba(15,23,42,0.04)]"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">{signal.label}</p>
                          <p className="mt-2 text-[12px] leading-5 text-slate-600">{signal.detail}</p>
                        </div>
                        <Badge className={`rounded-full px-3 py-1 hover:bg-transparent ${signal.accent}`}>
                          {signal.status}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="min-w-0 border-slate-200 bg-white shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center justify-between text-base">
                  Concentration risk
                  <Flame className="h-5 w-5 text-slate-400" />
                </CardTitle>
                <p className="text-[12px] text-slate-500">
                  Share of reserved desk-days generated by the most active users in the selected rooms.
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-[26px] border border-slate-100 bg-[radial-gradient(circle_at_top_left,_rgba(245,158,11,0.08),_transparent_34%),linear-gradient(180deg,#ffffff_0%,#fffaf3_100%)] p-5 shadow-[0_16px_36px_rgba(15,23,42,0.05)]">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Top 5 share</p>
                  <div className="mt-3 flex items-end justify-between gap-3">
                    <p className="text-[34px] font-semibold tracking-tight text-slate-950">
                      {formatPercent(insight.concentrationRiskShare)}
                    </p>
                    <Badge variant="secondary" className="rounded-full bg-amber-50 text-amber-700">
                      {insight.concentrationLeader ? insight.concentrationLeader.label : 'No leader'}
                    </Badge>
                  </div>
                  <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-[linear-gradient(90deg,#f59e0b_0%,#ef4444_100%)]"
                      style={{ width: `${Math.min(insight.concentrationRiskShare, 100)}%` }}
                    />
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl border border-slate-100 bg-white/85 px-3 py-3">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">Lead user share</p>
                      <p className="mt-2 text-lg font-semibold text-slate-950">{formatPercent(insight.concentrationLeaderShare)}</p>
                    </div>
                    <div className="rounded-2xl border border-slate-100 bg-white/85 px-3 py-3">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">Monthly desk-days</p>
                      <p className="mt-2 text-lg font-semibold text-slate-950">{compactNumber(insight.roomDeskDaysInMonth)}</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="min-w-0 border-slate-200 bg-white shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center justify-between text-base">
                  Peak pressure days
                  <Gauge className="h-5 w-5 text-slate-400" />
                </CardTitle>
                <p className="text-[12px] text-slate-500">
                  Days where total occupancy in the selected rooms moved into high-pressure territory.
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-[26px] border border-slate-100 bg-[radial-gradient(circle_at_top_left,_rgba(59,130,246,0.08),_transparent_34%),linear-gradient(180deg,#ffffff_0%,#f8fbff_100%)] p-5 shadow-[0_16px_36px_rgba(15,23,42,0.05)]">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Pressure spread</p>
                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    <div className="rounded-2xl border border-slate-100 bg-white/85 px-3 py-3">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">80%+</p>
                      <p className="mt-2 text-xl font-semibold text-slate-950">{insight.pressure80Days}</p>
                    </div>
                    <div className="rounded-2xl border border-slate-100 bg-white/85 px-3 py-3">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">90%+</p>
                      <p className="mt-2 text-xl font-semibold text-slate-950">{insight.pressure90Days}</p>
                    </div>
                    <div className="rounded-2xl border border-slate-100 bg-white/85 px-3 py-3">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">100%</p>
                      <p className="mt-2 text-xl font-semibold text-slate-950">{insight.fullCapacityDays}</p>
                    </div>
                  </div>
                  <div className="mt-4 rounded-2xl border border-slate-100 bg-white/80 px-3 py-3">
                    <div className="flex items-center justify-between gap-3 text-[11px] text-slate-500">
                      <span>Days above 80% occupancy</span>
                      <span className="font-semibold text-slate-900">
                        {insight.businessDaysInMonth > 0 ? formatPercent((insight.pressure80Days / insight.businessDaysInMonth) * 100) : '0%'}
                      </span>
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-[linear-gradient(90deg,#60a5fa_0%,#2563eb_100%)]"
                        style={{ width: `${insight.businessDaysInMonth > 0 ? Math.min((insight.pressure80Days / insight.businessDaysInMonth) * 100, 100) : 0}%` }}
                      />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,0.95fr)]">
            <Card className="min-w-0 overflow-hidden border-slate-200 bg-white shadow-sm">
              <CardHeader className="pb-2">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-base">
                      Occupancy momentum
                      <TrendingUp className="h-5 w-5 text-slate-400" />
                    </CardTitle>
                    <p className="mt-2 text-[12px] text-slate-500">
                      Top: average desk booking rate. Bottom: unique people active in the selected room context over time.
                    </p>
                  </div>
                  <div className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 p-1 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
                    <button
                      type="button"
                      onClick={() => setTrendGranularity('monthly')}
                      className={`rounded-full px-3 py-1.5 text-[11px] font-semibold transition ${
                        trendGranularity === 'monthly'
                          ? 'bg-white text-slate-950 shadow-[0_6px_18px_rgba(15,23,42,0.08)]'
                          : 'text-slate-500 hover:text-slate-700'
                      }`}
                    >
                      Monthly
                    </button>
                    <button
                      type="button"
                      onClick={() => setTrendGranularity('weekly')}
                      className={`rounded-full px-3 py-1.5 text-[11px] font-semibold transition ${
                        trendGranularity === 'weekly'
                          ? 'bg-white text-slate-950 shadow-[0_6px_18px_rgba(15,23,42,0.08)]'
                          : 'text-slate-500 hover:text-slate-700'
                      }`}
                    >
                      Weekly
                    </button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="rounded-[28px] border border-slate-100 bg-slate-50/40 p-4 md:p-5">
                  <div className="mb-3 flex items-center justify-between">
                    <div>
                      <p className="text-[13px] font-medium text-slate-900">Desk booking rate</p>
                      <p className="text-[11px] text-slate-500">
                        {trendWindowLabel}. Occupied desk-days / total available desk-days in the selected scope.
                      </p>
                    </div>
                    <Badge variant="secondary" className="rounded-full bg-blue-50 text-blue-700">
                      %
                    </Badge>
                  </div>
                  <div className="h-[240px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={trendData} margin={{ top: 18, right: 18, left: 12, bottom: 8 }}>
                        <defs>
                          <linearGradient id="bookingRateFill" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#2563eb" stopOpacity={0.28} />
                            <stop offset="60%" stopColor="#3b82f6" stopOpacity={0.1} />
                            <stop offset="100%" stopColor="#ffffff" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="4 6" vertical={false} stroke="#dbe7f5" />
                        <XAxis
                          dataKey="label"
                          tickLine={false}
                          axisLine={false}
                          tickMargin={12}
                          tick={{ fill: '#64748b', fontSize: 12 }}
                        />
                        <YAxis
                          tickLine={false}
                          axisLine={false}
                          unit="%"
                          domain={[0, 100]}
                          ticks={[0, 20, 40, 60, 80, 100]}
                          tickMargin={12}
                          tick={{ fill: '#64748b', fontSize: 12 }}
                        />
                        <Tooltip
                          formatter={(value: number) => [`${value}%`, 'Booking rate']}
                          contentStyle={{
                            borderRadius: 18,
                            border: '1px solid #dbe7f5',
                            boxShadow: '0 22px 60px rgba(37, 99, 235, 0.12)',
                          }}
                        />
                        <Area
                          type="monotone"
                          dataKey="reservationRate"
                          stroke="#2563eb"
                          fill="url(#bookingRateFill)"
                          strokeWidth={3.5}
                          dot={{ r: 4.5, fill: '#2563eb', stroke: '#ffffff', strokeWidth: 2 }}
                          activeDot={{ r: 6.5, fill: '#2563eb', stroke: '#ffffff', strokeWidth: 2 }}
                          name="Booking rate"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="border-t border-slate-100 pt-6">
                  <div className="rounded-[28px] border border-slate-100 bg-slate-50/40 p-4 md:p-5">
                  <div className="mb-3 flex items-center justify-between">
                    <div>
                      <p className="text-[13px] font-medium text-slate-900">People connected to selected rooms</p>
                      <p className="text-[11px] text-slate-500">
                        {trendWindowLabel}. Unique active people across the selected rooms, limited by the selected people filter.
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="rounded-full bg-emerald-50 text-emerald-700">
                        Count
                      </Badge>
                      <Badge variant="secondary" className="rounded-full bg-slate-100 text-slate-700">
                        Eligible {insight.eligiblePeopleCount}
                      </Badge>
                    </div>
                  </div>
                  <div className="h-[240px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={trendData} margin={{ top: 18, right: 18, left: 12, bottom: 8 }}>
                        <defs>
                          <linearGradient id="peopleCountFill" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#10b981" stopOpacity={0.24} />
                            <stop offset="60%" stopColor="#34d399" stopOpacity={0.1} />
                            <stop offset="100%" stopColor="#ffffff" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="4 6" vertical={false} stroke="#d9efe8" />
                        <XAxis
                          dataKey="label"
                          tickLine={false}
                          axisLine={false}
                          tickMargin={12}
                          tick={{ fill: '#64748b', fontSize: 12 }}
                        />
                        <YAxis
                          tickLine={false}
                          axisLine={false}
                          allowDecimals={false}
                          domain={[0, Math.max(100, Math.ceil((insight.eligiblePeopleCount || 0) / 10) * 10)]}
                          tickMargin={12}
                          tick={{ fill: '#64748b', fontSize: 12 }}
                        />
                        <ReferenceLine
                          y={insight.eligiblePeopleCount}
                          stroke="#94a3b8"
                          strokeWidth={1}
                          strokeDasharray="3 6"
                          ifOverflow="extendDomain"
                          label={{
                            value: 'Eligible',
                            position: 'insideTopRight',
                            fill: '#94a3b8',
                            fontSize: 11,
                          }}
                        />
                        <Tooltip
                          formatter={(value: number) => [value, 'Unique people']}
                          contentStyle={{
                            borderRadius: 18,
                            border: '1px solid #d9efe8',
                            boxShadow: '0 22px 60px rgba(16, 185, 129, 0.12)',
                          }}
                        />
                        <Area
                          type="monotone"
                          dataKey="users"
                          stroke="#10b981"
                          fill="url(#peopleCountFill)"
                          strokeWidth={3.5}
                          dot={{ r: 4.5, fill: '#10b981', stroke: '#ffffff', strokeWidth: 2 }}
                          activeDot={{ r: 6.5, fill: '#10b981', stroke: '#ffffff', strokeWidth: 2 }}
                          name="Unique people"
                        />
                      </AreaChart>
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
            <Card className="min-w-0 border-slate-200 bg-white shadow-sm h-full flex flex-col">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center justify-between text-base">
                  Weekday demand
                  <CalendarDays className="h-5 w-5 text-slate-400" />
                </CardTitle>
                <p className="text-[12px] text-slate-500">
                  Average occupied desks by weekday for {insight.selectedMonthLabel.toLowerCase()}, excluding weekends and Italian holidays.
                </p>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col space-y-4">
                <div className="rounded-[28px] border border-slate-100 bg-[linear-gradient(180deg,#ffffff_0%,#f8fbff_100%)] p-4 shadow-[0_18px_40px_rgba(15,23,42,0.05)]">
                  <div className="h-[290px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={insight.weekdayData} barSize={56} margin={{ top: 8, right: 8, left: 4, bottom: 8 }}>
                        <defs>
                          <linearGradient id="weekdayDemandFill" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#2563eb" stopOpacity={0.96} />
                            <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.82} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="4 6" vertical={false} stroke="#dbe7f5" />
                        <XAxis
                          dataKey="label"
                          tickLine={false}
                          axisLine={false}
                          tickMargin={10}
                          tick={{ fill: '#64748b', fontSize: 12 }}
                        />
                        <YAxis
                          tickLine={false}
                          axisLine={false}
                          tickMargin={10}
                          tick={{ fill: '#64748b', fontSize: 12 }}
                          domain={[0, insight.weekdayAxisMax]}
                        />
                        <Tooltip
                          formatter={(value: number) => [`${value}`, 'Avg occupied desks']}
                          contentStyle={{
                            borderRadius: 18,
                            border: '1px solid #dbe7f5',
                            boxShadow: '0 22px 60px rgba(37, 99, 235, 0.12)',
                          }}
                        />
                        <Bar dataKey="averageDeskDays" radius={[14, 14, 6, 6]} fill="url(#weekdayDemandFill)">
                          <LabelList
                            dataKey="averageDeskDays"
                            position="top"
                            offset={10}
                            formatter={(value: number) => value.toFixed(1)}
                            className="fill-slate-500 text-[11px] font-medium"
                          />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="grid flex-1 items-stretch gap-4 2xl:grid-cols-[minmax(220px,0.72fr)_minmax(0,1.28fr)]">
                  <div className="grid h-full gap-4 md:grid-cols-2 2xl:grid-cols-1">
                    <div className="rounded-[24px] border border-slate-100 bg-[linear-gradient(180deg,#f8fbff_0%,#ffffff_100%)] px-4 py-4 shadow-[0_14px_30px_rgba(15,23,42,0.04)]">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Peak day</p>
                      <div className="mt-4 flex items-end justify-between gap-3">
                        <p className="text-[40px] font-semibold tracking-tight text-slate-950">
                          {insight.busiestWeekday?.label || 'N/A'}
                        </p>
                        <Badge variant="secondary" className="rounded-full bg-slate-100 text-slate-700">
                          {insight.busiestWeekday?.averageDeskDays?.toFixed(1) || '0.0'}
                        </Badge>
                      </div>
                      <p className="mt-3 text-[12px] text-slate-500">
                        Average occupied desks on the busiest weekday in the selected month.
                      </p>
                    </div>

                    <div className="rounded-[24px] border border-slate-100 bg-[linear-gradient(180deg,#ffffff_0%,#f8fbff_100%)] px-4 py-4 shadow-[0_14px_30px_rgba(15,23,42,0.04)]">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Week average</p>
                      <div className="mt-4 flex items-end justify-between gap-3">
                        <p className="text-[34px] font-semibold tracking-tight text-slate-950">
                          {insight.weekdayAverage.toFixed(1)}
                        </p>
                        <Badge variant="secondary" className="rounded-full bg-blue-50 text-blue-700">
                          Mon-Fri
                        </Badge>
                      </div>
                      <p className="mt-3 text-[12px] text-slate-500">Average occupied desks across all working weekdays.</p>
                    </div>
                  </div>

                  <div className="min-w-0 rounded-[24px] border border-slate-100 bg-[radial-gradient(circle_at_top_left,_rgba(59,130,246,0.08),_transparent_32%),linear-gradient(180deg,#ffffff_0%,#f8fbff_100%)] px-4 py-4 shadow-[0_18px_40px_rgba(15,23,42,0.05)] h-full flex flex-col">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Monthly booking share</p>
                        <p className="mt-2 text-[12px] text-slate-500">
                          Reserved desk-days versus total possible desk-days in the selected scope.
                        </p>
                      </div>
                      <Badge variant="secondary" className="rounded-full bg-blue-50 text-blue-700">
                        {formatPercent(insight.monthlyOccupancyRate)}
                      </Badge>
                    </div>

                    <div className="mt-4 flex flex-1 flex-col gap-4">
                      <div className="relative mx-auto h-[184px] w-[184px] shrink-0">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={insight.weekdayOccupancyBreakdown}
                              dataKey="value"
                              innerRadius={56}
                              outerRadius={82}
                              paddingAngle={3}
                              stroke="none"
                            >
                              {insight.weekdayOccupancyBreakdown.map((entry) => (
                                <Cell key={entry.name} fill={entry.fill} />
                              ))}
                            </Pie>
                          </PieChart>
                        </ResponsiveContainer>
                        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                          <span className="text-[24px] font-semibold tracking-tight text-slate-950">
                            {formatPercent(insight.monthlyOccupancyRate)}
                          </span>
                          <span className="text-[10px] font-medium uppercase tracking-[0.16em] text-slate-400">
                            Reserved
                          </span>
                        </div>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="min-w-0 rounded-2xl border border-slate-100 bg-white/80 px-3 py-3 shadow-[0_10px_24px_rgba(15,23,42,0.03)]">
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2">
                              <span className="h-2.5 w-2.5 rounded-full bg-blue-600" />
                              <span className="text-[11px] font-medium text-slate-600">Reserved</span>
                            </div>
                            <span className="text-[12px] font-semibold text-slate-900">
                              {compactNumber(insight.roomDeskDaysInMonth)}
                            </span>
                          </div>
                        </div>
                        <div className="min-w-0 rounded-2xl border border-slate-100 bg-white/80 px-3 py-3 shadow-[0_10px_24px_rgba(15,23,42,0.03)]">
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2">
                              <span className="h-2.5 w-2.5 rounded-full bg-slate-200" />
                              <span className="text-[11px] font-medium text-slate-600">Open</span>
                            </div>
                            <span className="text-[12px] font-semibold text-slate-900">
                              {compactNumber(Math.max(insight.totalPossibleDeskDays - insight.roomDeskDaysInMonth, 0))}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="rounded-2xl border border-slate-100 bg-white/75 px-3 py-3">
                        <div className="flex items-center justify-between gap-3 text-[11px] text-slate-500">
                          <span>Reserved share</span>
                          <span className="font-semibold text-slate-900">{formatPercent(insight.monthlyOccupancyRate)}</span>
                        </div>
                        <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className="h-full rounded-full bg-[linear-gradient(90deg,#2563eb_0%,#60a5fa_100%)]"
                            style={{ width: `${Math.min(insight.monthlyOccupancyRate, 100)}%` }}
                          />
                        </div>
                        <p className="mt-3 text-[11px] leading-5 text-slate-500">
                          {compactNumber(insight.roomDeskDaysInMonth)} reserved desk-days out of {compactNumber(insight.totalPossibleDeskDays)} possible.
                        </p>
                      </div>
                    </div>
                  </div>
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
              <CardContent className="space-y-4">
                {insight.primaryRoom && (
                  <div className="rounded-[28px] border border-slate-100 bg-[radial-gradient(circle_at_top_left,_rgba(59,130,246,0.08),_transparent_28%),linear-gradient(180deg,#fbfcff_0%,#ffffff_100%)] p-4 shadow-[0_18px_40px_rgba(15,23,42,0.05)]">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Top performer</p>
                    <div className="mt-3 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-semibold text-slate-950">{insight.primaryRoom.name}</p>
                        <p className="mt-1 text-[11px] text-slate-500">
                          {insight.primaryRoom.deskDays} desk-days, {insight.primaryRoom.avgDailyBooked.toFixed(1)} avg booked desks/day
                        </p>
                      </div>
                      <Badge className="rounded-full bg-slate-950 px-3 py-1 text-white hover:bg-slate-950">
                        {formatPercent(insight.primaryRoom.utilization)}
                      </Badge>
                    </div>
                  </div>
                )}

                <div className="space-y-3">
                  {insight.topRooms.map((room, index) => (
                    <div key={room.id} className="rounded-[28px] border border-slate-100 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] p-4 shadow-[0_14px_32px_rgba(15,23,42,0.04)]">
                      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-50 text-[13px] font-semibold tracking-[0.18em] text-slate-400">
                          {String(index + 1).padStart(2, '0')}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-[13px] font-semibold leading-5 text-slate-950">{room.name}</p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            <span className="rounded-full bg-slate-50 px-2.5 py-1 text-[10px] font-medium text-slate-600">
                              {room.deskDays} desk-days
                            </span>
                            <span className="rounded-full bg-slate-50 px-2.5 py-1 text-[10px] font-medium text-slate-600">
                              {room.avgDailyBooked.toFixed(1)} avg/day
                            </span>
                            <span className="rounded-full bg-slate-50 px-2.5 py-1 text-[10px] font-medium text-slate-600">
                              {room.totalDesks} desks
                            </span>
                          </div>
                        </div>
                        <Badge variant="secondary" className="rounded-full bg-white text-slate-700">
                          {formatPercent(room.utilization)}
                        </Badge>
                      </div>
                      <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full bg-[linear-gradient(90deg,#2563eb_0%,#8b5cf6_100%)]"
                          style={{ width: `${Math.min(room.utilization, 100)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
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

          <div className="grid gap-4 xl:grid-cols-[minmax(380px,0.78fr)_minmax(0,1.22fr)]">
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
                  <div className="mx-auto w-full max-w-[488px] rounded-[24px] border border-slate-100 bg-[linear-gradient(180deg,#ffffff_0%,#f8fbff_100%)] p-3 shadow-[0_18px_40px_rgba(15,23,42,0.06)] sm:max-w-[510px] sm:p-4 xl:max-w-[500px]">
                    <div className="grid grid-cols-5 gap-2 sm:gap-2.5">
                      {['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].map((label) => (
                        <div
                          key={label}
                          className="pb-1 text-center text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400"
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
                                className="aspect-square rounded-[18px] border border-dashed border-slate-200/80 bg-slate-50/70"
                              />
                            );
                          }

                          const heatSurface = getHeatSurface(day.utilization);

                          return (
                            <div
                              key={day.key}
                              className={`group relative aspect-square rounded-[18px] border p-1.5 transition-all duration-200 sm:p-2 ${heatSurface.textClassName}`}
                              style={{
                                background: heatSurface.background,
                                borderColor: heatSurface.borderColor,
                                boxShadow: heatSurface.shadow,
                              }}
                              title={`${day.date}: ${day.occupancyCount} occupied desks (${formatPercent(day.utilization * 100)})`}
                            >
                              <div className="flex h-full flex-col justify-between">
                                <span className="text-[11px] font-semibold sm:text-[12px]">{day.dayNumber}</span>
                                <div className="space-y-0.5">
                                  <p className={`text-[8px] font-medium uppercase tracking-[0.16em] ${heatSurface.captionClassName}`}>
                                    {Math.round(day.utilization * 100)}%
                                  </p>
                                  <p className={`text-[8px] ${heatSurface.captionClassName}`}>
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

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-slate-500">
                    <span className="font-medium text-slate-600">Intensity</span>
                    <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full border border-slate-200 bg-white" />0%</div>
                    <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-[#ddd6fe]" />Light</div>
                    <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-[#a78bfa]" />Elevated</div>
                    <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-[#7c3aed]" />High</div>
                    <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-[#2b1750]" />Critical</div>
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
                <div className="h-[388px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <ScatterChart margin={{ top: 18, right: 38, left: 18, bottom: 24 }}>
                      <CartesianGrid strokeDasharray="4 6" stroke="#dbe7f5" />
                      <XAxis
                        type="number"
                        dataKey="x"
                        name="Occupancy"
                        unit="%"
                        tickLine={false}
                        axisLine={false}
                        domain={[0, 100]}
                        tickMargin={18}
                        tick={{ fill: '#64748b', fontSize: 12 }}
                      />
                      <YAxis
                        type="number"
                        dataKey="y"
                        name="Unique people"
                        tickLine={false}
                        axisLine={false}
                        allowDecimals={false}
                        tickMargin={16}
                        tick={{ fill: '#64748b', fontSize: 12 }}
                      />
                      <ZAxis type="number" dataKey="z" range={[180, 1000]} name="Desks" />
                      <Tooltip
                        cursor={{ strokeDasharray: '3 3' }}
                        contentStyle={{
                          borderRadius: 18,
                          border: '1px solid #dbe7f5',
                          boxShadow: '0 22px 60px rgba(124, 58, 237, 0.12)',
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

          <div className="grid gap-4 xl:grid-cols-2">
            <Card className="min-w-0 border-slate-200 bg-white shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center justify-between text-base">
                  Adoption coverage
                  <ShieldCheck className="h-5 w-5 text-slate-400" />
                </CardTitle>
                <p className="text-[12px] text-slate-500">
                  Eligible people with at least one reserved desk-day in the selected rooms during {insight.selectedMonthLabel.toLowerCase()}.
                </p>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="rounded-[28px] border border-slate-100 bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.08),_transparent_32%),linear-gradient(180deg,#ffffff_0%,#f7fffb_100%)] p-5 shadow-[0_18px_40px_rgba(15,23,42,0.05)]">
                  <div className="flex items-end justify-between gap-4">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Eligible people reached</p>
                      <p className="mt-2 text-[34px] font-semibold tracking-tight text-slate-950">
                        {formatPercent(insight.adoptionCoverageRate)}
                      </p>
                      <p className="mt-2 text-[12px] text-slate-500">
                        {insight.roomScopeUniqueBookers} of {insight.eligiblePeopleCount} eligible people booked at least once.
                      </p>
                    </div>
                    <Badge variant="secondary" className="rounded-full bg-emerald-50 text-emerald-700">
                      Gap {insight.inactiveEligiblePeople}
                    </Badge>
                  </div>

                  <div className="mt-5 h-2.5 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-[linear-gradient(90deg,#10b981_0%,#2563eb_100%)]"
                      style={{ width: `${Math.min(insight.adoptionCoverageRate, 100)}%` }}
                    />
                  </div>

                  <div className="mt-5 grid gap-3 sm:grid-cols-3">
                    <div className="rounded-2xl border border-slate-100 bg-white/85 px-3 py-3">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">Active</p>
                      <p className="mt-2 text-lg font-semibold text-slate-950">{insight.roomScopeUniqueBookers}</p>
                    </div>
                    <div className="rounded-2xl border border-slate-100 bg-white/85 px-3 py-3">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">Eligible</p>
                      <p className="mt-2 text-lg font-semibold text-slate-950">{insight.eligiblePeopleCount}</p>
                    </div>
                    <div className="rounded-2xl border border-slate-100 bg-white/85 px-3 py-3">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">Inactive</p>
                      <p className="mt-2 text-lg font-semibold text-slate-950">{insight.inactiveEligiblePeople}</p>
                    </div>
                  </div>
                </div>

                <div className="rounded-[24px] border border-slate-100 bg-slate-50/70 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Room reach</p>
                    <span className="text-[11px] text-slate-500">booked users / eligible users</span>
                  </div>
                  <div className="mt-4 space-y-3">
                    {insight.roomAdoptionSummaries.slice(0, 4).map((room) => (
                      <div key={room.id} className="rounded-2xl border border-slate-100 bg-white/90 px-3 py-3">
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-[12px] font-medium text-slate-900">{room.name}</p>
                            <p className="mt-1 text-[11px] text-slate-500">
                              {room.bookedUsers} of {room.eligibleUsers} eligible people
                            </p>
                          </div>
                          <Badge variant="secondary" className="rounded-full bg-emerald-50 text-emerald-700">
                            {formatPercent(room.adoptionRate)}
                          </Badge>
                        </div>
                        <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className="h-full rounded-full bg-[linear-gradient(90deg,#34d399_0%,#3b82f6_100%)]"
                            style={{ width: `${Math.min(room.adoptionRate, 100)}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="min-w-0 border-slate-200 bg-white shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center justify-between text-base">
                  Cold desks
                  <Activity className="h-5 w-5 text-slate-400" />
                </CardTitle>
                <p className="text-[12px] text-slate-500">
                  Desks with the weakest monthly usage in the selected room context, measured on Italian working days.
                </p>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="rounded-[28px] border border-slate-100 bg-[radial-gradient(circle_at_top_left,_rgba(139,92,246,0.08),_transparent_30%),linear-gradient(180deg,#ffffff_0%,#fbfaff_100%)] p-5 shadow-[0_18px_40px_rgba(15,23,42,0.05)]">
                  <div className="flex items-end justify-between gap-4">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Underused footprint</p>
                      <p className="mt-2 text-[34px] font-semibold tracking-tight text-slate-950">{insight.coldDeskCount}</p>
                      <p className="mt-2 text-[12px] text-slate-500">
                        Desks below {insight.coldDeskThreshold}% monthly utilization across the selected rooms.
                      </p>
                    </div>
                    <Badge variant="secondary" className="rounded-full bg-violet-50 text-violet-700">
                      {insight.idleDeskCount} idle
                    </Badge>
                  </div>

                  <div className="mt-5 grid gap-3 sm:grid-cols-3">
                    <div className="rounded-2xl border border-slate-100 bg-white/85 px-3 py-3">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">Tracked desks</p>
                      <p className="mt-2 text-lg font-semibold text-slate-950">{insight.totalDesks}</p>
                    </div>
                    <div className="rounded-2xl border border-slate-100 bg-white/85 px-3 py-3">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">Cold threshold</p>
                      <p className="mt-2 text-lg font-semibold text-slate-950">{insight.coldDeskThreshold}%</p>
                    </div>
                    <div className="rounded-2xl border border-slate-100 bg-white/85 px-3 py-3">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">Idle desks</p>
                      <p className="mt-2 text-lg font-semibold text-slate-950">{insight.idleDeskCount}</p>
                    </div>
                  </div>
                </div>

                <div className="rounded-[24px] border border-slate-100 bg-slate-50/70 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Most underused desks</p>
                    <span className="text-[11px] text-slate-500">reserved days / working days</span>
                  </div>
                  <div className="mt-4 space-y-3">
                    {insight.coldDeskLeaders.map((desk) => (
                      <div key={desk.id} className="rounded-2xl border border-slate-100 bg-white/90 px-3 py-3">
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-[12px] font-medium text-slate-900">{desk.label}</p>
                            <p className="mt-1 truncate text-[11px] text-slate-500">{desk.roomName}</p>
                          </div>
                          <Badge variant="secondary" className="rounded-full bg-white text-slate-700">
                            {formatPercent(desk.utilization)}
                          </Badge>
                        </div>
                        <div className="mt-3 flex items-center justify-between gap-3 text-[11px] text-slate-500">
                          <span>{desk.reservedDays} / {insight.businessDaysInMonth} days</span>
                          <span>{desk.reservedDays === 0 ? 'Never used' : 'Low usage'}</span>
                        </div>
                        <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className="h-full rounded-full bg-[linear-gradient(90deg,#c4b5fd_0%,#8b5cf6_100%)]"
                            style={{ width: `${Math.max(Math.min(desk.utilization, 100), desk.reservedDays > 0 ? 4 : 0)}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="min-w-0 border-slate-200 bg-white shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center justify-between text-base">
                Recommended actions
                <Activity className="h-5 w-5 text-slate-400" />
              </CardTitle>
              <p className="text-[12px] text-slate-500">
                Suggested next moves based on the current month, selected rooms, and the present pressure / adoption profile.
              </p>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 xl:grid-cols-2">
                {insight.recommendedActions.map((action, index) => (
                  <div
                    key={action.key}
                    className="rounded-[24px] border border-slate-100 bg-[linear-gradient(180deg,#ffffff_0%,#f8fbff_100%)] p-4 shadow-[0_14px_32px_rgba(15,23,42,0.04)]"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-3">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-2xl bg-slate-50 text-[11px] font-semibold tracking-[0.18em] text-slate-400">
                            {String(index + 1).padStart(2, '0')}
                          </span>
                          <p className="text-[13px] font-semibold leading-5 text-slate-950">{action.title}</p>
                        </div>
                        <p className="mt-3 text-[12px] leading-5 text-slate-600">{action.detail}</p>
                      </div>
                      <Badge className={`shrink-0 rounded-full px-3 py-1 hover:bg-transparent ${action.accent}`}>
                        {action.metric}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
