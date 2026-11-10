/** Offer dates run from 05:00 to 05:00 Europe/Madrid, including DST changes. */
export function madridDailyOfferDay(now = new Date()): {
  dayKey: string;
  saturday: boolean;
} {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  // Subtract a calendar date, rather than five elapsed hours: the clocks can
  // change between midnight and publication on the DST transition dates.
  const date = new Date(
    Date.UTC(
      Number(values.year),
      Number(values.month) - 1,
      Number(values.day) - (Number(values.hour) < 5 ? 1 : 0),
    ),
  );
  return {
    dayKey: date.toISOString().slice(0, 10),
    saturday: date.getUTCDay() === 6,
  };
}

/** First instant of the next offer date; a late completion cannot move it. */
export function madridDailyOfferEndsAt(now = new Date()): string {
  const dayKey = madridDailyOfferDay(now).dayKey;
  let low = now.getTime();
  let high = low + 30 * 60 * 60 * 1000;
  while (high - low > 1) {
    const mid = Math.floor((low + high) / 2);
    if (madridDailyOfferDay(new Date(mid)).dayKey === dayKey) low = mid;
    else high = mid;
  }
  return new Date(high).toISOString();
}
