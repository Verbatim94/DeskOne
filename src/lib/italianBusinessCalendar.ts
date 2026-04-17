import { addDays, endOfMonth, format, startOfMonth } from 'date-fns';

export const BUSINESS_CALENDAR_START = new Date(2026, 0, 1);
export const BUSINESS_CALENDAR_END = new Date(2036, 11, 31);

type CalendarDay = {
  date: string;
  month: string;
  year: number;
  isWorkingDay: boolean;
  holidayName?: string;
};

const calendarMap = new Map<string, CalendarDay>();

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

function buildHolidayMapForYear(year: number) {
  const easterMonday = getEasterSunday(year);
  easterMonday.setDate(easterMonday.getDate() + 1);

  return new Map<string, string>([
    [format(new Date(year, 0, 1), 'yyyy-MM-dd'), 'Capodanno'],
    [format(new Date(year, 0, 6), 'yyyy-MM-dd'), 'Epifania'],
    [format(new Date(year, 3, 25), 'yyyy-MM-dd'), 'Festa della Liberazione'],
    [format(new Date(year, 4, 1), 'yyyy-MM-dd'), 'Festa del Lavoro'],
    [format(new Date(year, 5, 2), 'yyyy-MM-dd'), 'Festa della Repubblica'],
    [format(new Date(year, 7, 15), 'yyyy-MM-dd'), 'Ferragosto'],
    [format(new Date(year, 10, 1), 'yyyy-MM-dd'), 'Ognissanti'],
    [format(new Date(year, 11, 8), 'yyyy-MM-dd'), 'Immacolata Concezione'],
    [format(new Date(year, 11, 25), 'yyyy-MM-dd'), 'Natale'],
    [format(new Date(year, 11, 26), 'yyyy-MM-dd'), 'Santo Stefano'],
    [format(easterMonday, 'yyyy-MM-dd'), "Lunedi dell'Angelo"],
  ]);
}

for (let year = BUSINESS_CALENDAR_START.getFullYear(); year <= BUSINESS_CALENDAR_END.getFullYear(); year += 1) {
  const holidayMap = buildHolidayMapForYear(year);
  let cursor = startOfMonth(new Date(year, 0, 1));
  const lastDay = endOfMonth(new Date(year, 11, 1));

  while (cursor <= lastDay) {
    const dateKey = format(cursor, 'yyyy-MM-dd');
    const holidayName = holidayMap.get(dateKey);
    const weekday = cursor.getDay();
    const isWeekend = weekday === 0 || weekday === 6;

    calendarMap.set(dateKey, {
      date: dateKey,
      month: format(cursor, 'yyyy-MM'),
      year,
      isWorkingDay: !isWeekend && !holidayName,
      holidayName,
    });

    cursor = addDays(cursor, 1);
  }
}

export const INSIGHT_MONTH_OPTIONS = Array.from({ length: (2036 - 2026 + 1) * 12 }).map((_, index) => {
  const date = new Date(2026, index, 1);
  return {
    value: format(date, 'yyyy-MM'),
    label: format(date, 'MMMM yyyy'),
    date,
  };
});

export function isItalianBusinessDay(date: Date | string) {
  const key = typeof date === 'string' ? date : format(date, 'yyyy-MM-dd');
  return calendarMap.get(key)?.isWorkingDay ?? false;
}

export function getBusinessDaysBetween(start: Date, end: Date) {
  const days: Date[] = [];
  let cursor = new Date(start);

  while (cursor <= end) {
    if (isItalianBusinessDay(cursor)) {
      days.push(new Date(cursor));
    }
    cursor = addDays(cursor, 1);
  }

  return days;
}
