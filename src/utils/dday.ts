import type { DeadlineType, ScheduleItem } from '../types';

export interface DdayResult {
  found: boolean;
  label: string;
  diffDays: number | null;
  matchedStep: string | null;
  matchedDate: string | null;
  matchedTime: string | null;
  isUrgent: boolean;
  isExpired: boolean;
  isRolling: boolean;
  rollingLabel: string | null;
}

/**
 * Parses YYYY-MM-DD strictly into a local midnight Date.
 * Returns null if the string is not a valid YYYY-MM-DD date.
 */
export function parseYyyyMmDd(dateStr: string | null | undefined): Date | null {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr.trim());
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const d = new Date(year, month - 1, day);
  if (
    d.getFullYear() !== year ||
    d.getMonth() !== month - 1 ||
    d.getDate() !== day
  ) {
    return null;
  }
  return d;
}

/**
 * Calculates D-day against today's local date from a YYYY-MM-DD string.
 */
export function diffDaysFromToday(dateStr: string | null | undefined): number | null {
  const target = parseYyyyMmDd(dateStr);
  if (!target) return null;

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const msPerDay = 1000 * 60 * 60 * 24;
  return Math.round((target.getTime() - today.getTime()) / msPerDay);
}

function makeEmptyDday(deadlineType?: DeadlineType | null): DdayResult {
  if (deadlineType === 'rolling') {
    return {
      found: false,
      label: '상시채용',
      diffDays: null,
      matchedStep: null,
      matchedDate: null,
      matchedTime: null,
      isUrgent: false,
      isExpired: false,
      isRolling: true,
      rollingLabel: '상시채용',
    };
  }
  if (deadlineType === 'until_hired') {
    return {
      found: false,
      label: '채용 시 마감',
      diffDays: null,
      matchedStep: null,
      matchedDate: null,
      matchedTime: null,
      isUrgent: false,
      isExpired: false,
      isRolling: true,
      rollingLabel: '채용 시 마감',
    };
  }
  return {
    found: false,
    label: '공고에 없음',
    diffDays: null,
    matchedStep: null,
    matchedDate: null,
    matchedTime: null,
    isUrgent: false,
    isExpired: false,
    isRolling: false,
    rollingLabel: null,
  };
}

/**
 * Finds the document/application deadline item in schedule and computes D-day
 * in app code (never relying on AI to compute D-day).
 */
export function calculateDocumentDeadlineDday(
  schedule: ScheduleItem[] | null | undefined,
  deadlineType?: DeadlineType | null
): DdayResult {
  if (!Array.isArray(schedule) || schedule.length === 0) {
    return makeEmptyDday(deadlineType);
  }

  // Check if schedule explicitly mentions rolling/until_hired even without date
  const hasRollingText = schedule.some((s) => {
    const t = `${s?.step ?? ''} ${s?.source ?? ''}`.replace(/\s+/g, '');
    return t.includes('상시채용') || t.includes('채용시마감') || t.includes('충원시마감');
  });
  const inferredType: DeadlineType | null | undefined =
    deadlineType ??
    (hasRollingText
      ? schedule.some((s) => `${s?.step ?? ''} ${s?.source ?? ''}`.replace(/\s+/g, '').includes('상시'))
        ? 'rolling'
        : 'until_hired'
      : null);

  const validItems = schedule.filter(
    (s) => s && typeof s.date === 'string' && parseYyyyMmDd(s.date) !== null
  );

  if (validItems.length === 0) {
    return makeEmptyDday(inferredType);
  }

  const scoreStep = (step: string | null): number => {
    if (!step) return 0;
    const normalized = step.replace(/\s+/g, '');
    const hasDocOrApply =
      normalized.includes('서류') ||
      normalized.includes('원서') ||
      normalized.includes('지원서') ||
      normalized.includes('접수');
    const hasDeadline =
      normalized.includes('마감') ||
      normalized.includes('종료') ||
      normalized.includes('기한');

    if (normalized.includes('서류') && hasDeadline) return 100;
    if ((normalized.includes('원서') || normalized.includes('접수')) && hasDeadline) return 90;
    if (normalized.includes('서류접수') || normalized.includes('원서접수')) return 80;
    if (normalized.includes('서류전형') && !normalized.includes('발표')) return 70;
    if (hasDocOrApply && !normalized.includes('발표') && !normalized.includes('합격')) return 60;
    if (hasDeadline) return 40;
    return 0;
  };

  let bestItem: ScheduleItem | null = null;
  let bestScore = 0;

  for (const item of validItems) {
    const score = scoreStep(item.step);
    if (score > bestScore) {
      bestScore = score;
      bestItem = item;
    }
  }

  if (!bestItem || bestScore === 0) {
    return makeEmptyDday(inferredType);
  }

  const diffDays = diffDaysFromToday(bestItem.date);
  if (diffDays === null) {
    return makeEmptyDday(inferredType);
  }

  let label = '';
  if (diffDays > 0) {
    label = `서류 마감 D-${diffDays}`;
  } else if (diffDays === 0) {
    label = '서류 마감 D-Day';
  } else {
    label = `서류 마감 D+${Math.abs(diffDays)}`;
  }

  return {
    found: true,
    label,
    diffDays,
    matchedStep: bestItem.step ?? null,
    matchedDate: bestItem.date ?? null,
    matchedTime: bestItem.time ?? null,
    isUrgent: diffDays >= 0 && diffDays <= 7,
    isExpired: diffDays < 0,
    isRolling: false,
    rollingLabel: null,
  };
}
