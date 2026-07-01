export function monthsForSchoolYear(schoolYear) {
  const months = [];
  for (let month = 8; month <= 12; month++) {
    months.push({ year: schoolYear, month });
  }
  for (let month = 1; month <= 7; month++) {
    months.push({ year: schoolYear + 1, month });
  }
  return months;
}

export function monthOrderValue(monthRef) {
  return monthRef.year * 12 + monthRef.month;
}

export function isoWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

export function toCalendarIsoDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getYearlyCalendarTodayMarker(currentDate = new Date()) {
  return {
    date: toCalendarIsoDate(currentDate),
    weekNumber: isoWeek(currentDate),
    monthValue: monthOrderValue({
      year: currentDate.getFullYear(),
      month: currentDate.getMonth() + 1,
    }),
  };
}

export function getYearlyCalendarMonthGroups(schoolYear, currentDate = new Date()) {
  const months = monthsForSchoolYear(schoolYear);
  const currentMonthValue = monthOrderValue({
    year: currentDate.getFullYear(),
    month: currentDate.getMonth() + 1,
  });
  const currentAndUpcoming = months.filter(
    (monthRef) => monthOrderValue(monthRef) >= currentMonthValue,
  );
  const past = months
    .filter((monthRef) => monthOrderValue(monthRef) < currentMonthValue)
    .sort((a, b) => monthOrderValue(b) - monthOrderValue(a));

  return { currentAndUpcoming, past };
}
