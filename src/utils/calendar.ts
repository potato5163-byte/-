import type { JobAnalysis, SavedAnnouncement } from '../types';
import { diffDaysFromToday, parseYyyyMmDd } from './dday';

function escapeIcsText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

function formatUtcStamp(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  const hh = String(date.getUTCHours()).padStart(2, '0');
  const mm = String(date.getUTCMinutes()).padStart(2, '0');
  const ss = String(date.getUTCSeconds()).padStart(2, '0');
  return `${y}${m}${d}T${hh}${mm}${ss}Z`;
}

function parseHhMm(timeStr: string | null): { hour: number; minute: number } | null {
  if (!timeStr) return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(timeStr.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { hour, minute };
}

function appendScheduleEventLines(
  lines: string[],
  dtstamp: string,
  uidSuffix: string,
  org: string,
  position: string,
  stepName: string,
  dateStr: string,
  timeStr: string | null,
  source: string | null
): boolean {
  const parsedDate = parseYyyyMmDd(dateStr);
  if (!parsedDate) return false;

  const yyyy = String(parsedDate.getFullYear());
  const mm = String(parsedDate.getMonth() + 1).padStart(2, '0');
  const dd = String(parsedDate.getDate()).padStart(2, '0');
  const compactDate = `${yyyy}${mm}${dd}`;

  const summary = `[${org}] ${stepName}`;
  const descParts: string[] = [];
  if (position) descParts.push(`모집분야: ${position}`);
  if (source) descParts.push(`공고 원문: ${source}`);
  const description = descParts.join('\n');

  const parsedTime = parseHhMm(timeStr);

  lines.push('BEGIN:VEVENT');
  lines.push(`UID:gonggo-${compactDate}-${uidSuffix}@gonggojeongri.local`);
  lines.push(`DTSTAMP:${dtstamp}`);

  if (parsedTime) {
    const startDt = new Date(
      parsedDate.getFullYear(),
      parsedDate.getMonth(),
      parsedDate.getDate(),
      parsedTime.hour,
      parsedTime.minute
    );
    const endDt = new Date(startDt.getTime() + 60 * 60 * 1000);
    const formatLocalStamp = (dt: Date): string => {
      const y = String(dt.getFullYear());
      const m = String(dt.getMonth() + 1).padStart(2, '0');
      const d = String(dt.getDate()).padStart(2, '0');
      const hh = String(dt.getHours()).padStart(2, '0');
      const min = String(dt.getMinutes()).padStart(2, '0');
      return `${y}${m}${d}T${hh}${min}00`;
    };
    lines.push(`DTSTART;TZID=Asia/Seoul:${formatLocalStamp(startDt)}`);
    lines.push(`DTEND;TZID=Asia/Seoul:${formatLocalStamp(endDt)}`);
  } else {
    const nextDay = new Date(
      parsedDate.getFullYear(),
      parsedDate.getMonth(),
      parsedDate.getDate() + 1
    );
    const ny = String(nextDay.getFullYear());
    const nm = String(nextDay.getMonth() + 1).padStart(2, '0');
    const nd = String(nextDay.getDate()).padStart(2, '0');
    lines.push(`DTSTART;VALUE=DATE:${compactDate}`);
    lines.push(`DTEND;VALUE=DATE:${ny}${nm}${nd}`);
  }

  lines.push(`SUMMARY:${escapeIcsText(summary)}`);
  if (description) {
    lines.push(`DESCRIPTION:${escapeIcsText(description)}`);
  }
  lines.push('BEGIN:VALARM');
  lines.push('TRIGGER:-P1D');
  lines.push('ACTION:DISPLAY');
  lines.push(`DESCRIPTION:${escapeIcsText(`${summary} 하루 전 알림`)}`);
  lines.push('END:VALARM');
  lines.push('END:VEVENT');
  return true;
}

function triggerIcsDownload(lines: string[], filename: string): void {
  const blob = new Blob([lines.join('\r\n')], {
    type: 'text/calendar;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function hasExportableSchedule(analysis: JobAnalysis): boolean {
  if (!Array.isArray(analysis.schedule)) return false;
  return analysis.schedule.some((item) => item && parseYyyyMmDd(item.date) !== null);
}

export function downloadScheduleIcs(analysis: JobAnalysis): boolean {
  if (!Array.isArray(analysis.schedule)) return false;

  const validSchedules = analysis.schedule.filter(
    (item) => item && parseYyyyMmDd(item.date) !== null
  );
  if (validSchedules.length === 0) return false;

  const org = analysis.organization?.trim() || '공고정리';
  const position = analysis.position?.trim() || '';
  const dtstamp = formatUtcStamp(new Date());

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//GonggoJeongri//Job Schedule//KO',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ];

  validSchedules.forEach((item, idx) => {
    if (!item.date) return;
    appendScheduleEventLines(
      lines,
      dtstamp,
      `${idx}-${Date.now()}`,
      org,
      position,
      item.step?.trim() || '채용 전형 일정',
      item.date,
      item.time,
      item.source
    );
  });

  lines.push('END:VCALENDAR');
  const safeFileOrg = org.replace(/[\\/:*?"<>|]/g, '_');
  triggerIcsDownload(lines, `${safeFileOrg}_채용일정.ics`);
  return true;
}

export function downloadAllSchedulesIcs(
  items: SavedAnnouncement[],
  onlyUpcoming = true
): number {
  const dtstamp = formatUtcStamp(new Date());
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//GonggoJeongri//Job Schedule//KO',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ];

  let count = 0;
  items.forEach((ann, annIdx) => {
    if (ann.applicationStatus === '보류' || ann.applicationStatus === '불합격') return;
    const scheds = Array.isArray(ann.analysis.schedule) ? ann.analysis.schedule : [];
    const org = ann.analysis.organization?.trim() || '공고정리';
    const position = ann.analysis.position?.trim() || '';

    scheds.forEach((sched, schedIdx) => {
      if (!sched?.date) return;
      const diff = diffDaysFromToday(sched.date);
      if (diff === null) return;
      if (onlyUpcoming && diff < 0) return;

      const added = appendScheduleEventLines(
        lines,
        dtstamp,
        `all-${annIdx}-${schedIdx}-${Date.now()}`,
        org,
        position,
        sched.step?.trim() || '채용 전형 일정',
        sched.date,
        sched.time,
        sched.source
      );
      if (added) count += 1;
    });
  });

  if (count === 0) return 0;

  lines.push('END:VCALENDAR');
  const dateTag = new Date().toISOString().slice(0, 10);
  triggerIcsDownload(lines, `공고정리_통합일정_${dateTag}.ics`);
  return count;
}
