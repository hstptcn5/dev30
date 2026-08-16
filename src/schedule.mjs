const WEEKDAYS = Object.freeze(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']);

export function validEmail(value) {
  const email = String(value || '').trim();
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function validTimezone(value) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: String(value || '') }).format(new Date());
    return Boolean(String(value || '').trim());
  } catch {
    return false;
  }
}

function localParts(date, timezone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

export function nextScheduledRun({ dayOfWeek, hourLocal, timezone, after = new Date() }) {
  const day = Number(dayOfWeek);
  const hour = Number(hourLocal);
  if (!Number.isInteger(day) || day < 0 || day > 6) throw new Error('dayOfWeek must be an integer from 0 (Sunday) to 6 (Saturday).');
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) throw new Error('hourLocal must be an integer from 0 to 23.');
  if (!validTimezone(timezone)) throw new Error('Enter a valid IANA timezone.');

  const start = new Date(after);
  const cursor = new Date(Math.floor(start.getTime() / (15 * 60 * 1000)) * 15 * 60 * 1000 + 15 * 60 * 1000);
  const maxSteps = 15 * 24 * 4;
  for (let index = 0; index < maxSteps; index += 1) {
    const parts = localParts(cursor, timezone);
    if (parts.weekday === WEEKDAYS[day] && Number(parts.hour) === hour && Number(parts.minute) === 0) {
      return new Date(cursor);
    }
    cursor.setTime(cursor.getTime() + 15 * 60 * 1000);
  }
  throw new Error('Unable to resolve the next weekly run in this timezone.');
}

export function schedulePayload(input, { workspaceId, username, after = new Date() } = {}) {
  const email = String(input.email || '').trim();
  const timezone = String(input.timezone || '').trim();
  const dayOfWeek = Number(input.dayOfWeek);
  const hourLocal = Number(input.hourLocal);
  const audience = input.audience === 'founder' ? 'founder' : 'client';
  const days = [7, 30, 90].includes(Number(input.days)) ? Number(input.days) : 7;
  const locale = input.locale === 'vi' ? 'vi' : 'en';
  if (!workspaceId || !username) throw new Error('A connected workspace is required.');
  if (!validEmail(email)) throw new Error('Enter a valid delivery email address.');
  if (!validTimezone(timezone)) throw new Error('Enter a valid IANA timezone.');
  const nextRunAt = nextScheduledRun({ dayOfWeek, hourLocal, timezone, after }).toISOString();
  return {
    workspaceId,
    username,
    email,
    timezone,
    dayOfWeek,
    hourLocal,
    audience,
    days,
    locale,
    enabled: input.enabled !== false,
    nextRunAt,
  };
}

export const __scheduleTest = { WEEKDAYS, localParts };
