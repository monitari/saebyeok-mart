// Work roster: weekly base shifts plus dated exceptions (substitute, leave, late, overtime).
import { FIRST_WEEKDAY } from './data.js';

export const EXCEPTION_TYPES = { substitute: '대타', leave: '휴가', late: '지각', overtime: '연장 근무' };
export const weekdayOf = day => (FIRST_WEEKDAY + day - 1) % 7;

// Shifts that start on `day` (1-based), resolved to absolute game minutes.
export function shiftsForDay(roster, day) {
  const dayStart = (day - 1) * 1440;
  const list = (roster.base[weekdayOf(day)] ?? []).map(s => ({ day, id: s.id, label: s.label, worker: s.worker, planned: s.worker, start: dayStart + s.start, end: dayStart + s.end, notes: [] }));
  for (const x of roster.exceptions) {
    if (x.day !== day) continue;
    const i = list.findIndex(s => s.id === x.shift);
    if (i < 0) continue;
    const s = list[i];
    if (x.type === 'substitute' && x.worker) { s.notes.push('대타'); s.worker = x.worker; s.substituted = true; s.onLeave = false; }
    if (x.type === 'leave') { s.notes.push('휴가'); if (!s.substituted) s.onLeave = true; }
    if (x.type === 'late' && x.minutes > 0) { s.start += x.minutes; s.notes.push(`지각 ${x.minutes}분`); s.lateBy = x.minutes; }
    if (x.type === 'overtime' && x.minutes > 0) { s.end += x.minutes; s.notes.push(`연장 ${x.minutes}분`); }
  }
  return list;
}

// Continuous coverage over the previous and current day. Gaps (lateness, leave with no cover)
// are filled by the previous shift's worker staying on, recorded as overtime.
export function timeline(roster, day) {
  const segs = [...(day > 1 ? shiftsForDay(roster, day - 1) : []), ...shiftsForDay(roster, day), ...shiftsForDay(roster, day + 1)];
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    if (s.onLeave) {
      const prev = segs[i - 1];
      if (prev) { prev.end = s.end; prev.notes.push('휴가 대신 연장'); }
      s.start = s.end;
    }
    const prev = segs[i - 1];
    if (prev && prev.end < s.start) { prev.end = s.start; if (s.lateBy) prev.notes.push(`지각 대신 ${s.lateBy}분 연장`); }
    if (prev && prev.end > s.start) s.start = prev.end;
  }
  return segs.filter(s => s.end > s.start);
}

export function workerAt(roster, minute) {
  const day = Math.floor(minute / 1440) + 1;
  const seg = timeline(roster, day).find(s => minute >= s.start && minute < s.end);
  return seg ?? null;
}

export function validateException(x, workers) {
  if (!x || typeof x !== 'object') return '형식이 올바르지 않아요.';
  if (!Number.isInteger(x.day) || x.day < 1 || x.day > 9999) return '날짜를 확인해 주세요.';
  if (!['am', 'pm', 'night'].includes(x.shift)) return '근무 시간대를 확인해 주세요.';
  if (!EXCEPTION_TYPES[x.type]) return '예외 종류를 확인해 주세요.';
  if (x.type === 'substitute' && !workers.includes(x.worker)) return '대타 알바생을 골라 주세요.';
  if ((x.type === 'late' || x.type === 'overtime') && !(Number.isInteger(x.minutes) && x.minutes > 0 && x.minutes <= 240)) return '시간은 1분에서 240분 사이로 적어 주세요.';
  return null;
}
