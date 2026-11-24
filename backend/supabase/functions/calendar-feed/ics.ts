export interface CalEvent {
  type: string;
  id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  status: string;
  location?: string | null;
}

const stamp = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

/** RFC 5545 line folding at 75 octets. */
function fold(line: string): string {
  const out: string[] = [];
  let rest = line;
  while (new TextEncoder().encode(rest).length > 75) {
    let cut = 75;
    while (new TextEncoder().encode(rest.slice(0, cut)).length > 75) cut--;
    out.push(rest.slice(0, cut));
    rest = ' ' + rest.slice(cut);
  }
  out.push(rest);
  return out.join('\r\n');
}

export function toIcs(events: CalEvent[], name = 'Courtside', now = new Date()): string {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Courtside//Calendar//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', `X-WR-CALNAME:${esc(name)}`];
  for (const e of events) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${e.type}-${e.id}@courtside.app`,
      `DTSTAMP:${stamp(now.toISOString())}`,
      `DTSTART:${stamp(e.starts_at)}`,
      `DTEND:${stamp(e.ends_at)}`,
      `SUMMARY:${esc(e.title)}`,
      `CATEGORIES:${e.type.toUpperCase()}`,
      `STATUS:${e.status === 'pending_payment' || e.status === 'planned' ? 'TENTATIVE' : 'CONFIRMED'}`,
      ...(e.location ? [`LOCATION:${esc(e.location)}`] : []),
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}
