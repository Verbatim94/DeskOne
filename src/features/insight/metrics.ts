import { format, parseISO } from 'date-fns';

import { getBusinessDaysBetween, isItalianBusinessDay } from '@/lib/italianBusinessCalendar';

import type {
  DailyOccupancyRow,
  RangeBucket,
  RawOccupancyRow,
  RoomAccessEntry,
  RoomStructure,
} from './types';

export function countUniqueUsers(rows: DailyOccupancyRow[]) {
  return new Set(rows.map((row) => row.user_id).filter(Boolean)).size;
}

function getOccupancyMonth(row: DailyOccupancyRow) {
  return row.occupancy_date.slice(0, 7);
}

export function buildDailyUniqueRows(rows: DailyOccupancyRow[]) {
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

export function buildRowsByMonthMap(rows: DailyOccupancyRow[]) {
  const rowsByMonth = new Map<string, DailyOccupancyRow[]>();

  rows.forEach((row) => {
    const monthKey = getOccupancyMonth(row);
    const existingRows = rowsByMonth.get(monthKey);
    if (existingRows) {
      existingRows.push(row);
    } else {
      rowsByMonth.set(monthKey, [row]);
    }
  });

  return rowsByMonth;
}

export function buildRowsByRangeMap(rows: DailyOccupancyRow[], ranges: RangeBucket[]) {
  const rowsByRange = new Map<string, DailyOccupancyRow[]>();

  ranges.forEach((range) => {
    rowsByRange.set(range.value, []);
  });

  rows.forEach((row) => {
    const matchingRange = ranges.find(
      (range) => row.occupancy_date >= range.startValue && row.occupancy_date <= range.endValue,
    );
    if (matchingRange) {
      rowsByRange.get(matchingRange.value)?.push(row);
    }
  });

  return rowsByRange;
}

export function buildSelectedMonthRoomIndexes(rows: DailyOccupancyRow[]) {
  const roomMonthMap = new Map<string, number>();
  const roomUniqueUsersMap = new Map<string, Set<string>>();
  const roomFixedDeskDaysMap = new Map<string, number>();
  const roomDayOccupancyMap = new Map<string, number>();
  const roomAdoptionBookedUsersMap = new Map<string, Set<string>>();
  const deskReservedDaysMap = new Map<string, number>();
  const dailyLoadMap = new Map<string, number>();
  const userDeskDayCountsMap = new Map<string, { userId: string; label: string; count: number }>();

  rows.forEach((row) => {
    roomMonthMap.set(row.room_id, (roomMonthMap.get(row.room_id) || 0) + 1);

    const roomDayKey = `${row.room_id}-${row.occupancy_date}`;
    roomDayOccupancyMap.set(roomDayKey, (roomDayOccupancyMap.get(roomDayKey) || 0) + 1);

    dailyLoadMap.set(row.occupancy_date, (dailyLoadMap.get(row.occupancy_date) || 0) + 1);

    if (row.source_type === 'fixed_assignment') {
      roomFixedDeskDaysMap.set(row.room_id, (roomFixedDeskDaysMap.get(row.room_id) || 0) + 1);
    }

    const deskIdentity = row.desk_id || row.desk_label || row.reservation_id;
    const deskKey = `${row.room_id}-${deskIdentity}`;
    deskReservedDaysMap.set(deskKey, (deskReservedDaysMap.get(deskKey) || 0) + 1);

    if (!row.user_id) return;

    if (!roomUniqueUsersMap.has(row.room_id)) {
      roomUniqueUsersMap.set(row.room_id, new Set());
    }
    roomUniqueUsersMap.get(row.room_id)?.add(row.user_id);

    if (!roomAdoptionBookedUsersMap.has(row.room_id)) {
      roomAdoptionBookedUsersMap.set(row.room_id, new Set());
    }
    roomAdoptionBookedUsersMap.get(row.room_id)?.add(row.user_id);

    if (!userDeskDayCountsMap.has(row.user_id)) {
      userDeskDayCountsMap.set(row.user_id, {
        userId: row.user_id,
        label: row.user_full_name?.trim() || row.username?.trim() || row.user_id,
        count: 0,
      });
    }

    const currentUser = userDeskDayCountsMap.get(row.user_id);
    if (currentUser) {
      currentUser.count += 1;
    }
  });

  return {
    roomMonthMap,
    roomUniqueUsersMap,
    roomFixedDeskDaysMap,
    roomDayOccupancyMap,
    roomAdoptionBookedUsersMap,
    deskReservedDaysMap,
    dailyLoadMap,
    userDeskDayCounts: Array.from(userDeskDayCountsMap.values()).sort((a, b) => b.count - a.count),
  };
}

export function buildRoomEligibleUsersMap(
  roomAccess: RoomAccessEntry[],
  selectedRoomIdSet: Set<string>,
) {
  const roomEligibleUsersMap = new Map<string, Set<string>>();

  roomAccess.forEach((entry) => {
    if (!selectedRoomIdSet.has(entry.room_id)) return;
    if (!roomEligibleUsersMap.has(entry.room_id)) {
      roomEligibleUsersMap.set(entry.room_id, new Set());
    }
    roomEligibleUsersMap.get(entry.room_id)?.add(entry.user_id);
  });

  return roomEligibleUsersMap;
}

export function buildRoomMonthlySummaries(
  selectedRooms: RoomStructure[],
  elapsedWindowDays: number,
  roomMonthMap: Map<string, number>,
  roomFixedDeskDaysMap: Map<string, number>,
  roomUniqueUsersMap: Map<string, Set<string>>,
) {
  return selectedRooms
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
}

export function buildRoomAdoptionSummaries(
  selectedRooms: RoomStructure[],
  roomAdoptionBookedUsersMap: Map<string, Set<string>>,
  roomEligibleUsersMap: Map<string, Set<string>>,
) {
  return selectedRooms
    .map((room) => {
      const bookedUsers = roomAdoptionBookedUsersMap.get(room.id)?.size || 0;
      const eligibleUsers = roomEligibleUsersMap.get(room.id)?.size || 0;

      return {
        id: room.id,
        name: room.name,
        bookedUsers,
        eligibleUsers,
        adoptionRate: eligibleUsers > 0 ? (bookedUsers / eligibleUsers) * 100 : 0,
      };
    })
    .sort((a, b) => b.adoptionRate - a.adoptionRate);
}

export function buildDeskMonthlySummaries(
  selectedRooms: RoomStructure[],
  elapsedWindowDays: number,
  deskReservedDaysMap: Map<string, number>,
) {
  return selectedRooms
    .flatMap((room) =>
      room.desks.map((desk) => {
        const deskIdentity = desk.id || desk.label;
        const key = `${room.id}-${deskIdentity}`;
        const reservedDays = deskReservedDaysMap.get(key) || 0;

        return {
          id: key,
          roomId: room.id,
          roomName: room.name,
          label: desk.label,
          reservedDays,
          utilization: elapsedWindowDays > 0 ? (reservedDays / elapsedWindowDays) * 100 : 0,
        };
      }),
    )
    .sort((a, b) => {
      if (a.utilization !== b.utilization) return a.utilization - b.utilization;
      if (a.reservedDays !== b.reservedDays) return a.reservedDays - b.reservedDays;
      return a.label.localeCompare(b.label);
    });
}

export function buildWorkingCalendarWeeks(
  workingDaysInMonth: Date[],
  dailyLoadMap: Map<string, number>,
  selectedTotalDesks: number,
) {
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

  return Array.from(workingCalendarWeeksMap.values());
}

export function computeContextMetrics(
  scopeRows: DailyOccupancyRow[],
  selectedRooms: RoomStructure[],
  selectedTotalDesks: number,
  rangeStart: Date,
  rangeEnd: Date,
) {
  const businessDays = getBusinessDaysBetween(rangeStart, rangeEnd);
  const businessDayCount = businessDays.length;

  const monthRoomDayOccupancyMap = new Map<string, number>();
  const userBookedDaysMap = new Map<string, Set<string>>();

  scopeRows.forEach((row) => {
    const key = `${row.room_id}-${row.occupancy_date}`;
    monthRoomDayOccupancyMap.set(key, (monthRoomDayOccupancyMap.get(key) || 0) + 1);

    if (row.user_id) {
      if (!userBookedDaysMap.has(row.user_id)) {
        userBookedDaysMap.set(row.user_id, new Set());
      }
      userBookedDaysMap.get(row.user_id)?.add(row.occupancy_date);
    }
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

  const userMetrics = Array.from(userBookedDaysMap.values()).map((bookedDaysSet) => {
    const bookedDays = bookedDaysSet.size;
    return {
      bookedDays,
      bookedDayPercentage: businessDayCount > 0 ? (bookedDays / businessDayCount) * 100 : 0,
    };
  });

  return {
    businessDayCount,
    reservationRate:
      selectedTotalDesks > 0 && businessDayCount > 0
        ? (scopeRows.length / (selectedTotalDesks * businessDayCount)) * 100
        : 0,
    averageFullRoomDaysPercentage:
      fullRoomPercentages.length > 0
        ? fullRoomPercentages.reduce((sum, value) => sum + value, 0) / fullRoomPercentages.length
        : 0,
    uniquePeople: userBookedDaysMap.size,
    averagePersonOccupancyPercentage:
      userMetrics.length > 0
        ? userMetrics.reduce((sum, item) => sum + item.bookedDayPercentage, 0) / userMetrics.length
        : 0,
    averageBookedDaysPerPerson:
      userMetrics.length > 0
        ? userMetrics.reduce((sum, item) => sum + item.bookedDays, 0) / userMetrics.length
        : 0,
  };
}

export function buildWeekdayDemandSummary(
  workingDaysInMonth: Date[],
  selectedMonthRoomRows: DailyOccupancyRow[],
) {
  const weekdayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
  const weekdayOccurrences = workingDaysInMonth.reduce<Record<number, number>>((acc, day) => {
    const weekday = day.getDay();
    acc[weekday] = (acc[weekday] || 0) + 1;
    return acc;
  }, {});

  const weekdayDemandMap = selectedMonthRoomRows.reduce<Record<number, number>>((acc, row) => {
    const weekday = row.weekday_index;
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
  const weekdayPeak = Math.max(...weekdayData.map((day) => day.averageDeskDays), 0);
  const weekdayAxisMax = Math.max(5, Math.ceil((weekdayPeak + 1) / 5) * 5);
  const weekdayAverage =
    weekdayData.length > 0
      ? weekdayData.reduce((sum, day) => sum + day.averageDeskDays, 0) / weekdayData.length
      : 0;

  return {
    weekdayData,
    busiestWeekday,
    weekdayAxisMax,
    weekdayAverage,
  };
}

export function expandRawRowsToBusinessDaily(rows: RawOccupancyRow[]) {
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
