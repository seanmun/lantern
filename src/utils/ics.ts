/**
 * Minimal iCalendar (.ics) builder for all-day reminder events, so stake end
 * dates can go into any calendar app. Generated in the browser; nothing is sent anywhere.
 */

export interface CalendarEvent {
  uid: string;
  title: string;
  date: Date;         // all-day event on this UTC date
  description: string;
  alarmDaysBefore?: number;
}

const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;
const stamp = (d: Date) => `${ymd(d)}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
const escape = (text: string) => text.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1');

/** RFC 5545 caps lines at 75 octets; continuation lines start with a space. */
function fold(line: string): string {
  const parts: string[] = [];
  for (let i = 0; i < line.length; i += 73) parts.push(line.slice(i, i + 73));
  return parts.join('\r\n ');
}

export function buildIcs(events: CalendarEvent[]): string {
  const now = stamp(new Date());
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Lantern//HEX stakes//EN', 'CALSCALE:GREGORIAN'];

  for (const event of events) {
    const next = new Date(event.date.getTime() + 86_400_000);
    lines.push(
      'BEGIN:VEVENT',
      `UID:${event.uid}`,
      `DTSTAMP:${now}`,
      `DTSTART;VALUE=DATE:${ymd(event.date)}`,
      `DTEND;VALUE=DATE:${ymd(next)}`,
      `SUMMARY:${escape(event.title)}`,
      `DESCRIPTION:${escape(event.description)}`
    );
    if (event.alarmDaysBefore) {
      lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${escape(event.title)}`, `TRIGGER:-P${event.alarmDaysBefore}D`, 'END:VALARM');
    }
    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}

export function downloadFile(filename: string, content: string, type = 'text/calendar;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
