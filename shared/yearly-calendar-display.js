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
