import React, { useMemo, useRef, useState } from 'react';
import {
  APPLICATION_STATUSES,
  type ApplicationStatus,
  type SavedAnnouncement,
} from '../types';
import {
  calculateDocumentDeadlineDday,
  diffDaysFromToday,
  parseYyyyMmDd,
} from '../utils/dday';
import {
  evaluateSpecMatching,
  type LanguageSpec,
  type UserProfileMeta,
} from '../utils/specMatching';
import { downloadAllSchedulesIcs } from '../utils/calendar';
import { exportAnnouncementsCsv } from '../utils/storage';
import { Mascot } from './Mascot';
import { SpecSimulator } from './SpecSimulator';

interface SavedListViewProps {
  items: SavedAnnouncement[];
  certificates: string[];
  languageSpecs: LanguageSpec[];
  skills: string[];
  profileMeta: UserProfileMeta;
  onSelectAnnouncement: (id: string) => void;
  onChangeAnnouncementStatus?: (id: string, status: ApplicationStatus) => void;
  onToggleCompare: (id: string) => void;
  onTogglePin: (id: string) => void;
  onDuplicateAnnouncement?: (id: string) => void;
  onClearCompare: () => void;
  onDeleteAnnouncement: (id: string) => void;
  onCreateManualAnnouncement: () => void;
  onGoAnalyze: () => void;
  onExportBackup: () => void;
  onImportBackup: (file: File) => void;
  backupMessage: string | null;
}

function toSafeHttpUrl(raw?: string | null): string | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.toString();
    }
    return null;
  } catch {
    if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed) && /\./.test(trimmed)) {
      try {
        const parsed = new URL(`https://${trimmed}`);
        return parsed.toString();
      } catch {
        return null;
      }
    }
    return null;
  }
}

type ListViewMode = 'list' | 'calendar' | 'sim';
type SortMode = 'deadline' | 'recent';
type FilterMode =
  | 'all'
  | 'public'
  | 'private'
  | 'eligible'
  | 'planned'
  | 'applied'
  | 'passed';

function formatKoreanShortDate(
  dateStr: string | null,
  timeStr: string | null
): string {
  if (!dateStr) return '일정 미정';
  const d = parseYyyyMmDd(dateStr);
  if (!d) return timeStr ? `${dateStr} ${timeStr}` : dateStr;
  const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const dayLabel = weekdays[d.getDay()];
  return `${mm}.${dd}(${dayLabel})${timeStr ? ` ${timeStr}` : ''}`;
}

function getStatusBadgeStyle(status: ApplicationStatus): string {
  switch (status) {
    case '서류 합격':
    case '필기 합격':
    case '최종 합격':
      return 'bg-tertiary-fixed text-on-tertiary-fixed';
    case '지원 완료':
      return 'bg-secondary text-on-secondary';
    case '불합격':
      return 'bg-error-container/70 text-on-error-container';
    case '보류':
      return 'bg-surface-container-high text-outline';
    default:
      return 'bg-surface-container-high text-on-surface-variant';
  }
}

export const SavedListView: React.FC<SavedListViewProps> = ({
  items,
  certificates,
  languageSpecs,
  skills,
  profileMeta,
  onSelectAnnouncement,
  onChangeAnnouncementStatus,
  onToggleCompare,
  onTogglePin,
  onDuplicateAnnouncement,
  onClearCompare,
  onDeleteAnnouncement,
  onCreateManualAnnouncement,
  onGoAnalyze,
  onExportBackup,
  onImportBackup,
  backupMessage,
}) => {
  const [viewMode, setViewMode] = useState<ListViewMode>('list');
  const [sortMode, setSortMode] = useState<SortMode>('deadline');
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [hideExpiredInList, setHideExpiredInList] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [compareCollapsed, setCompareCollapsed] = useState(false);
  const [hidePastEvents, setHidePastEvents] = useState(false);
  const [localNotice, setLocalNotice] = useState<string | null>(null);
  const backupInputRef = useRef<HTMLInputElement>(null);

  const showTempLocalNotice = (msg: string) => {
    setLocalNotice(msg);
    window.setTimeout(() => {
      setLocalNotice((prev) => (prev === msg ? null : prev));
    }, 3200);
  };

  const enrichedItems = useMemo(() => {
    const mapped = items.map((item) => {
      const dday = calculateDocumentDeadlineDday(
        item.analysis.schedule,
        item.analysis.deadline_type
      );
      const specMatch = evaluateSpecMatching(
        item.analysis,
        certificates,
        languageSpecs,
        item.bonusOverrides,
        skills,
        profileMeta,
        dday.matchedDate
      );
      const docs = Array.isArray(item.analysis.documents)
        ? item.analysis.documents
        : [];
      const totalDocs = docs.length;
      const completedDocs = docs.reduce(
        (acc, _, idx) => (item.checkedDocs?.[idx] ? acc + 1 : acc),
        0
      );
      const progressPct =
        totalDocs > 0 ? Math.round((completedDocs / totalDocs) * 100) : 0;

      const matchedBonusNames = specMatch.bonusResults
        .filter((b) => b.matched)
        .map((b) => b.title);

      return {
        item,
        dday,
        specMatch,
        totalDocs,
        completedDocs,
        progressPct,
        matchedBonusNames,
      };
    });

    if (sortMode === 'recent') {
      return [...mapped].sort((a, b) => {
        if (Boolean(a.item.isPinned) !== Boolean(b.item.isPinned)) {
          return a.item.isPinned ? -1 : 1;
        }
        return (
          new Date(b.item.updatedAt).getTime() -
          new Date(a.item.updatedAt).getTime()
        );
      });
    }

    return [...mapped].sort((a, b) => {
      if (Boolean(a.item.isPinned) !== Boolean(b.item.isPinned)) {
        return a.item.isPinned ? -1 : 1;
      }
      const da = a.dday.diffDays;
      const db = b.dday.diffDays;
      if (da === null && db === null) return 0;
      if (da === null) return 1;
      if (db === null) return -1;
      const aExpired = da < 0;
      const bExpired = db < 0;
      if (aExpired !== bExpired) return aExpired ? 1 : -1;
      return da - db;
    });
  }, [items, certificates, languageSpecs, skills, profileMeta, sortMode]);

  const urgentPlannedItems = useMemo(
    () =>
      enrichedItems.filter(
        ({ item, dday }) =>
          item.applicationStatus === '지원 예정' &&
          dday.found &&
          dday.diffDays !== null &&
          dday.diffDays >= 0 &&
          dday.diffDays <= 3
      ),
    [enrichedItems]
  );

  const briefingData = useMemo(() => {
    const planned = enrichedItems.filter(
      ({ item }) => item.applicationStatus === '지원 예정'
    );
    const weekDeadlines = planned.filter(
      ({ dday }) =>
        dday.found &&
        dday.diffDays !== null &&
        dday.diffDays >= 0 &&
        dday.diffDays <= 7
    );
    const incompletePlanned = planned.filter(({ item, totalDocs, completedDocs }) => {
      const docsIncomplete = totalDocs > 0 && completedDocs < totalDocs;
      const essays = Array.isArray(item.analysis.essay_questions)
        ? item.analysis.essay_questions
        : [];
      const essayIncomplete = essays.some(
        (_, idx) => !(item.essayDrafts?.[idx] ?? '').trim()
      );
      return docsIncomplete || essayIncomplete;
    });

    const seenIds = new Set<string>();
    const quickItems: Array<{
      id: string;
      org: string;
      tag: string;
      urgent: boolean;
    }> = [];

    for (const entry of weekDeadlines) {
      if (quickItems.length >= 4) break;
      seenIds.add(entry.item.id);
      quickItems.push({
        id: entry.item.id,
        org: entry.item.analysis.organization?.trim() || '기관명 미입력',
        tag:
          entry.dday.diffDays === 0
            ? '오늘 마감'
            : `D-${entry.dday.diffDays}`,
        urgent: (entry.dday.diffDays ?? 99) <= 3,
      });
    }

    for (const entry of incompletePlanned) {
      if (quickItems.length >= 4) break;
      if (seenIds.has(entry.item.id)) continue;
      seenIds.add(entry.item.id);
      const essays = Array.isArray(entry.item.analysis.essay_questions)
        ? entry.item.analysis.essay_questions
        : [];
      const essayRemaining = essays.filter(
        (_, idx) => !(entry.item.essayDrafts?.[idx] ?? '').trim()
      ).length;
      const docsRemaining = Math.max(0, entry.totalDocs - entry.completedDocs);
      const tag =
        docsRemaining > 0 && essayRemaining > 0
          ? `서류·자소서 미완`
          : docsRemaining > 0
            ? `미완료 서류 ${docsRemaining}건`
            : `자소서 ${essayRemaining}문항`;
      quickItems.push({
        id: entry.item.id,
        org: entry.item.analysis.organization?.trim() || '기관명 미입력',
        tag,
        urgent: false,
      });
    }

    return {
      plannedCount: planned.length,
      weekDeadlineCount: weekDeadlines.length,
      incompleteCount: incompletePlanned.length,
      quickItems,
    };
  }, [enrichedItems]);

  const statusCounts = useMemo(() => {
    let planned = 0;
    let inProgress = 0;
    let finalPassed = 0;
    for (const item of items) {
      if (item.applicationStatus === '지원 예정') planned += 1;
      else if (item.applicationStatus === '최종 합격') finalPassed += 1;
      else if (
        item.applicationStatus === '지원 완료' ||
        item.applicationStatus === '서류 합격' ||
        item.applicationStatus === '필기 합격'
      ) {
        inProgress += 1;
      }
    }
    return {
      total: items.length,
      planned,
      inProgress,
      finalPassed,
    };
  }, [items]);

  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return enrichedItems.filter(({ item, dday, specMatch }) => {
      if (
        hideExpiredInList &&
        (dday.isExpired || item.applicationStatus === '불합격')
      ) {
        return false;
      }
      if (filterMode === 'public' && item.analysis.company_type !== '공기업') {
        return false;
      }
      if (filterMode === 'private' && item.analysis.company_type !== '사기업') {
        return false;
      }
      if (filterMode === 'eligible' && specMatch.overallStatus !== 'eligible') {
        return false;
      }
      if (filterMode === 'planned' && item.applicationStatus !== '지원 예정') {
        return false;
      }
      if (filterMode === 'applied' && item.applicationStatus !== '지원 완료') {
        return false;
      }
      if (
        filterMode === 'passed' &&
        !['서류 합격', '필기 합격', '최종 합격'].includes(item.applicationStatus)
      ) {
        return false;
      }

      if (!q) return true;
      const org = (item.analysis.organization ?? '').toLowerCase();
      const pos = (item.analysis.position ?? '').toLowerCase();
      const loc = (item.analysis.location ?? '').toLowerCase();
      const memo = (item.memo ?? '').toLowerCase();
      const tech = Array.isArray(item.analysis.tech_skills)
        ? item.analysis.tech_skills.join(' ').toLowerCase()
        : '';
      return (
        org.includes(q) ||
        pos.includes(q) ||
        loc.includes(q) ||
        memo.includes(q) ||
        tech.includes(q)
      );
    });
  }, [enrichedItems, filterMode, searchQuery, hideExpiredInList]);

  const selectedForCompare = useMemo(
    () => enrichedItems.filter((entry) => entry.item.selectedForCompare),
    [enrichedItems]
  );

  const comparePair = selectedForCompare.slice(0, 2);

  const scheduleOverlaps = useMemo(() => {
    if (comparePair.length < 2) return [];
    const firstSchedules = Array.isArray(comparePair[0].item.analysis.schedule)
      ? comparePair[0].item.analysis.schedule
      : [];
    const secondSchedules = Array.isArray(comparePair[1].item.analysis.schedule)
      ? comparePair[1].item.analysis.schedule
      : [];

    const overlaps: Array<{ date: string; stepA: string; stepB: string }> = [];
    const seen = new Set<string>();
    for (const sA of firstSchedules) {
      if (!sA.date || !parseYyyyMmDd(sA.date)) continue;
      for (const sB of secondSchedules) {
        if (sB.date === sA.date) {
          const stepA = sA.step?.trim() || '전형';
          const stepB = sB.step?.trim() || '전형';
          const key = `${sA.date}|${stepA}|${stepB}`;
          if (!seen.has(key)) {
            seen.add(key);
            overlaps.push({
              date: sA.date,
              stepA,
              stepB,
            });
          }
        }
      }
    }
    return overlaps;
  }, [comparePair]);

  // Unified timeline across all saved announcements
  const { timelineGroups, pastEventsCount } = useMemo(() => {
    const events: Array<{
      announcementId: string;
      organization: string;
      position: string;
      status: ApplicationStatus;
      step: string;
      date: string;
      time: string | null;
      diffDays: number;
    }> = [];

    const dateCountMap: Record<string, number> = {};
    let pastCount = 0;

    for (const item of items) {
      const scheds = Array.isArray(item.analysis.schedule)
        ? item.analysis.schedule
        : [];
      for (const s of scheds) {
        if (!s.date || !parseYyyyMmDd(s.date)) continue;
        const diff = diffDaysFromToday(s.date);
        if (diff === null) continue;
        if (diff < 0) pastCount += 1;
        if (hidePastEvents && diff < 0) continue;
        dateCountMap[s.date] = (dateCountMap[s.date] ?? 0) + 1;
        events.push({
          announcementId: item.id,
          organization: item.analysis.organization?.trim() || '기관명 미입력',
          position: item.analysis.position?.trim() || '',
          status: item.applicationStatus,
          step: s.step?.trim() || '채용 전형',
          date: s.date,
          time: s.time ?? null,
          diffDays: diff,
        });
      }
    }

    events.sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      return (a.time ?? '99:99').localeCompare(b.time ?? '99:99');
    });

    const groups: Array<{
      monthKey: string;
      monthLabel: string;
      items: Array<(typeof events)[number] & { sameDayCount: number }>;
    }> = [];

    for (const ev of events) {
      const [yyyy, mm] = ev.date.split('-');
      const monthKey = `${yyyy}-${mm}`;
      const monthLabel = `${yyyy}년 ${Number(mm)}월`;
      let group = groups.find((g) => g.monthKey === monthKey);
      if (!group) {
        group = { monthKey, monthLabel, items: [] };
        groups.push(group);
      }
      group.items.push({
        ...ev,
        sameDayCount: dateCountMap[ev.date] ?? 1,
      });
    }

    return { timelineGroups: groups, pastEventsCount: pastCount };
  }, [items, hidePastEvents]);

  const filterChips: Array<{ id: FilterMode; label: string }> = [
    { id: 'all', label: '전체' },
    { id: 'public', label: '공기업' },
    { id: 'private', label: '사기업' },
    { id: 'eligible', label: '지원 가능' },
    { id: 'planned', label: '지원 예정' },
    { id: 'applied', label: '지원 완료' },
    { id: 'passed', label: '합격' },
  ];

  const handleBackupFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onImportBackup(file);
    }
    if (backupInputRef.current) {
      backupInputRef.current.value = '';
    }
  };

  const handleExportAllCalendar = () => {
    let exportedCount = downloadAllSchedulesIcs(items, true);
    if (exportedCount === 0) {
      exportedCount = downloadAllSchedulesIcs(items, false);
    }
    if (exportedCount === 0) {
      showTempLocalNotice('내보낼 수 있는 날짜 확정 일정이 없습니다');
      return;
    }
    showTempLocalNotice(`${exportedCount}개 전형 일정을 캘린더(.ics)로 내보냈습니다`);
  };

  const handleExportCsv = () => {
    if (enrichedItems.length === 0) {
      showTempLocalNotice('내보낼 공고가 없습니다');
      return;
    }
    exportAnnouncementsCsv(
      enrichedItems.map((entry) => {
        const ddayLabel = entry.dday.found
          ? entry.dday.label
          : entry.dday.isRolling
            ? entry.dday.rollingLabel ?? '상시채용'
            : '일정 없음';
        const deadlineText = entry.dday.found
          ? `${entry.dday.matchedDate ?? ''}${
              entry.dday.matchedTime ? ` ${entry.dday.matchedTime}` : ''
            }`.trim()
          : entry.dday.isRolling
            ? entry.dday.rollingLabel ?? '상시채용'
            : '';
        const bonusText =
          entry.specMatch.totalBonusPoints > 0
            ? `+${entry.specMatch.totalBonusPoints}점 (${entry.matchedBonusNames.join(', ')})`
            : entry.specMatch.matchedPreferenceCount > 0
              ? `우대 ${entry.specMatch.matchedPreferenceCount}건`
              : entry.specMatch.skillMatch.totalSkills > 0
                ? `역량 ${entry.specMatch.skillMatch.matchedSkills.length}/${entry.specMatch.skillMatch.totalSkills}`
                : '';
        const progressText =
          entry.totalDocs > 0
            ? `${entry.completedDocs}/${entry.totalDocs} (${entry.progressPct}%)`
            : '서류 정보 없음';

        return {
          item: entry.item,
          ddayLabel,
          deadlineText,
          specStatusLabel: entry.specMatch.overallLabel,
          bonusText,
          progressText,
        };
      })
    );
    showTempLocalNotice(`지원 현황 ${enrichedItems.length}건을 CSV(엑셀)로 내려받았습니다`);
  };

  return (
    <div className="flex flex-col w-full pb-10">
      {/* Top Headline & Action Cluster */}
      <div className="flex flex-col gap-3 mb-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-baseline gap-2.5">
            <h1 className="font-headline-lg text-headline-lg text-primary font-bold tracking-tight">
              내 공고
            </h1>
            <span className="font-label-md text-label-md text-secondary tabular-nums">
              총 {items.length}건
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onCreateManualAnnouncement}
              className="inline-flex items-center gap-1 px-3.5 py-2 rounded-xl bg-secondary hover:bg-on-secondary-fixed-variant text-on-secondary font-label-sm text-label-sm shadow-xs active:scale-95 transition-all whitespace-nowrap shrink-0"
            >
              <span className="material-symbols-outlined text-[16px]">add</span>
              <span>직접 추가</span>
            </button>
            {viewMode === 'list' && (
              <button
                type="button"
                onClick={() =>
                  setSortMode((prev) =>
                    prev === 'deadline' ? 'recent' : 'deadline'
                  )
                }
                className="inline-flex items-center gap-1 px-3 py-2 rounded-xl bg-surface-container-lowest border border-[#e2e9f5] text-on-surface-variant hover:text-on-surface font-label-sm text-label-sm shadow-2xs active:scale-95 transition-all whitespace-nowrap shrink-0"
              >
                <span className="material-symbols-outlined text-[16px] text-secondary">
                  {sortMode === 'deadline' ? 'hourglass_top' : 'schedule'}
                </span>
                <span>{sortMode === 'deadline' ? '마감순' : '최신순'}</span>
              </button>
            )}
          </div>
        </div>

        {/* 보기 모드 전환 (공고 목록 / 통합 일정) */}
        <div className="grid grid-cols-3 gap-1 p-1 bg-surface-container rounded-xl border border-[#e2e9f5] lg:max-w-[480px]">
          <button
            type="button"
            onClick={() => setViewMode('list')}
            className={`min-h-[40px] rounded-lg font-label-md text-label-md flex items-center justify-center gap-1.5 transition-all whitespace-nowrap ${
              viewMode === 'list'
                ? 'bg-surface-container-lowest text-secondary shadow-xs'
                : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            <span className="material-symbols-outlined text-[17px]">view_agenda</span>
            <span>공고 목록</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode('calendar')}
            className={`min-h-[40px] rounded-lg font-label-md text-label-md flex items-center justify-center gap-1.5 transition-all whitespace-nowrap ${
              viewMode === 'calendar'
                ? 'bg-surface-container-lowest text-secondary shadow-xs'
                : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            <span className="material-symbols-outlined text-[17px]">calendar_month</span>
            <span>통합 일정</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode('sim')}
            className={`min-h-[40px] rounded-lg font-label-md text-label-md flex items-center justify-center gap-1.5 transition-all whitespace-nowrap ${
              viewMode === 'sim'
                ? 'bg-surface-container-lowest text-secondary shadow-xs'
                : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            <span className="material-symbols-outlined text-[17px]">science</span>
            <span>스펙 시뮬</span>
          </button>
        </div>
      </div>

      {viewMode === 'sim' ? (
        <SpecSimulator
          items={items}
          certificates={certificates}
          languageSpecs={languageSpecs}
          skills={skills}
          profileMeta={profileMeta}
        />
      ) : viewMode === 'calendar' ? (
        /* 통합 채용 일정 타임라인 */
        <div className="space-y-4">
          <div className="brand-card rounded-2xl px-4 py-3 flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex items-center gap-2.5 min-w-0">
              <Mascot variant="explaining" size="md" />
              <div className="min-w-0">
                <p className="font-label-md text-label-md text-on-surface">
                  전체 공고 일정 타임라인
                </p>
                <p className="font-label-sm text-label-sm text-on-surface-variant font-normal">
                  {pastEventsCount > 0
                    ? `지난 일정 ${pastEventsCount}건 포함 · 보류 공고 제외`
                    : '모든 저장 공고 일정을 날짜순으로 정리했어요'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {pastEventsCount > 0 && (
                <button
                  type="button"
                  onClick={() => setHidePastEvents((prev) => !prev)}
                  className={`px-2.5 py-1.5 rounded-xl font-label-sm text-label-sm transition-colors ${
                    hidePastEvents
                      ? 'bg-secondary text-on-secondary'
                      : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container'
                  }`}
                >
                  {hidePastEvents ? '예정만 보기' : '지난 일정 숨김'}
                </button>
              )}
              <button
                type="button"
                onClick={handleExportAllCalendar}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-secondary-fixed text-on-secondary-fixed hover:bg-secondary-fixed-dim/55 font-label-sm text-label-sm active:scale-95 transition-all whitespace-nowrap"
              >
                <span className="material-symbols-outlined text-[16px]">
                  calendar_add_on
                </span>
                <span>전체 일정 (.ics)</span>
              </button>
            </div>
          </div>

          {localNotice && (
            <p className="font-label-sm text-label-sm text-secondary flex items-center gap-1 px-1">
              <span className="material-symbols-outlined text-[15px]">info</span>
              {localNotice}
            </p>
          )}
          {timelineGroups.length === 0 ? (
            <div className="brand-card rounded-3xl p-8 text-center space-y-3">
              <Mascot
                variant="hello"
                size="xl"
                animation="float"
                className="mx-auto"
              />
              <p className="font-headline-sm text-headline-sm text-on-surface">
                {hidePastEvents
                  ? '남은 예정 전형 일정이 없습니다'
                  : '등록된 전형 일정이 없습니다'}
              </p>
              <p className="font-body-sm text-body-sm text-on-surface-variant">
                {hidePastEvents
                  ? '지난 일정을 다시 보려면 상단 필터를 눌러주세요.'
                  : '공고를 분석하거나 직접 추가해 날짜를 입력하면 이곳에 모아서 볼 수 있습니다.'}
              </p>
            </div>
          ) : (
            timelineGroups.map((group) => (
              <div
                key={group.monthKey}
                className="rounded-2xl bg-surface-container-lowest p-4 shadow-sm space-y-3"
              >
                <div className="flex items-center justify-between">
                  <h2 className="font-headline-sm text-headline-sm text-on-surface flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[18px] text-secondary">
                      calendar_today
                    </span>
                    {group.monthLabel}
                  </h2>
                  <span className="font-label-sm text-label-sm text-on-surface-variant tabular-nums">
                    {group.items.length}개 일정
                  </span>
                </div>

                <div className="space-y-2">
                  {group.items.map((ev, idx) => {
                    const isPast = ev.diffDays < 0;
                    const isUrgent = ev.diffDays >= 0 && ev.diffDays <= 7;
                    return (
                      <button
                        key={`${ev.announcementId}-${ev.date}-${idx}`}
                        type="button"
                        onClick={() => onSelectAnnouncement(ev.announcementId)}
                        className={`w-full text-left p-3 rounded-xl bg-surface-container-low hover:bg-surface-container transition-colors flex items-center justify-between gap-3 ${
                          isPast ? 'opacity-65' : ''
                        }`}
                      >
                        <div className="min-w-0 flex-1 space-y-0.5">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-label-md text-label-md text-secondary font-bold tabular-nums">
                              {formatKoreanShortDate(ev.date, ev.time)}
                            </span>
                            {isUrgent && (
                              <span className="px-1.5 py-0.5 rounded bg-[var(--color-bell-soft)] border border-[var(--color-bell-border)] text-[var(--color-bell-ink)] text-[11px] font-semibold">
                                이번 주
                              </span>
                            )}
                            {ev.sameDayCount > 1 && (
                              <span className="px-1.5 py-0.5 rounded bg-error-container text-on-error-container text-[11px] font-semibold">
                                같은 날 {ev.sameDayCount}건
                              </span>
                            )}
                          </div>
                          <p className="font-body-md text-body-md text-on-surface font-semibold truncate">
                            {ev.organization} · {ev.step}
                          </p>
                          {ev.position && (
                            <p className="font-body-sm text-body-sm text-on-surface-variant truncate">
                              {ev.position}
                            </p>
                          )}
                        </div>
                        <span
                          className={`shrink-0 px-2 py-1 rounded-lg font-label-sm text-label-sm tabular-nums ${
                            isUrgent
                              ? 'bg-error text-on-error'
                              : isPast
                                ? 'bg-surface-container-high text-outline'
                                : 'bg-secondary-fixed text-on-secondary-fixed'
                          }`}
                        >
                          {ev.diffDays > 0
                            ? `D-${ev.diffDays}`
                            : ev.diffDays === 0
                              ? 'D-Day'
                              : `D+${Math.abs(ev.diffDays)}`}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        <>
          {/* 통합 공정이 브리핑 & 지원 현황 요약 카드 */}
          {items.length > 0 && (
            <div className="brand-card rounded-2xl p-4 mb-3.5 space-y-3">
              <div className="flex items-center gap-3.5">
                <Mascot
                  variant={
                    statusCounts.finalPassed > 0 ||
                    (briefingData.plannedCount > 0 &&
                      briefingData.weekDeadlineCount === 0 &&
                      briefingData.incompleteCount === 0)
                      ? 'saved'
                      : 'explaining'
                  }
                  size="lg"
                />
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-label-md text-label-md text-primary">
                      공정이 오늘의 준비 브리핑
                    </p>
                    <p className="font-label-sm text-label-sm text-on-surface-variant tabular-nums">
                      예정 <strong className="text-secondary">{statusCounts.planned}</strong>
                      {' · '}진행 <strong className="text-primary">{statusCounts.inProgress}</strong>
                      {' · '}합격{' '}
                      <strong className="text-on-tertiary-fixed-variant">
                        {statusCounts.finalPassed}
                      </strong>
                    </p>
                  </div>
                  <p className="font-body-sm text-body-sm text-on-surface-variant">
                    {urgentPlannedItems.length > 0
                      ? `D-3 이내 마감 임박 ${urgentPlannedItems.length}건이 있어요! 서류·자소서를 먼저 점검해 보세요.`
                      : briefingData.plannedCount === 0
                        ? '지원 예정 공고가 없어요. 새 공고를 저장하면 준비 현황을 챙겨드릴게요.'
                        : briefingData.weekDeadlineCount === 0 &&
                            briefingData.incompleteCount === 0
                          ? `지원 예정 공고 ${briefingData.plannedCount}건의 서류·자소서 준비가 완료되었어요!`
                          : `이번 주 마감 ${briefingData.weekDeadlineCount}건 · 서류/자소서 미완료 ${briefingData.incompleteCount}건`}
                  </p>
                </div>
              </div>

              {briefingData.quickItems.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-2.5 border-t border-[#edf2f9]">
                  {briefingData.quickItems.map((q) => (
                    <button
                      key={q.id}
                      type="button"
                      onClick={() => onSelectAnnouncement(q.id)}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-label-sm text-label-sm active:scale-95 transition-all ${
                        q.urgent
                          ? 'bg-[var(--color-bell-soft)] border border-[var(--color-bell-border)] text-[var(--color-bell-ink)]'
                          : 'bg-surface-container-low hover:bg-secondary-fixed/50 text-on-surface'
                      }`}
                    >
                      <span
                        className={`font-bold tabular-nums ${
                          q.urgent ? 'text-error' : 'text-secondary'
                        }`}
                      >
                        {q.tag}
                      </span>
                      <span className="truncate max-w-[140px]">{q.org}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 검색 및 필터 바 */}
          {items.length > 0 && (
            <div className="space-y-2.5 mb-space-md">
              <div className="relative">
                <span className="material-symbols-outlined text-outline text-[18px] absolute left-3 top-1/2 -translate-y-1/2">
                  search
                </span>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="회사명, 직무, 기술스택, 근무지, 메모 검색"
                  className="w-full pl-9 pr-8 py-2.5 bg-surface-container-lowest rounded-xl text-on-surface font-body-sm text-body-sm placeholder:text-outline/70 shadow-sm focus:outline-none focus:ring-2 focus:ring-secondary/20"
                />
                {searchQuery && (
                  <button
                    type="button"
                    aria-label="검색어 지우기"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-outline hover:text-on-surface"
                  >
                    <span className="material-symbols-outlined text-[16px]">cancel</span>
                  </button>
                )}
              </div>

              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                  {filterChips.map((chip) => {
                    const active = filterMode === chip.id;
                    return (
                      <button
                        key={chip.id}
                        type="button"
                        onClick={() => setFilterMode(chip.id)}
                        className={`shrink-0 px-3 py-1.5 rounded-full font-label-sm text-label-sm transition-colors whitespace-nowrap ${
                          active
                            ? 'bg-secondary text-on-secondary'
                            : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container'
                        }`}
                      >
                        {chip.label}
                      </button>
                    );
                  })}
                </div>
                <button
                  type="button"
                  onClick={() => setHideExpiredInList((prev) => !prev)}
                  className={`shrink-0 px-2.5 py-1.5 rounded-full font-label-sm text-label-sm transition-colors whitespace-nowrap ${
                    hideExpiredInList
                      ? 'bg-primary text-on-primary'
                      : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container'
                  }`}
                  title="서류 마감 또는 불합격 공고 숨기기"
                >
                  {hideExpiredInList ? '진행 중만 보는 중' : '마감 숨기기'}
                </button>
              </div>
            </div>
          )}

          {/* Announcement Card List */}
          {items.length === 0 ? (
            <div className="brand-card rounded-3xl p-8 sm:p-10 text-center space-y-4">
              <Mascot
                variant="hello"
                size="2xl"
                animation="float"
                className="mx-auto"
              />
              <div className="space-y-1.5 max-w-sm mx-auto">
                <p className="font-headline-md text-headline-md text-primary">
                  오늘도 필요한 공고를 찾아볼까요?
                </p>
                <p className="font-body-sm text-body-sm text-on-surface-variant">
                  공고를 분석해 저장하거나 직접 추가 버튼으로 새 공고를 등록하세요.
                </p>
              </div>
              <div className="flex items-center justify-center gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={onGoAnalyze}
                  className="inline-flex items-center justify-center gap-1.5 px-5 py-2.5 rounded-xl bg-secondary hover:bg-on-secondary-fixed-variant text-on-secondary font-label-md text-label-md active:scale-95 transition-all whitespace-nowrap shadow-xs"
                >
                  <span className="material-symbols-outlined text-[18px]">edit_note</span>
                  <span>공고 분석하기</span>
                </button>
                <button
                  type="button"
                  onClick={onCreateManualAnnouncement}
                  className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-surface-container hover:bg-surface-container-high text-on-surface font-label-md text-label-md active:scale-95 transition-all whitespace-nowrap"
                >
                  <span className="material-symbols-outlined text-[18px]">add</span>
                  <span>직접 입력</span>
                </button>
              </div>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="brand-card rounded-3xl p-7 text-center space-y-3">
              <Mascot
                variant="explaining"
                size="xl"
                animation="pop"
                className="mx-auto"
              />
              <div className="space-y-1">
                <p className="font-headline-sm text-headline-sm text-primary">
                  검색된 공고가 없어요.
                </p>
                <p className="font-body-sm text-body-sm text-on-surface-variant">
                  다른 키워드로 검색하거나 필터를 초기화해 보세요.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setFilterMode('all');
                  setHideExpiredInList(false);
                }}
                className="mt-1 inline-flex items-center px-4 py-2 rounded-xl bg-secondary-fixed text-on-secondary-fixed hover:bg-secondary-fixed-dim/55 font-label-md text-label-md transition-colors whitespace-nowrap"
              >
                전체 공고 보기
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-stretch">
              {filteredItems.map(
                ({
                  item,
                  dday,
                  specMatch,
                  totalDocs,
                  completedDocs,
                  progressPct,
                  matchedBonusNames,
                }) => {
                  const orgName =
                    item.analysis.organization?.trim() || '기관명 미입력';
                  const positionName =
                    item.analysis.position?.trim() || '모집 분야 정보 없음';
                  const isChecked = item.selectedForCompare;
                  const metaLine = [
                    item.analysis.company_type,
                    item.analysis.employment_type,
                    item.analysis.experience_level,
                    item.analysis.location,
                    item.analysis.headcount,
                  ]
                    .filter(Boolean)
                    .join(' · ');

                  let ddayBadgeClass =
                    'bg-surface-container-high text-on-surface-variant';
                  let ddayIcon = 'event';
                  let ddayText = '일정 없음';

                  if (dday.found && dday.diffDays !== null) {
                    if (dday.isUrgent) {
                      ddayBadgeClass = 'bg-error-container text-on-error-container';
                      ddayIcon = 'alarm';
                      ddayText =
                        dday.diffDays === 0
                          ? 'D-Day 마감임박'
                          : `D-${dday.diffDays} 마감임박`;
                    } else if (dday.isExpired) {
                      ddayBadgeClass = 'bg-surface-container-high text-outline';
                      ddayIcon = 'event_busy';
                      ddayText = `D+${Math.abs(dday.diffDays)} 마감`;
                    } else {
                      ddayBadgeClass = 'bg-secondary-fixed text-on-secondary-fixed';
                      ddayIcon = 'schedule';
                      ddayText = `D-${dday.diffDays}`;
                    }
                  } else if (dday.isRolling) {
                    ddayBadgeClass = 'bg-secondary-fixed text-on-secondary-fixed';
                    ddayIcon = 'all_inclusive';
                    ddayText = dday.rollingLabel ?? '상시채용';
                  }

                  return (
                    <div
                      key={item.id}
                      className={`brand-card group relative flex flex-col rounded-2xl p-4 transition-all hover:border-secondary/30 hover:shadow-md ${
                        dday.isExpired ? 'opacity-85 hover:opacity-100' : ''
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <label
                          className="mt-1 flex items-center justify-center cursor-pointer select-none min-w-[28px] min-h-[28px]"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <input
                            checked={isChecked}
                            onChange={() => onToggleCompare(item.id)}
                            className="peer sr-only"
                            type="checkbox"
                            aria-label={`${orgName} 비교 선택`}
                          />
                          <div
                            className={`w-6 h-6 rounded-lg flex items-center justify-center transition-colors shadow-sm ${
                              isChecked
                                ? 'bg-secondary text-on-secondary'
                                : 'bg-surface-container-high text-transparent'
                            }`}
                          >
                            <span
                              className="material-symbols-outlined text-[18px]"
                              style={{ fontVariationSettings: "'FILL' 1" }}
                            >
                              check
                            </span>
                          </div>
                        </label>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span
                                className={`inline-flex items-center px-2 py-0.5 rounded-md font-label-sm text-label-sm tabular-nums ${ddayBadgeClass}`}
                              >
                                <span className="material-symbols-outlined text-[12px] mr-1">
                                  {ddayIcon}
                                </span>
                                {ddayText}
                              </span>
                              {onChangeAnnouncementStatus ? (
                                <select
                                  aria-label={`${orgName} 지원 상태 변경`}
                                  value={item.applicationStatus}
                                  onClick={(e) => e.stopPropagation()}
                                  onChange={(e) => {
                                    e.stopPropagation();
                                    onChangeAnnouncementStatus(
                                      item.id,
                                      e.target.value as ApplicationStatus
                                    );
                                  }}
                                  className={`px-2 py-0.5 rounded-md font-label-sm text-label-sm cursor-pointer focus:outline-none focus:ring-2 focus:ring-secondary/30 ${getStatusBadgeStyle(
                                    item.applicationStatus
                                  )}`}
                                >
                                  {APPLICATION_STATUSES.map((st) => (
                                    <option key={st} value={st}>
                                      {st}
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                <span
                                  className={`inline-flex items-center px-2 py-0.5 rounded-md font-label-sm text-label-sm ${getStatusBadgeStyle(
                                    item.applicationStatus
                                  )}`}
                                >
                                  {item.applicationStatus}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-0.5 shrink-0">
                              {(() => {
                                const safeUrl = toSafeHttpUrl(item.sourceUrl);
                                if (!safeUrl) return null;
                                return (
                                  <a
                                    href={safeUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={(e) => e.stopPropagation()}
                                    aria-label={`${orgName} 공고 원문 링크`}
                                    title="공고 원문 링크 열기"
                                    className="w-8 h-8 rounded-full flex items-center justify-center text-outline hover:text-secondary hover:bg-secondary-fixed/50 transition-colors"
                                  >
                                    <span className="material-symbols-outlined text-[17px]">
                                      open_in_new
                                    </span>
                                  </a>
                                );
                              })()}
                              {onDuplicateAnnouncement && (
                                <button
                                  type="button"
                                  aria-label={`${orgName} 공고 복제`}
                                  title="공고 복제 (유사 직무·재공고 재활용)"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onDuplicateAnnouncement(item.id);
                                  }}
                                  className="w-8 h-8 rounded-full flex items-center justify-center text-outline hover:text-secondary hover:bg-secondary-fixed/50 transition-colors"
                                >
                                  <span className="material-symbols-outlined text-[17px]">
                                    file_copy
                                  </span>
                                </button>
                              )}
                              <button
                                type="button"
                                aria-label={item.isPinned ? `${orgName} 상단 고정 해제` : `${orgName} 상단 고정`}
                                title={item.isPinned ? '상단 고정 해제' : '상단 고정'}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onTogglePin(item.id);
                                }}
                                className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${
                                  item.isPinned
                                    ? 'text-secondary bg-secondary-fixed/50'
                                    : 'text-outline hover:text-secondary hover:bg-surface-container-high'
                                }`}
                              >
                                <span
                                  className="material-symbols-outlined text-[18px]"
                                  style={
                                    item.isPinned
                                      ? { fontVariationSettings: "'FILL' 1" }
                                      : undefined
                                  }
                                >
                                  star
                                </span>
                              </button>
                              <button
                                type="button"
                                aria-label={`${orgName} 삭제`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onDeleteAnnouncement(item.id);
                                }}
                                className="w-8 h-8 rounded-full flex items-center justify-center text-outline hover:text-error hover:bg-error-container/40 transition-colors"
                              >
                                <span className="material-symbols-outlined text-[18px]">
                                  delete
                                </span>
                              </button>
                            </div>
                          </div>

                          {/* 클릭 가능한 회사명 · 직렬 영역 */}
                          <button
                            type="button"
                            onClick={() => onSelectAnnouncement(item.id)}
                            className="w-full text-left group/title rounded-lg -mx-1.5 px-1.5 py-1 hover:bg-surface-container-low active:bg-surface-container transition-colors mb-2"
                          >
                            <div className="flex items-center justify-between gap-1">
                              <h2 className="font-headline-sm text-headline-sm text-on-surface font-semibold truncate leading-snug group-hover/title:text-secondary transition-colors">
                                {orgName}
                              </h2>
                              <span className="material-symbols-outlined text-[18px] text-outline group-hover/title:text-secondary group-hover/title:translate-x-0.5 transition-all shrink-0">
                                chevron_right
                              </span>
                            </div>
                            <p className="font-body-sm text-body-sm text-on-surface-variant truncate mt-0.5">
                              {positionName}
                            </p>
                            {metaLine && (
                              <p className="font-label-sm text-label-sm text-outline truncate mt-0.5 font-normal">
                                {metaLine}
                              </p>
                            )}
                          </button>

                          <div className="pt-2.5 mt-1 border-t border-[#edf2f9] flex flex-col gap-1.5 mb-3">
                            <div className="flex items-center justify-between gap-2 font-body-sm text-body-sm">
                              <span className="text-on-surface-variant">접수 마감</span>
                              <span className="font-label-md text-label-md text-on-surface font-semibold tabular-nums">
                                {dday.found
                                  ? formatKoreanShortDate(
                                      dday.matchedDate,
                                      dday.matchedTime
                                    )
                                  : dday.isRolling
                                    ? dday.rollingLabel
                                    : '공고에 없음'}
                              </span>
                            </div>
                            <div className="flex items-center justify-between gap-2 font-body-sm text-body-sm">
                              <span className="text-on-surface-variant shrink-0">
                                {specMatch.bonusResults.some((b) => b.isPointBased)
                                  ? '내 가산점'
                                  : '스펙 매칭'}
                              </span>
                              <span
                                className={`font-label-sm text-label-sm font-semibold truncate ${
                                  specMatch.totalBonusPoints > 0 ||
                                  specMatch.matchedPreferenceCount > 0 ||
                                  specMatch.skillMatch.matchedSkills.length > 0
                                    ? 'text-on-tertiary-fixed-variant'
                                    : specMatch.overallStatus === 'ineligible'
                                      ? 'text-error'
                                      : 'text-on-surface-variant'
                                }`}
                              >
                                {specMatch.totalBonusPoints > 0
                                  ? `+${specMatch.totalBonusPoints}점 (${matchedBonusNames.join(', ')})`
                                  : specMatch.skillMatch.totalSkills > 0
                                    ? `역량 ${specMatch.skillMatch.matchedSkills.length}/${specMatch.skillMatch.totalSkills} · ${specMatch.overallLabel}`
                                    : specMatch.matchedPreferenceCount > 0
                                      ? `우대 ${specMatch.matchedPreferenceCount}건 · ${specMatch.overallLabel}`
                                      : specMatch.overallLabel}
                              </span>
                            </div>
                            {item.memo.trim() && (
                              <p className="text-body-sm text-on-surface-variant line-clamp-1 pt-0.5">
                                메모: {item.memo}
                              </p>
                            )}
                          </div>

                          <div className="flex flex-col gap-1.5">
                            <div className="flex items-center justify-between">
                              <span className="font-label-sm text-label-sm text-on-surface-variant">
                                {totalDocs > 0
                                  ? `서류 준비 ${completedDocs}/${totalDocs}`
                                  : '제출 서류 정보 없음'}
                              </span>
                              <span className="font-label-sm text-label-sm text-secondary font-bold tabular-nums">
                                {progressPct}%
                              </span>
                            </div>
                            <div className="w-full h-1.5 rounded-full bg-surface-container-highest overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all duration-500 ${
                                  progressPct > 0
                                    ? 'bg-secondary-container'
                                    : 'bg-outline-variant'
                                }`}
                                style={{ width: `${progressPct}%` }}
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                }
              )}
            </div>
          )}

          {/* Comparison Section */}
          {comparePair.length >= 2 && (
            <section className="mt-space-lg flex flex-col gap-space-md">
              <div className="flex items-center justify-between p-3.5 rounded-2xl bg-primary-container text-on-primary shadow-md">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-secondary flex items-center justify-center shadow-sm shrink-0">
                    <span className="material-symbols-outlined text-[20px] text-on-secondary">
                      compare_arrows
                    </span>
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="font-headline-sm text-headline-sm text-on-primary font-semibold leading-tight truncate">
                      선택한 공고 {selectedForCompare.length}개 비교하기
                    </span>
                    <span className="font-label-sm text-label-sm text-on-primary-container truncate">
                      {selectedForCompare.length > 2
                        ? '체크된 공고 중 상위 2개만 비교됩니다'
                        : '핵심 자격조건 · 일정 겹침 대조 중'}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={onClearCompare}
                    className="px-2.5 py-1.5 rounded-xl bg-white/15 hover:bg-white/25 text-on-primary font-label-sm text-label-sm transition-colors"
                  >
                    초기화
                  </button>
                  <button
                    type="button"
                    onClick={() => setCompareCollapsed((prev) => !prev)}
                    className="px-3 py-1.5 rounded-xl bg-secondary hover:bg-secondary-container text-on-secondary font-label-md text-label-md transition-transform active:scale-95 shadow-sm"
                  >
                    {compareCollapsed ? '펼치기' : '접기'}
                  </button>
                </div>
              </div>

              {!compareCollapsed && (
                <div className="flex flex-col rounded-2xl bg-surface-container-lowest p-4 shadow-sm overflow-hidden">
                  <div className="flex items-center justify-between pb-3 mb-3 bg-surface-container-low -mx-4 -mt-4 p-4">
                    <span className="font-headline-sm text-headline-sm text-on-surface font-semibold flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-secondary text-[20px]">
                        dataset
                      </span>
                      전형 상세 스펙 비교
                    </span>
                    <span className="font-label-sm text-label-sm px-2 py-0.5 rounded-full bg-secondary-fixed text-on-secondary-fixed">
                      실시간 연동
                    </span>
                  </div>

                  {/* 일정 겹침 감지 배너 */}
                  {scheduleOverlaps.length > 0 ? (
                    <div className="mb-3 p-2.5 rounded-xl bg-error-container text-on-error-container flex items-start gap-2">
                      <span className="material-symbols-outlined text-[18px] shrink-0 mt-0.5">
                        warning
                      </span>
                      <div className="text-body-sm leading-snug">
                        <p className="font-semibold">전형 일정 날짜가 겹칩니다</p>
                        {scheduleOverlaps.map((ov, i) => (
                          <p key={i} className="mt-0.5">
                            {ov.date}: {ov.stepA} ↔ {ov.stepB}
                          </p>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="mb-3 px-3 py-2 rounded-xl bg-tertiary-fixed/45 text-on-tertiary-fixed-variant flex items-center gap-1.5 font-label-sm text-label-sm">
                      <span className="material-symbols-outlined text-[16px]">
                        event_available
                      </span>
                      <span>두 공고의 주요 전형 날짜가 겹치지 않습니다</span>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-2 mb-3">
                    {comparePair.map((entry, idx) => (
                      <button
                        key={entry.item.id}
                        type="button"
                        onClick={() => onSelectAnnouncement(entry.item.id)}
                        className="p-3 rounded-xl bg-surface-container-low hover:bg-surface-container text-left flex flex-col gap-1 transition-colors"
                      >
                        <span className="font-label-sm text-label-sm text-secondary font-bold">
                          비교 {idx === 0 ? 'A' : 'B'}
                        </span>
                        <span className="font-headline-sm text-headline-sm text-on-surface font-bold leading-tight truncate">
                          {entry.item.analysis.organization || '기관명 미입력'}
                        </span>
                        <span className="font-label-sm text-label-sm text-on-surface-variant truncate">
                          {entry.item.analysis.position || '모집 분야 없음'}
                        </span>
                      </button>
                    ))}
                  </div>

                  <div className="flex flex-col gap-2.5">
                    <div className="flex flex-col p-2.5 rounded-xl bg-surface-container-low/70">
                      <span className="font-label-sm text-label-sm text-outline mb-1.5 flex items-center gap-1">
                        <span className="material-symbols-outlined text-[14px]">
                          timer
                        </span>
                        마감 일시
                      </span>
                      <div className="grid grid-cols-2 gap-2">
                        {comparePair.map((entry) => (
                          <div key={entry.item.id} className="flex flex-col">
                            <span
                              className={`font-label-md text-label-md font-bold tabular-nums ${
                                entry.dday.isUrgent ? 'text-error' : 'text-on-surface'
                              }`}
                            >
                              {entry.dday.found
                                ? formatKoreanShortDate(
                                    entry.dday.matchedDate,
                                    entry.dday.matchedTime
                                  )
                                : entry.dday.isRolling
                                  ? entry.dday.rollingLabel
                                  : '공고에 없음'}
                            </span>
                            <span
                              className={`font-label-sm text-label-sm ${
                                entry.dday.isUrgent
                                  ? 'text-error/80'
                                  : 'text-secondary'
                              }`}
                            >
                              {entry.dday.found
                                ? entry.dday.diffDays === 0
                                  ? 'D-Day (오늘 마감)'
                                  : entry.dday.diffDays !== null &&
                                      entry.dday.diffDays > 0
                                    ? `D-${entry.dday.diffDays} 남음`
                                    : '마감됨'
                                : entry.dday.isRolling
                                  ? '수시 서류 검토'
                                  : '일정 확인 필요'}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="flex flex-col p-2.5 rounded-xl bg-surface-container-low/70">
                      <span className="font-label-sm text-label-sm text-outline mb-1.5 flex items-center gap-1">
                        <span className="material-symbols-outlined text-[14px]">
                          military_tech
                        </span>
                        내 가산점 · 역량 · 지원 판정
                      </span>
                      <div className="grid grid-cols-2 gap-2">
                        {comparePair.map((entry) => {
                          const hasPointBonus = entry.specMatch.bonusResults.some(
                            (b) => b.isPointBased
                          );
                          const statusTxt =
                            entry.specMatch.overallStatus === 'eligible'
                              ? '지원 가능'
                              : entry.specMatch.overallStatus === 'ineligible'
                                ? '요건 미달'
                                : '확인 필요';
                          const headlineTxt = hasPointBonus
                            ? `+${entry.specMatch.totalBonusPoints}점 · ${statusTxt}`
                            : entry.specMatch.skillMatch.totalSkills > 0
                              ? `역량 ${entry.specMatch.skillMatch.matchedSkills.length}/${entry.specMatch.skillMatch.totalSkills} · ${statusTxt}`
                              : `우대 ${entry.specMatch.matchedPreferenceCount}건 · ${statusTxt}`;

                          return (
                            <div key={entry.item.id} className="flex flex-col">
                              <span className="font-label-md text-label-md text-secondary font-bold tabular-nums">
                                {headlineTxt}
                              </span>
                              <span className="font-body-sm text-body-sm text-on-surface-variant truncate">
                                {entry.matchedBonusNames.length > 0
                                  ? entry.matchedBonusNames.join(' + ')
                                  : entry.specMatch.skillMatch.matchedSkills.length > 0
                                    ? entry.specMatch.skillMatch.matchedSkills.join(', ')
                                    : '일치 우대·역량 없음'}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="flex flex-col p-2.5 rounded-xl bg-surface-container-low/70">
                      <span className="font-label-sm text-label-sm text-outline mb-1.5 flex items-center gap-1">
                        <span className="material-symbols-outlined text-[14px]">
                          location_on
                        </span>
                        근무지 · 처우 · 전형
                      </span>
                      <div className="grid grid-cols-2 gap-2">
                        {comparePair.map((entry) => {
                          const stageList = Array.isArray(entry.item.analysis.stages)
                            ? entry.item.analysis.stages.filter(Boolean)
                            : [];
                          const infoParts = [
                            entry.item.analysis.location,
                            entry.item.analysis.compensation || entry.item.analysis.headcount,
                          ].filter(Boolean);
                          return (
                            <div key={entry.item.id} className="flex flex-col gap-0.5">
                              <span className="font-body-sm text-body-sm text-on-surface font-medium truncate">
                                {infoParts.length > 0
                                  ? infoParts.join(' · ')
                                  : '근무지/처우 없음'}
                              </span>
                              <span className="font-label-sm text-label-sm text-on-surface-variant truncate">
                                {stageList.length > 0
                                  ? stageList.join(' → ')
                                  : '단계 정보 없음'}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </section>
          )}
        </>
      )}

      {/* 데이터 백업 및 복원 카드 */}
      <div className="mt-space-lg brand-card p-4 rounded-2xl space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="font-label-md text-label-md text-primary">
              내 공고 · 스펙 백업
            </p>
            <p className="font-label-sm text-label-sm text-on-surface-variant font-normal">
              다른 기기로 옮길 때 JSON 파일로 내보내거나 불러오세요
            </p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
            <button
              type="button"
              onClick={handleExportCsv}
              className="px-2.5 py-1.5 rounded-lg bg-surface-container-low hover:bg-surface-container text-on-surface font-label-sm text-label-sm active:scale-95 transition-transform"
              title="엑셀/구글시트용 CSV 파일 내려받기"
            >
              CSV (엑셀)
            </button>
            <button
              type="button"
              onClick={onExportBackup}
              className="px-2.5 py-1.5 rounded-lg bg-surface-container-lowest text-on-surface font-label-sm text-label-sm shadow-sm active:scale-95 transition-transform"
            >
              백업 (.json)
            </button>
            <button
              type="button"
              onClick={() => backupInputRef.current?.click()}
              className="px-2.5 py-1.5 rounded-lg bg-secondary-fixed text-on-secondary-fixed font-label-sm text-label-sm active:scale-95 transition-transform"
            >
              불러오기
            </button>
            <input
              ref={backupInputRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={handleBackupFilePick}
            />
          </div>
        </div>
        {(backupMessage || localNotice) && (
          <p className="font-label-sm text-label-sm text-secondary flex items-center gap-1">
            <span className="material-symbols-outlined text-[15px]">info</span>
            {backupMessage ?? localNotice}
          </p>
        )}
      </div>
    </div>
  );
};
