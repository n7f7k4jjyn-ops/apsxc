export function getCalendarDays(year: number, month: number): (number | null)[] {
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const mondayFirstOffset = (new Date(year, month, 1).getDay() + 6) % 7
  const cellCount = Math.ceil((mondayFirstOffset + daysInMonth) / 7) * 7

  return Array.from({ length: cellCount }, (_, index) => {
    const day = index - mondayFirstOffset + 1
    return day > 0 && day <= daysInMonth ? day : null
  })
}
