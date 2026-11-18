import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  CERT_CATEGORIES,
  LANGUAGE_EXAMS,
  OFFICIAL_CERTIFICATIONS,
  type CertCategory,
} from '../data/officialCertifications';
import {
  APPLICATION_STATUSES,
  type ApplicationStatus,
  type BonusPointItem,
  type CompanyType,
  type DeadlineType,
  type EligibilityItem,
  type EssayQuestionItem,
  type JobAnalysis,
  type ScheduleItem,
} from '../types';
import { downloadScheduleIcs, hasExportableSchedule } from '../utils/calendar';
import { calculateDocumentDeadlineDday, diffDaysFromToday } from '../utils/dday';
import {
  evaluateSpecMatching,
  getLanguageExpiryInfo,
  type EducationLevel,
  type LanguageSpec,
  type UserProfileMeta,
} from '../utils/specMatching';
import { Mascot } from './Mascot';

export interface AnalysisUpdateMeta {
  checkedDocs: Record<number, boolean>;
  bonusOverrides: Record<number, boolean>;
  essayDrafts: Record<number, string>;
  sourceUrl?: string | null;
}

// 공고에 자소서 문항이 없을 때 보여주는 "예시" 주제 (실제 문항이 아님)
const EXAMPLE_ESSAY_PUBLIC = [
  '우리 기관에 지원한 동기와 입사 후 이루고 싶은 목표를 기술하시오.',
  '지원 직무를 수행하기 위해 쌓아온 역량과 경험을 구체적으로 기술하시오.',
  '조직 안에서 협업하며 갈등을 해결하고 성과를 낸 경험을 기술하시오.',
  '공공기관 직원으로서 원칙과 윤리를 지켜 행동한 경험을 기술하시오.',
];
const EXAMPLE_ESSAY_PRIVATE = [
  '우리 회사에 지원한 이유와 입사 후 포부를 기술하시오.',
  '지원 직무와 관련해 본인이 수행한 프로젝트와 그 안에서의 역할을 기술하시오.',
  '가장 도전적이었던 경험과 그 결과를 구체적으로 기술하시오.',
  '팀에서 의견 차이를 조율해 성과를 만든 경험을 기술하시오.',
];

interface AnalyzeResultViewProps {
  data: JobAnalysis;
  originalText: string;
  attachedFileName: string | null;
  sourceUrl?: string | null;
  onChangeSourceUrl: (url: string | null) => void;
  isSaved: boolean;
  /** 체험용 샘플 공고 여부 (실제 채용 내용이 아님을 안내) */
  isSample?: boolean;
  onToggleSave: () => void;
  onUpdateAnalysis: (updated: JobAnalysis, meta?: AnalysisUpdateMeta) => void;
  checkedDocs: Record<number, boolean>;
  onToggleDoc: (idx: number) => void;
  certificates: string[];
  onChangeCertificates: (next: string[] | ((prev: string[]) => string[])) => void;
  languageSpecs: LanguageSpec[];
  onChangeLanguageSpecs: (
    next: LanguageSpec[] | ((prev: LanguageSpec[]) => LanguageSpec[])
  ) => void;
  skills: string[];
  onChangeSkills: (next: string[] | ((prev: string[]) => string[])) => void;
  profileMeta: UserProfileMeta;
  onChangeProfileMeta: (
    next: UserProfileMeta | ((prev: UserProfileMeta) => UserProfileMeta)
  ) => void;
  applicationStatus: ApplicationStatus;
  onChangeApplicationStatus: (status: ApplicationStatus) => void;
  memo: string;
  onChangeMemo: (memo: string) => void;
  essayDrafts: Record<number, string>;
  onChangeEssayDraft: (idx: number, value: string) => void;
  interviewNotes?: Record<number, string>;
  onChangeInterviewNote?: (idx: number, value: string) => void;
  reusableEssays?: Array<{
    announcementId: string;
    organization: string;
    position: string;
    question: string;
    draft: string;
  }>;
  bonusOverrides: Record<number, boolean>;
  onToggleBonusOverride: (idx: number, nextMatched: boolean) => void;
  onResetBonusOverrides: () => void;
  initialEditing?: boolean;
  onCancelInitialEdit?: () => void;
  similarSavedTitle?: string | null;
  onOpenSimilarSaved?: () => void;
}

const INLINE_EDUCATION_OPTIONS: Array<{ value: EducationLevel | ''; label: string }> = [
  { value: '', label: '학력 미설정' },
  { value: '고졸', label: '고졸' },
  { value: '전문학사', label: '전문학사' },
  { value: '학사', label: '학사 (대졸)' },
  { value: '석사', label: '석사' },
  { value: '박사', label: '박사' },
];

const INLINE_CAREER_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '', label: '경력 미설정' },
  { value: '0', label: '신입 (0년)' },
  { value: '1', label: '경력 1년+' },
  { value: '2', label: '경력 2년+' },
  { value: '3', label: '경력 3년+' },
  { value: '5', label: '경력 5년+' },
  { value: '7', label: '경력 7년+' },
  { value: '10', label: '경력 10년+' },
];

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

function parseMaxCharsLimit(maxChars?: string | null): number | null {
  if (!maxChars) return null;
  if (/(줄|문단|페이지)/.test(maxChars) && !/자/.test(maxChars)) return null;
  const match = /(\d{1,3}(?:,\d{3})+|\d+)/.exec(maxChars);
  if (!match) return null;
  const parsed = Number(match[1].replace(/,/g, ''));
  return Number.isFinite(parsed) && parsed > 0 && parsed <= 50000 ? parsed : null;
}

const MissingText: React.FC<{ className?: string }> = ({ className = '' }) => (
  <span className={`text-outline font-normal ${className}`}>공고에 없음</span>
);

function formatScheduleDateTime(date: string | null, time: string | null): React.ReactNode {
  if (!date && !time) {
    return <MissingText />;
  }
  if (date && time) {
    return `${date} ${time}`;
  }
  return date ?? time ?? <MissingText />;
}

function buildAnnouncementSummaryText(params: {
  data: JobAnalysis;
  ddayLabel: string;
  matchedDate: string | null;
  matchedTime: string | null;
  specLabel: string;
  bonusPoints: number;
  documents: Array<string | null>;
  checkedDocs: Record<number, boolean>;
  essayQuestions: EssayQuestionItem[];
  keywords: string[];
  sourceUrl?: string | null;
}): string {
  const {
    data,
    ddayLabel,
    matchedDate,
    matchedTime,
    specLabel,
    bonusPoints,
    documents,
    checkedDocs,
    essayQuestions,
    keywords,
    sourceUrl,
  } = params;

  const lines: string[] = [];
  const org = data.organization?.trim() || '기관명 미입력';
  const pos = data.position?.trim() || '모집 분야 미정';
  lines.push(`[공고쏙] ${org} - ${pos}`);

  const meta = [
    data.company_type,
    data.employment_type,
    data.experience_level,
    data.location,
    data.compensation,
  ]
    .filter(Boolean)
    .filter((v, i, a) => a.indexOf(v) === i)
    .join(' · ');
  if (meta) lines.push(`- 기본정보: ${meta}`);

  const deadlineDetail = matchedDate
    ? `${matchedDate}${matchedTime ? ` ${matchedTime}` : ''} (${ddayLabel})`
    : ddayLabel;
  lines.push(`- 서류마감: ${deadlineDetail}`);

  const stages = Array.isArray(data.stages) ? data.stages.filter(Boolean) : [];
  if (stages.length > 0) {
    lines.push(`- 전형절차: ${stages.join(' → ')}`);
  }

  lines.push(
    `- 내 스펙 판정: ${specLabel}${bonusPoints > 0 ? ` (예상 가산점 +${bonusPoints}점)` : ''}`
  );

  if (documents.some((d) => Boolean(d && d.trim()))) {
    lines.push('- 제출서류:');
    documents.forEach((doc, idx) => {
      if (!doc || !doc.trim()) return;
      const done = checkedDocs[idx] ? 'v' : ' ';
      lines.push(`  [${done}] ${doc}`);
    });
  }

  if (essayQuestions.length > 0) {
    lines.push(`- 자소서 문항 (${essayQuestions.length}개):`);
    essayQuestions.forEach((eq, idx) => {
      const limitStr = eq.max_chars ? ` (${eq.max_chars})` : '';
      lines.push(`  ${idx + 1}. ${eq.question ?? ''}${limitStr}`);
    });
  }

  if (keywords.length > 0) {
    lines.push(`- 핵심 키워드: ${keywords.map((k) => `#${k}`).join(' ')}`);
  }

  if (sourceUrl) {
    lines.push(`- 원문 링크: ${sourceUrl}`);
  }

  return lines.join('\n');
}

interface DraftJobAnalysis {
  company_type: CompanyType | '';
  organization: string;
  position: string;
  employment_type: string;
  experience_level: string;
  location: string;
  headcount: string;
  compensation: string;
  deadline_type: DeadlineType | '';
  sourceUrl: string;
  techSkillsText: string;
  keywordsText: string;
  interviewQuestionsText: string;
  stagesText: string;
  schedule: Array<{ step: string; date: string; time: string; source: string }>;
  eligibility: Array<{ item: string; condition: string; source: string }>;
  bonus_points: Array<{ origIdx?: number; item: string; points: string; source: string }>;
  documents: Array<{ origIdx?: number; text: string }>;
  essay_questions: Array<{ origIdx?: number; question: string; max_chars: string }>;
}

function toDraft(data: JobAnalysis, sourceUrl?: string | null): DraftJobAnalysis {
  return {
    company_type: data.company_type ?? '',
    organization: data.organization ?? '',
    position: data.position ?? '',
    employment_type: data.employment_type ?? '',
    experience_level: data.experience_level ?? '',
    location: data.location ?? '',
    headcount: data.headcount ?? '',
    compensation: data.compensation ?? '',
    deadline_type: data.deadline_type ?? '',
    sourceUrl: sourceUrl ?? '',
    techSkillsText: Array.isArray(data.tech_skills)
      ? data.tech_skills.filter((s): s is string => Boolean(s && s.trim())).join(', ')
      : '',
    keywordsText: Array.isArray(data.keywords)
      ? data.keywords.filter((s): s is string => Boolean(s && s.trim())).join(', ')
      : '',
    interviewQuestionsText: Array.isArray(data.interview_questions)
      ? data.interview_questions.filter((s): s is string => Boolean(s && s.trim())).join('\n')
      : '',
    stagesText: Array.isArray(data.stages)
      ? data.stages.filter((s): s is string => Boolean(s && s.trim())).join(', ')
      : '',
    schedule: Array.isArray(data.schedule)
      ? data.schedule.map((s) => ({
          step: s.step ?? '',
          date: s.date ?? '',
          time: s.time ?? '',
          source: s.source ?? '',
        }))
      : [],
    eligibility: Array.isArray(data.eligibility)
      ? data.eligibility.map((e) => ({
          item: e.item ?? '',
          condition: e.condition ?? '',
          source: e.source ?? '',
        }))
      : [],
    bonus_points: Array.isArray(data.bonus_points)
      ? data.bonus_points.map((b, origIdx) => ({
          origIdx,
          item: b.item ?? '',
          points:
            b.points !== null && b.points !== undefined ? String(b.points) : '',
          source: b.source ?? '',
        }))
      : [],
    documents: Array.isArray(data.documents)
      ? data.documents.map((d, origIdx) => ({ origIdx, text: d ?? '' }))
      : [],
    essay_questions: Array.isArray(data.essay_questions)
      ? data.essay_questions.map((q, origIdx) => ({
          origIdx,
          question: q.question ?? '',
          max_chars: q.max_chars ?? '',
        }))
      : [],
  };
}

function nullableStr(val: string): string | null {
  const trimmed = val.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function fromDraft(
  draft: DraftJobAnalysis,
  prevCheckedDocs: Record<number, boolean>,
  prevBonusOverrides: Record<number, boolean>,
  prevEssayDrafts: Record<number, string>
): { analysis: JobAnalysis; meta: AnalysisUpdateMeta } {
  const stages = draft.stagesText
    .split(/[,→>]/)
    .map((s) => s.trim())
    .filter(Boolean);

  const tech_skills = draft.techSkillsText
    .split(/[,/|·]/)
    .map((s) => s.trim())
    .filter(Boolean);

  const keywords = draft.keywordsText
    .split(/[,/|·]/)
    .map((s) => s.trim())
    .filter(Boolean);

  const interview_questions = draft.interviewQuestionsText
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);

  const schedule: ScheduleItem[] = draft.schedule
    .filter((s) => s.step.trim() || s.date.trim() || s.time.trim() || s.source.trim())
    .map((s) => ({
      step: nullableStr(s.step),
      date: nullableStr(s.date),
      time: nullableStr(s.time),
      source: nullableStr(s.source),
    }));

  const eligibility: EligibilityItem[] = draft.eligibility
    .filter((e) => e.item.trim() || e.condition.trim() || e.source.trim())
    .map((e) => ({
      item: nullableStr(e.item),
      condition: nullableStr(e.condition),
      source: nullableStr(e.source),
    }));

  const keptBonuses = draft.bonus_points.filter(
    (b) => b.item.trim() || b.points.trim() || b.source.trim()
  );
  const remappedBonusOverrides: Record<number, boolean> = {};
  const bonus_points: BonusPointItem[] = keptBonuses.map((b, newIdx) => {
    if (
      b.origIdx !== undefined &&
      typeof prevBonusOverrides[b.origIdx] === 'boolean'
    ) {
      remappedBonusOverrides[newIdx] = prevBonusOverrides[b.origIdx];
    }
    const parsedPts = b.points.trim() ? Number(b.points.trim()) : null;
    return {
      item: nullableStr(b.item),
      points:
        parsedPts !== null && Number.isFinite(parsedPts) ? parsedPts : null,
      source: nullableStr(b.source),
    };
  });

  const keptDocs = draft.documents
    .map((d) => ({ ...d, text: d.text.trim() }))
    .filter((d) => d.text.length > 0);
  const remappedCheckedDocs: Record<number, boolean> = {};
  const documents = keptDocs.map((d, newIdx) => {
    if (d.origIdx !== undefined && prevCheckedDocs[d.origIdx]) {
      remappedCheckedDocs[newIdx] = true;
    }
    return d.text;
  });

  const keptQuestions = draft.essay_questions.filter(
    (q) => q.question.trim() || q.max_chars.trim()
  );
  const remappedEssayDrafts: Record<number, string> = {};
  const essay_questions: EssayQuestionItem[] = keptQuestions.map((q, newIdx) => {
    if (
      q.origIdx !== undefined &&
      typeof prevEssayDrafts[q.origIdx] === 'string' &&
      prevEssayDrafts[q.origIdx].length > 0
    ) {
      remappedEssayDrafts[newIdx] = prevEssayDrafts[q.origIdx];
    }
    return {
      question: nullableStr(q.question),
      max_chars: nullableStr(q.max_chars),
    };
  });

  return {
    analysis: {
      company_type: draft.company_type || null,
      organization: nullableStr(draft.organization),
      position: nullableStr(draft.position),
      employment_type: nullableStr(draft.employment_type),
      experience_level: nullableStr(draft.experience_level),
      location: nullableStr(draft.location),
      headcount: nullableStr(draft.headcount),
      compensation: nullableStr(draft.compensation),
      deadline_type: draft.deadline_type || null,
      tech_skills: tech_skills.length > 0 ? tech_skills : null,
      keywords: keywords.length > 0 ? keywords : null,
      interview_questions: interview_questions.length > 0 ? interview_questions : null,
      stages: stages.length > 0 ? stages : null,
      schedule: schedule.length > 0 ? schedule : null,
      eligibility: eligibility.length > 0 ? eligibility : null,
      bonus_points: bonus_points.length > 0 ? bonus_points : null,
      documents: documents.length > 0 ? documents : null,
      essay_questions: essay_questions.length > 0 ? essay_questions : null,
    },
    meta: {
      checkedDocs: remappedCheckedDocs,
      bonusOverrides: remappedBonusOverrides,
      essayDrafts: remappedEssayDrafts,
      sourceUrl: nullableStr(draft.sourceUrl),
    },
  };
}

export const AnalyzeResultView: React.FC<AnalyzeResultViewProps> = ({
  data,
  originalText,
  attachedFileName,
  sourceUrl,
  onChangeSourceUrl,
  isSaved,
  isSample = false,
  onToggleSave,
  onUpdateAnalysis,
  checkedDocs,
  onToggleDoc,
  certificates,
  onChangeCertificates: setCertificates,
  languageSpecs,
  onChangeLanguageSpecs: setLanguageSpecs,
  skills,
  onChangeSkills: setSkills,
  profileMeta,
  onChangeProfileMeta,
  applicationStatus,
  onChangeApplicationStatus,
  memo,
  onChangeMemo,
  essayDrafts,
  onChangeEssayDraft,
  interviewNotes = {},
  onChangeInterviewNote,
  reusableEssays = [],
  bonusOverrides,
  onToggleBonusOverride,
  onResetBonusOverrides,
  initialEditing = false,
  onCancelInitialEdit,
  similarSavedTitle = null,
  onOpenSimilarSaved,
}) => {
  const documents = useMemo(
    () => (Array.isArray(data.documents) ? data.documents : []),
    [data.documents]
  );
  const schedule = useMemo(
    () => (Array.isArray(data.schedule) ? data.schedule : []),
    [data.schedule]
  );
  const eligibility = useMemo(
    () => (Array.isArray(data.eligibility) ? data.eligibility : []),
    [data.eligibility]
  );
  const bonusPoints = useMemo(
    () => (Array.isArray(data.bonus_points) ? data.bonus_points : []),
    [data.bonus_points]
  );
  const techSkills = useMemo(
    () =>
      Array.isArray(data.tech_skills)
        ? data.tech_skills.filter((s): s is string => Boolean(s && s.trim()))
        : [],
    [data.tech_skills]
  );
  const keywords = useMemo(
    () =>
      Array.isArray(data.keywords)
        ? data.keywords.filter((s): s is string => Boolean(s && s.trim()))
        : [],
    [data.keywords]
  );
  const interviewQuestions = useMemo(
    () =>
      Array.isArray(data.interview_questions)
        ? data.interview_questions.filter((s): s is string => Boolean(s && s.trim()))
        : [],
    [data.interview_questions]
  );
  const stages = useMemo(
    () => (Array.isArray(data.stages) ? data.stages.filter((s): s is string => Boolean(s && s.trim())) : []),
    [data.stages]
  );
  const essayQuestions = useMemo(
    () => (Array.isArray(data.essay_questions) ? data.essay_questions : []),
    [data.essay_questions]
  );

  const dday = useMemo(
    () => calculateDocumentDeadlineDday(schedule, data.deadline_type),
    [schedule, data.deadline_type]
  );

  const [isEditing, setIsEditing] = useState(initialEditing);
  const [draft, setDraft] = useState<DraftJobAnalysis>(() => toDraft(data, sourceUrl));
  const [editToast, setEditToast] = useState<{
    message: string;
    kind: 'saved' | 'edited' | 'info';
  } | null>(null);
  const prevIsSavedRef = useRef(isSaved);
  const [accordionOpen, setAccordionOpen] = useState(false);
  const [selectedLangExam, setSelectedLangExam] = useState<string>('TOEIC');
  const [langScoreInput, setLangScoreInput] = useState<string>(
    () =>
      languageSpecs
        .find((s) => s.exam === 'TOEIC')
        ?.value.replace(/[^0-9]/g, '') ?? '785'
  );
  const [langGradeInput, setLangGradeInput] = useState<string>('IM2');
  const [langAcquiredDate, setLangAcquiredDate] = useState<string>(
    () => languageSpecs.find((s) => s.exam === 'TOEIC')?.acquiredDate ?? ''
  );
  const [skillInput, setSkillInput] = useState('');
  const [openEssayIdxMap, setOpenEssayIdxMap] = useState<Record<number, boolean>>({});
  const [openInterviewIdxMap, setOpenInterviewIdxMap] = useState<Record<number, boolean>>({});
  const [reuseEssayTargetIdx, setReuseEssayTargetIdx] = useState<number | null>(null);
  const [reuseSearchQuery, setReuseSearchQuery] = useState('');
  const [copiedEssayIdx, setCopiedEssayIdx] = useState<number | null>(null);
  const [copiedKeyword, setCopiedKeyword] = useState<string | null>(null);
  const [showCertModal, setShowCertModal] = useState(false);
  const [certSearchQuery, setCertSearchQuery] = useState('');
  const [certCategory, setCertCategory] = useState<CertCategory>('전체');
  const [activeModalLangExam, setActiveModalLangExam] = useState<string | null>(null);
  const [modalLangScore, setModalLangScore] = useState<string>('');
  const [modalLangGrade, setModalLangGrade] = useState<string>('IM2');
  const [specFeedback, setSpecFeedback] = useState<string | null>(null);
  const [showOriginalModal, setShowOriginalModal] = useState(false);
  const matchResultCardRef = useRef<HTMLDivElement>(null);
  const essayTextareaRefs = useRef<Record<number, HTMLTextAreaElement | null>>({});

  const filteredReusableEssays = useMemo(() => {
    const q = reuseSearchQuery.trim().toLowerCase();
    if (!q) return reusableEssays;
    return reusableEssays.filter(
      (item) =>
        item.organization.toLowerCase().includes(q) ||
        item.position.toLowerCase().includes(q) ||
        item.question.toLowerCase().includes(q) ||
        item.draft.toLowerCase().includes(q)
    );
  }, [reusableEssays, reuseSearchQuery]);

  const specMatch = useMemo(
    () =>
      evaluateSpecMatching(
        data,
        certificates,
        languageSpecs,
        bonusOverrides,
        skills,
        profileMeta,
        dday.matchedDate
      ),
    [data, certificates, languageSpecs, bonusOverrides, skills, profileMeta, dday.matchedDate]
  );

  const safeSourceUrl = useMemo(() => toSafeHttpUrl(sourceUrl), [sourceUrl]);
  const canExportCalendar = useMemo(() => hasExportableSchedule(data), [data]);
  const hasAnyBonusOverride = Object.keys(bonusOverrides).length > 0;

  const scrollToMatchResult = () => {
    matchResultCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const currentLangSpec = useMemo(
    () => LANGUAGE_EXAMS.find((e) => e.name === selectedLangExam) ?? LANGUAGE_EXAMS[0],
    [selectedLangExam]
  );

  // Keep inline language inputs synchronized with external profile modal / backup changes
  useEffect(() => {
    const existing = languageSpecs.find((item) => item.exam === currentLangSpec.name);
    if (currentLangSpec.mode === 'score') {
      setLangScoreInput(existing ? existing.value.replace(/[^0-9]/g, '') : '');
    } else if (currentLangSpec.grades?.length) {
      setLangGradeInput(
        existing && currentLangSpec.grades.includes(existing.value)
          ? existing.value
          : currentLangSpec.grades[Math.min(4, currentLangSpec.grades.length - 1)]
      );
    }
    setLangAcquiredDate(existing?.acquiredDate ?? '');
  }, [currentLangSpec, languageSpecs]);

  const filteredCertifications = useMemo(() => {
    const query = certSearchQuery.trim().toLowerCase();
    return OFFICIAL_CERTIFICATIONS.filter((cert) => {
      const matchCategory = certCategory === '전체' || cert.category === certCategory;
      const matchQuery =
        !query ||
        cert.name.toLowerCase().includes(query) ||
        cert.issuer.toLowerCase().includes(query) ||
        cert.category.toLowerCase().includes(query);
      return matchCategory && matchQuery;
    });
  }, [certSearchQuery, certCategory]);

  const showTempFeedback = (msg: string) => {
    setSpecFeedback(msg);
    window.setTimeout(() => {
      setSpecFeedback((prev) => (prev === msg ? null : prev));
    }, 2500);
  };

  const showTempEditToast = (
    message: string,
    kind: 'saved' | 'edited' | 'info' = 'info'
  ) => {
    setEditToast({ message, kind });
    window.setTimeout(() => {
      setEditToast((prev) => (prev && prev.message === message ? null : prev));
    }, 3000);
  };

  useEffect(() => {
    if (!prevIsSavedRef.current && isSaved && !initialEditing) {
      showTempEditToast('공고를 저장했어요!', 'saved');
    }
    prevIsSavedRef.current = isSaved;
  }, [isSaved, initialEditing]);

  const handleStartEdit = () => {
    setDraft(toDraft(data, sourceUrl));
    setIsEditing(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCancelEdit = () => {
    if (initialEditing && !data.organization && !data.position && onCancelInitialEdit) {
      onCancelInitialEdit();
      return;
    }
    setDraft(toDraft(data, sourceUrl));
    setIsEditing(false);
  };

  const handleSaveEdit = () => {
    const { analysis: sanitized, meta } = fromDraft(
      draft,
      checkedDocs,
      bonusOverrides,
      essayDrafts
    );
    onUpdateAnalysis(sanitized, meta);
    onChangeSourceUrl(meta.sourceUrl ?? null);
    setIsEditing(false);
    showTempEditToast('수정한 내용을 저장했어요!', 'edited');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const toggleDoc = (idx: number) => {
    onToggleDoc(idx);
  };

  const completedDocsCount = documents.reduce(
    (acc, _, idx) => (checkedDocs[idx] ? acc + 1 : acc),
    0
  );

  const upsertLanguageSpec = (
    examName: string,
    formattedValue: string,
    acquiredDate?: string
  ) => {
    const cleanDate = acquiredDate?.trim() || undefined;
    setLanguageSpecs((prev) => {
      const exists = prev.some((item) => item.exam === examName);
      if (exists) {
        return prev.map((item) =>
          item.exam === examName
            ? {
                exam: examName,
                value: formattedValue,
                ...(cleanDate
                  ? { acquiredDate: cleanDate }
                  : item.acquiredDate && acquiredDate === undefined
                    ? { acquiredDate: item.acquiredDate }
                    : {}),
              }
            : item
        );
      }
      return [
        ...prev,
        {
          exam: examName,
          value: formattedValue,
          ...(cleanDate ? { acquiredDate: cleanDate } : {}),
        },
      ];
    });
    showTempFeedback(`${examName} ${formattedValue} 성적이 반영되었습니다`);
  };

  const handleRemoveLanguageSpec = (examName: string) => {
    setLanguageSpecs((prev) => prev.filter((item) => item.exam !== examName));
    showTempFeedback(`${examName} 성적이 삭제되었습니다`);
  };

  const handleSelectLanguageExamChange = (examName: string) => {
    setSelectedLangExam(examName);
    const examMeta = LANGUAGE_EXAMS.find((e) => e.name === examName);
    const existing = languageSpecs.find((item) => item.exam === examName);
    if (examMeta?.mode === 'score') {
      setLangScoreInput(existing ? existing.value.replace(/[^0-9]/g, '') : '');
    } else if (examMeta?.grades?.length) {
      setLangGradeInput(
        existing && examMeta.grades.includes(existing.value)
          ? existing.value
          : examMeta.grades[Math.min(4, examMeta.grades.length - 1)]
      );
    }
    setLangAcquiredDate(existing?.acquiredDate ?? '');
  };

  const handleToggleCertificate = (certName: string) => {
    const langExam = LANGUAGE_EXAMS.find((e) => e.name === certName);
    if (langExam) {
      if (activeModalLangExam === certName) {
        setActiveModalLangExam(null);
        return;
      }
      setActiveModalLangExam(certName);
      const existing = languageSpecs.find((item) => item.exam === certName);
      if (langExam.mode === 'score') {
        setModalLangScore(existing ? existing.value.replace(/[^0-9]/g, '') : '');
      } else if (langExam.grades?.length) {
        setModalLangGrade(
          existing && langExam.grades.includes(existing.value)
            ? existing.value
            : langExam.grades[Math.min(4, langExam.grades.length - 1)]
        );
      }
      return;
    }

    setCertificates((prev) => {
      if (prev.includes(certName)) {
        showTempFeedback(`'${certName}' 자격증이 해제되었습니다`);
        return prev.filter((item) => item !== certName);
      }
      showTempFeedback(`'${certName}' 자격증이 추가되었습니다`);
      return [...prev, certName];
    });
  };

  const handleRemoveCertificate = (cert: string) => {
    setCertificates((prev) => prev.filter((item) => item !== cert));
    showTempFeedback(`'${cert}' 자격증이 삭제되었습니다`);
  };

  const handleAddInlineSkill = () => {
    const trimmed = skillInput.trim();
    if (!trimmed) return;
    const exists = skills.some((s) => s.toLowerCase() === trimmed.toLowerCase());
    if (!exists) {
      setSkills((prev) => [...prev, trimmed]);
      showTempFeedback(`'${trimmed}' 역량이 추가되었습니다`);
    }
    setSkillInput('');
  };

  const handleRemoveSkill = (skillName: string) => {
    setSkills((prev) => prev.filter((s) => s !== skillName));
    showTempFeedback(`'${skillName}' 역량이 삭제되었습니다`);
  };

  const handleApplyScore = () => {
    if (currentLangSpec.mode === 'score') {
      const raw = langScoreInput.trim();
      if (!raw) return;
      const num = Number(raw);
      const maxScore = currentLangSpec.maxScore ?? 9999;
      if (!Number.isFinite(num) || num < 0 || num > maxScore) {
        showTempFeedback(
          `${currentLangSpec.name} 점수는 0~${maxScore}${currentLangSpec.unit ?? '점'} 사이로 입력해 주세요`
        );
        return;
      }
      const normalized = String(Math.round(num));
      upsertLanguageSpec(
        currentLangSpec.name,
        `${normalized}${currentLangSpec.unit ?? '점'}`,
        langAcquiredDate
      );
    } else {
      if (!langGradeInput) return;
      upsertLanguageSpec(currentLangSpec.name, langGradeInput, langAcquiredDate);
    }
  };

  const handleCopyText = async (content: string, successMsg: string, onDone?: () => void) => {
    try {
      await navigator.clipboard.writeText(content);
      onDone?.();
      showTempEditToast(successMsg);
    } catch {
      showTempEditToast('클립보드 복사를 지원하지 않는 환경입니다');
    }
  };

  const handleCopyFullSummary = () => {
    const ddayLabel = dday.found
      ? dday.label
      : dday.isRolling
        ? dday.rollingLabel ?? '상시채용'
        : '일정 미정';
    const summaryText = buildAnnouncementSummaryText({
      data,
      ddayLabel,
      matchedDate: dday.matchedDate,
      matchedTime: dday.matchedTime,
      specLabel: specMatch.overallLabel,
      bonusPoints: specMatch.totalBonusPoints,
      documents,
      checkedDocs,
      essayQuestions,
      keywords,
      sourceUrl: safeSourceUrl,
    });
    handleCopyText(summaryText, '공고 핵심 요약이 복사되었습니다');
  };

  const handleInsertKeywordToDraft = (idx: number, keyword: string) => {
    const current = essayDrafts[idx] ?? '';
    const el = essayTextareaRefs.current[idx];
    let nextVal = '';
    let nextCursor = current.length;

    if (el && typeof el.selectionStart === 'number' && typeof el.selectionEnd === 'number') {
      const start = el.selectionStart;
      const end = el.selectionEnd;
      const before = current.slice(0, start);
      const after = current.slice(end);
      const needsLeadingSpace = before.length > 0 && !/[\s\n]$/.test(before);
      const needsTrailingSpace = after.length > 0 && !/^[\s\n]/.test(after);
      const insertToken = `${needsLeadingSpace ? ' ' : ''}${keyword}${needsTrailingSpace ? ' ' : ''}`;
      nextVal = `${before}${insertToken}${after}`;
      nextCursor = before.length + insertToken.length;
    } else {
      const separator = current.length > 0 && !/[\s\n]$/.test(current) ? ' ' : '';
      nextVal = `${current}${separator}${keyword}`;
      nextCursor = nextVal.length;
    }

    onChangeEssayDraft(idx, nextVal);
    showTempEditToast(`문항 ${idx + 1} 초안에 '${keyword}'를 넣었습니다`);
    window.requestAnimationFrame(() => {
      const target = essayTextareaRefs.current[idx];
      if (target) {
        target.focus();
        target.setSelectionRange(nextCursor, nextCursor);
      }
    });
  };

  const handleCopyAllEssayDrafts = () => {
    const org = data.organization?.trim() || '공고쏙';
    const blocks = essayQuestions
      .map((eq, idx) => {
        const q = eq.question?.trim() || `문항 ${idx + 1}`;
        const limit = eq.max_chars ? ` (${eq.max_chars})` : '';
        const draftBody = (essayDrafts[idx] ?? '').trim() || '(미작성)';
        return `[문항 ${idx + 1}] ${q}${limit}\n${draftBody}`;
      })
      .join('\n\n');
    handleCopyText(
      `[${org} 자기소개서 초안]\n\n${blocks}`,
      '전체 자소서 문항과 초안이 복사되었습니다'
    );
  };

  const writtenEssaysCount = essayQuestions.reduce(
    (acc, _, idx) => ((essayDrafts[idx] ?? '').trim().length > 0 ? acc + 1 : acc),
    0
  );

  return (
    <div className="flex flex-col w-full pb-24 lg:pb-10 space-y-4">
      {/* 수정 및 저장 완료 토스트 배너 */}
      {editToast &&
        (editToast.kind === 'saved' || editToast.kind === 'edited' ? (
          <div className="brand-card rounded-2xl px-4 py-3 flex items-center gap-3 ring-1 ring-secondary/20 mascot-pop">
            <Mascot variant="saved" size="md" animation="pop" />
            <div className="min-w-0 flex-1">
              <p className="font-label-md text-label-md text-secondary">
                {editToast.message}
              </p>
              <p className="font-body-sm text-body-sm text-on-surface-variant truncate">
                {editToast.kind === 'saved'
                  ? '내 공고함에서 언제든 다시 확인하고 비교할 수 있어요'
                  : '변경된 조건과 일정이 바로 반영되었어요'}
              </p>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl bg-tertiary-fixed text-on-tertiary-fixed px-4 py-2.5 flex items-center gap-2 shadow-xs">
            <span
              className="material-symbols-outlined text-[18px]"
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              check_circle
            </span>
            <span className="font-label-md text-label-md">{editToast.message}</span>
          </div>
        ))}

      {/* 저장 전 유사/중복 공고 알림 */}
      {!isSaved && !isEditing && similarSavedTitle && (
        <div className="rounded-2xl bg-[var(--color-bell-soft)] border border-[var(--color-bell-border)] text-[var(--color-bell-ink)] px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <span
              className="material-symbols-outlined text-[19px] text-amber-600 shrink-0"
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              notifications_active
            </span>
            <p className="font-body-sm text-body-sm min-w-0 truncate">
              <strong className="font-semibold">이미 내 공고함에 저장된 공고</strong>와 같아요 ({similarSavedTitle})
            </p>
          </div>
          {onOpenSimilarSaved && (
            <button
              type="button"
              onClick={onOpenSimilarSaved}
              className="px-3 py-1.5 rounded-xl bg-surface-container-lowest border border-amber-200/80 text-on-surface hover:border-amber-400 font-label-sm text-label-sm whitespace-nowrap shrink-0 active:scale-95 transition-all"
            >
              기존 공고 열기
            </button>
          )}
        </div>
      )}

      {isEditing && (
        <div className="rounded-2xl bg-secondary-fixed text-on-secondary-fixed px-4 py-2.5 flex items-center justify-between gap-2 shadow-xs border border-secondary/15">
          <div className="flex items-center gap-2 min-w-0">
            <span className="material-symbols-outlined text-[18px] shrink-0">edit_note</span>
            <span className="font-label-md text-label-md truncate">
              분석 결과 수정 중 · 변경 후 저장하세요
            </span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={handleCancelEdit}
              className="px-3 py-1.5 rounded-lg bg-surface-container-lowest text-on-surface font-label-sm text-label-sm whitespace-nowrap"
            >
              취소
            </button>
            <button
              type="button"
              onClick={handleSaveEdit}
              className="px-3 py-1.5 rounded-lg bg-secondary text-on-secondary font-label-sm text-label-sm whitespace-nowrap"
            >
              완료
            </button>
          </div>
        </div>
      )}

      {/* 기관 및 마감 요약 카드 */}
      <div className="brand-card rounded-2xl p-4 sm:p-5">
        {isEditing ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-label-md text-label-md text-secondary font-semibold">
                기관 · 직렬 · 처우 · 전형 수정
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block font-label-sm text-label-sm text-on-surface-variant mb-1">
                  기업 구분
                </label>
                <select
                  value={draft.company_type}
                  onChange={(e) =>
                    setDraft((prev) => ({
                      ...prev,
                      company_type: e.target.value as CompanyType | '',
                    }))
                  }
                  className="w-full px-2.5 py-2 bg-surface-container-low rounded-lg text-on-surface font-body-sm text-body-sm focus:bg-surface-container-lowest focus:outline-none focus:ring-2 focus:ring-secondary/20"
                >
                  <option value="">미지정</option>
                  <option value="공기업">공기업·공공기관</option>
                  <option value="사기업">사기업·IT·대기업</option>
                </select>
              </div>
              <div>
                <label className="block font-label-sm text-label-sm text-on-surface-variant mb-1">
                  접수 마감 방식
                </label>
                <select
                  value={draft.deadline_type}
                  onChange={(e) =>
                    setDraft((prev) => ({
                      ...prev,
                      deadline_type: e.target.value as DeadlineType | '',
                    }))
                  }
                  className="w-full px-2.5 py-2 bg-surface-container-low rounded-lg text-on-surface font-body-sm text-body-sm focus:bg-surface-container-lowest focus:outline-none focus:ring-2 focus:ring-secondary/20"
                >
                  <option value="">자동/지정일</option>
                  <option value="fixed">마감일 지정</option>
                  <option value="rolling">상시채용</option>
                  <option value="until_hired">채용 시 마감</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block font-label-sm text-label-sm text-on-surface-variant mb-1">
                기관명 / 회사명
              </label>
              <input
                type="text"
                value={draft.organization}
                onChange={(e) =>
                  setDraft((prev) => ({ ...prev, organization: e.target.value }))
                }
                placeholder="예: 한국전력거래소 또는 네이버클라우드"
                className="w-full px-3 py-2 bg-surface-container-low rounded-lg text-on-surface font-body-md text-body-md focus:bg-surface-container-lowest focus:outline-none focus:ring-2 focus:ring-secondary/20"
              />
            </div>
            <div>
              <label className="block font-label-sm text-label-sm text-on-surface-variant mb-1">
                모집 분야 / 직무 · 직렬
              </label>
              <input
                type="text"
                value={draft.position}
                onChange={(e) =>
                  setDraft((prev) => ({ ...prev, position: e.target.value }))
                }
                placeholder="예: 전기 직렬 또는 백엔드 개발자"
                className="w-full px-3 py-2 bg-surface-container-low rounded-lg text-on-surface font-body-md text-body-md focus:bg-surface-container-lowest focus:outline-none focus:ring-2 focus:ring-secondary/20"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block font-label-sm text-label-sm text-on-surface-variant mb-1">
                  경력 요건
                </label>
                <input
                  type="text"
                  value={draft.experience_level}
                  onChange={(e) =>
                    setDraft((prev) => ({ ...prev, experience_level: e.target.value }))
                  }
                  placeholder="예: 신입 / 경력 3년+"
                  className="w-full px-2.5 py-2 bg-surface-container-low rounded-lg text-on-surface font-body-sm text-body-sm focus:bg-surface-container-lowest focus:outline-none focus:ring-2 focus:ring-secondary/20"
                />
              </div>
              <div>
                <label className="block font-label-sm text-label-sm text-on-surface-variant mb-1">
                  연봉 · 처우
                </label>
                <input
                  type="text"
                  value={draft.compensation}
                  onChange={(e) =>
                    setDraft((prev) => ({ ...prev, compensation: e.target.value }))
                  }
                  placeholder="예: 연봉 5,200만원~"
                  className="w-full px-2.5 py-2 bg-surface-container-low rounded-lg text-on-surface font-body-sm text-body-sm focus:bg-surface-container-lowest focus:outline-none focus:ring-2 focus:ring-secondary/20"
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block font-label-sm text-label-sm text-on-surface-variant mb-1">
                  고용형태
                </label>
                <input
                  type="text"
                  value={draft.employment_type}
                  onChange={(e) =>
                    setDraft((prev) => ({ ...prev, employment_type: e.target.value }))
                  }
                  placeholder="정규직"
                  className="w-full px-2.5 py-2 bg-surface-container-low rounded-lg text-on-surface font-body-sm text-body-sm focus:bg-surface-container-lowest focus:outline-none focus:ring-2 focus:ring-secondary/20"
                />
              </div>
              <div>
                <label className="block font-label-sm text-label-sm text-on-surface-variant mb-1">
                  근무지
                </label>
                <input
                  type="text"
                  value={draft.location}
                  onChange={(e) =>
                    setDraft((prev) => ({ ...prev, location: e.target.value }))
                  }
                  placeholder="서울/판교"
                  className="w-full px-2.5 py-2 bg-surface-container-low rounded-lg text-on-surface font-body-sm text-body-sm focus:bg-surface-container-lowest focus:outline-none focus:ring-2 focus:ring-secondary/20"
                />
              </div>
              <div>
                <label className="block font-label-sm text-label-sm text-on-surface-variant mb-1">
                  채용인원
                </label>
                <input
                  type="text"
                  value={draft.headcount}
                  onChange={(e) =>
                    setDraft((prev) => ({ ...prev, headcount: e.target.value }))
                  }
                  placeholder="0명"
                  className="w-full px-2.5 py-2 bg-surface-container-low rounded-lg text-on-surface font-body-sm text-body-sm focus:bg-surface-container-lowest focus:outline-none focus:ring-2 focus:ring-secondary/20"
                />
              </div>
            </div>
            <div>
              <label className="block font-label-sm text-label-sm text-on-surface-variant mb-1">
                전형 단계 (쉼표로 구분)
              </label>
              <input
                type="text"
                value={draft.stagesText}
                onChange={(e) =>
                  setDraft((prev) => ({ ...prev, stagesText: e.target.value }))
                }
                placeholder="예: 서류전형, 코딩테스트, 기술면접, 최종합격"
                className="w-full px-3 py-2 bg-surface-container-low rounded-lg text-on-surface font-body-sm text-body-sm focus:bg-surface-container-lowest focus:outline-none focus:ring-2 focus:ring-secondary/20"
              />
            </div>
            <div>
              <label className="block font-label-sm text-label-sm text-on-surface-variant mb-1">
                공고 원문 / 지원 페이지 링크 (URL)
              </label>
              <input
                type="url"
                value={draft.sourceUrl}
                onChange={(e) =>
                  setDraft((prev) => ({ ...prev, sourceUrl: e.target.value }))
                }
                placeholder="https://... 공고 원문 URL"
                className="w-full px-3 py-2 bg-surface-container-low rounded-lg text-on-surface font-body-sm text-body-sm focus:bg-surface-container-lowest focus:outline-none focus:ring-2 focus:ring-secondary/20"
              />
            </div>
          </div>
        ) : (
          <>
            {isSample && (
              <div className="mb-3 flex items-start gap-2 rounded-xl bg-surface-container-high px-3 py-2.5">
                <span className="shrink-0 px-1.5 py-0.5 rounded-md bg-surface-container-lowest text-on-surface-variant font-label-sm text-label-sm">
                  샘플
                </span>
                <p className="font-label-sm text-label-sm text-on-surface-variant font-normal">
                  앱에 기본으로 들어 있는 체험용 예시 공고예요. 실제 채용 내용(일정·자격·자소서 문항)이
                  아니니 지원에 참고하지 마세요.
                </p>
              </div>
            )}
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="min-w-0 flex-1">
                <p className="font-label-sm text-label-sm text-on-surface-variant mb-1 truncate">
                  {data.company_type ? `${data.company_type} · ` : ''}
                  {stages.length > 0 ? stages.join(' → ') : '채용공고'}
                </p>
                <h2 className="font-headline-lg text-headline-lg text-on-surface tracking-tight break-words">
                  {data.organization ? data.organization : <MissingText />}
                </h2>
                <p className="font-body-lg text-body-lg text-secondary font-semibold mt-0.5 break-words">
                  {data.position ? data.position : <MissingText />}
                </p>
                {(data.employment_type ||
                  data.experience_level ||
                  data.location ||
                  data.headcount) && (
                  <p className="font-body-sm text-body-sm text-on-surface-variant mt-1.5 flex items-center gap-1.5 flex-wrap">
                    {[
                      data.employment_type,
                      data.experience_level,
                      data.location,
                      data.headcount,
                    ]
                      .filter(Boolean)
                      .filter((v, i, a) => a.indexOf(v) === i) // 같은 값(예: 신입·신입)은 한 번만
                      .map((meta, i, arr) => (
                        <React.Fragment key={i}>
                          <span>{meta}</span>
                          {i < arr.length - 1 && (
                            <span className="text-outline" aria-hidden="true">
                              ·
                            </span>
                          )}
                        </React.Fragment>
                      ))}
                  </p>
                )}
                {data.compensation && (
                  <p className="font-label-sm text-label-sm text-on-tertiary-fixed-variant font-medium mt-1 flex items-center gap-1">
                    <span className="material-symbols-outlined text-[15px]">payments</span>
                    <span>{data.compensation}</span>
                  </p>
                )}
              </div>
              <div className="shrink-0 flex flex-col items-end gap-1.5">
                {dday.found ? (
                  <span
                    className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-xl font-headline-sm text-headline-sm shadow-sm ${
                      dday.isUrgent
                        ? 'bg-error text-on-error animate-pulse'
                        : dday.isExpired
                          ? 'bg-surface-container-high text-outline'
                          : 'bg-secondary text-on-secondary'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[18px]">timer</span>
                    {dday.label}
                  </span>
                ) : dday.isRolling ? (
                  <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-secondary-fixed text-on-secondary-fixed font-label-md text-label-md shadow-sm">
                    <span className="material-symbols-outlined text-[16px]">all_inclusive</span>
                    {dday.rollingLabel}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-surface-container-high text-outline font-label-md text-label-md">
                    <span className="material-symbols-outlined text-[16px]">timer</span>
                    공고에 없음
                  </span>
                )}
                <div className="flex items-center gap-1.5 no-print">
                  <button
                    type="button"
                    onClick={() => window.print()}
                    title="공고 요약 인쇄 / PDF 저장"
                    aria-label="공고 요약 인쇄 또는 PDF 저장"
                    className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-surface-container-low hover:bg-surface-container text-on-surface-variant hover:text-secondary active:scale-95 transition-all"
                  >
                    <span className="material-symbols-outlined text-[15px]">print</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleCopyFullSummary}
                    title="노션·카톡 공유용 요약 복사"
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-surface-container-low hover:bg-surface-container text-on-surface-variant hover:text-secondary font-label-sm text-label-sm active:scale-95 transition-all whitespace-nowrap"
                  >
                    <span className="material-symbols-outlined text-[14px]">content_copy</span>
                    <span>요약 복사</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleStartEdit}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-surface-container-low hover:bg-surface-container text-secondary font-label-sm text-label-sm active:scale-95 transition-all whitespace-nowrap"
                  >
                    <span className="material-symbols-outlined text-[14px]">edit</span>
                    <span>결과 수정</span>
                  </button>
                </div>
              </div>
            </div>

            {/* 접수 일정 메타 바 */}
            <div className="bg-surface-container-low rounded-lg p-2.5 flex items-center gap-2 text-on-surface-variant font-body-sm text-body-sm">
              <span className="material-symbols-outlined text-[18px] text-secondary shrink-0">
                calendar_clock
              </span>
              <span className="font-medium text-on-surface shrink-0">서류 마감</span>
              <span className="text-on-surface-variant truncate">
                {dday.found ? (
                  <>
                    {dday.matchedDate}
                    {dday.matchedTime ? ` ${dday.matchedTime}` : ''}
                    {dday.matchedStep ? ` (${dday.matchedStep})` : ''}
                  </>
                ) : dday.isRolling ? (
                  <span className="text-secondary font-medium">
                    {dday.rollingLabel} (수시 검토)
                  </span>
                ) : (
                  <MissingText />
                )}
              </span>
            </div>

            {safeSourceUrl && (
              <div className="mt-2 bg-surface-container-low rounded-lg px-2.5 py-2 flex items-center justify-between gap-2">
                <a
                  href={safeSourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 min-w-0 flex-1 text-secondary hover:underline font-label-sm text-label-sm"
                >
                  <span className="material-symbols-outlined text-[16px] shrink-0">
                    open_in_new
                  </span>
                  <span className="truncate">공고 원문 바로가기 ({safeSourceUrl})</span>
                </a>
                <button
                  type="button"
                  aria-label="공고 링크 복사"
                  onClick={() => handleCopyText(safeSourceUrl, '공고 링크가 복사되었습니다')}
                  className="px-2 py-1 rounded-md bg-surface-container-lowest text-on-surface-variant hover:text-secondary font-label-sm text-label-sm shrink-0"
                >
                  복사
                </button>
              </div>
            )}
            {/* 설명하는 공정이 핵심 안내 + 판정 요약 한 줄 */}
            <div className="mt-3 pt-3 border-t border-[#edf2f9] flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <Mascot variant="explaining" size="lg" />
                <div className="min-w-0 flex-1 space-y-0.5">
                  <p className="font-label-md text-label-md text-primary">
                    핵심 내용을 확인해 보세요!
                  </p>
                  <button
                    type="button"
                    onClick={scrollToMatchResult}
                    className="text-left font-body-sm text-body-sm text-on-surface-variant hover:text-secondary transition-colors flex flex-wrap items-center gap-x-1.5 gap-y-0.5 tabular-nums"
                  >
                    <span
                      className={`font-semibold ${
                        specMatch.overallStatus === 'eligible'
                          ? 'text-on-tertiary-fixed-variant'
                          : specMatch.overallStatus === 'ineligible'
                            ? 'text-error'
                            : 'text-on-surface'
                      }`}
                    >
                      {specMatch.overallLabel}
                    </span>
                    <span aria-hidden="true" className="text-outline">
                      ·
                    </span>
                    <span className="font-medium text-secondary">
                      {specMatch.totalBonusPoints > 0
                        ? `예상 가산점 +${specMatch.totalBonusPoints}점`
                        : specMatch.matchedPreferenceCount > 0
                          ? `우대 ${specMatch.matchedPreferenceCount}건 일치`
                          : specMatch.bonusResults.some((b) => !b.isPointBased)
                            ? `우대 ${specMatch.bonusResults.length}건 확인`
                            : '가산점 +0점'}
                    </span>
                    {specMatch.skillMatch.totalSkills > 0 && (
                      <>
                        <span aria-hidden="true" className="text-outline">
                          ·
                        </span>
                        <span>
                          역량 {specMatch.skillMatch.matchedSkills.length}/
                          {specMatch.skillMatch.totalSkills}
                        </span>
                      </>
                    )}
                    {specMatch.unmetCount > 0 && (
                      <>
                        <span aria-hidden="true" className="text-outline">
                          ·
                        </span>
                        <span className="text-error font-medium">
                          미충족 {specMatch.unmetCount}건
                        </span>
                      </>
                    )}
                  </button>
                </div>
              </div>
              <button
                type="button"
                onClick={scrollToMatchResult}
                className="no-print hidden sm:inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-secondary-fixed text-on-secondary-fixed hover:bg-secondary-fixed-dim/55 font-label-sm text-label-sm whitespace-nowrap shrink-0 transition-colors"
              >
                <span>스펙 판정 보기</span>
                <span className="material-symbols-outlined text-[15px]">arrow_downward</span>
              </button>
            </div>
          </>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-6 items-start">
        <div className="lg:col-span-7 flex flex-col gap-4">
      {/* 카드 1: 주요 전형 일정 */}
      <div className="brand-card rounded-2xl p-space-md">
        <div className="flex items-center justify-between pb-3 border-b-0">
          <div className="flex items-center gap-2">
            <span className="w-7 h-7 rounded-lg bg-surface-container flex items-center justify-center text-on-surface">
              <span className="material-symbols-outlined text-[18px]">event_note</span>
            </span>
            <h3 className="font-headline-sm text-headline-sm text-on-surface">주요 전형 일정</h3>
          </div>
          {isEditing ? (
            <button
              type="button"
              onClick={() =>
                setDraft((prev) => ({
                  ...prev,
                  schedule: [
                    ...prev.schedule,
                    { step: '', date: '', time: '', source: '' },
                  ],
                }))
              }
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-secondary-fixed text-on-secondary-fixed font-label-sm text-label-sm"
            >
              <span className="material-symbols-outlined text-[15px]">add</span>
              일정 추가
            </button>
          ) : (
            <div className="flex items-center gap-1.5">
              {canExportCalendar && (
                <button
                  type="button"
                  onClick={() => {
                    if (downloadScheduleIcs(data)) {
                      showTempEditToast('채용 일정(.ics) 파일을 내려받았습니다');
                    }
                  }}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface font-label-sm text-label-sm active:scale-95 transition-all"
                  title="스마트폰/구글 캘린더에 일정 추가"
                >
                  <span className="material-symbols-outlined text-[14px] text-secondary">
                    calendar_add_on
                  </span>
                  <span>캘린더</span>
                </button>
              )}
              <span className="font-label-sm text-label-sm text-secondary bg-secondary-fixed/50 px-2 py-0.5 rounded-full">
                {schedule.length > 0 ? `총 ${schedule.length}개 전형` : '공고에 없음'}
              </span>
            </div>
          )}
        </div>

        {isEditing ? (
          <div className="mt-2 space-y-3">
            {draft.schedule.length === 0 ? (
              <p className="text-body-sm text-outline py-1">
                등록된 일정이 없습니다. &apos;일정 추가&apos;를 눌러 추가하세요.
              </p>
            ) : (
              draft.schedule.map((item, idx) => (
                <div
                  key={idx}
                  className="bg-surface-container-low rounded-xl p-3 space-y-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <input
                      type="text"
                      value={item.step}
                      onChange={(e) =>
                        setDraft((prev) => ({
                          ...prev,
                          schedule: prev.schedule.map((s, i) =>
                            i === idx ? { ...s, step: e.target.value } : s
                          ),
                        }))
                      }
                      placeholder="전형명 (예: 서류 접수 마감)"
                      className="flex-1 px-2.5 py-1.5 bg-surface-container-lowest rounded-lg text-on-surface font-body-md text-body-md focus:outline-none focus:ring-2 focus:ring-secondary/20"
                    />
                    <button
                      type="button"
                      aria-label="일정 삭제"
                      onClick={() =>
                        setDraft((prev) => ({
                          ...prev,
                          schedule: prev.schedule.filter((_, i) => i !== idx),
                        }))
                      }
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-outline hover:text-error hover:bg-error-container/40 shrink-0"
                    >
                      <span className="material-symbols-outlined text-[18px]">delete</span>
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="date"
                      value={item.date}
                      onChange={(e) =>
                        setDraft((prev) => ({
                          ...prev,
                          schedule: prev.schedule.map((s, i) =>
                            i === idx ? { ...s, date: e.target.value } : s
                          ),
                        }))
                      }
                      className="px-2.5 py-1.5 bg-surface-container-lowest rounded-lg text-on-surface font-body-sm text-body-sm focus:outline-none focus:ring-2 focus:ring-secondary/20"
                    />
                    <input
                      type="text"
                      value={item.time}
                      onChange={(e) =>
                        setDraft((prev) => ({
                          ...prev,
                          schedule: prev.schedule.map((s, i) =>
                            i === idx ? { ...s, time: e.target.value } : s
                          ),
                        }))
                      }
                      placeholder="시간 (예: 18:00)"
                      className="px-2.5 py-1.5 bg-surface-container-lowest rounded-lg text-on-surface font-body-sm text-body-sm focus:outline-none focus:ring-2 focus:ring-secondary/20"
                    />
                  </div>
                  <input
                    type="text"
                    value={item.source}
                    onChange={(e) =>
                      setDraft((prev) => ({
                        ...prev,
                        schedule: prev.schedule.map((s, i) =>
                          i === idx ? { ...s, source: e.target.value } : s
                        ),
                      }))
                    }
                    placeholder="공고 원문 메모 (선택)"
                    className="w-full px-2.5 py-1.5 bg-surface-container-lowest rounded-lg text-on-surface-variant font-body-sm text-body-sm focus:outline-none focus:ring-2 focus:ring-secondary/20"
                  />
                </div>
              ))
            )}
          </div>
        ) : schedule.length === 0 ? (
          <div className="py-3 text-body-sm text-outline">공고에 없음</div>
        ) : (
          <div className="relative pl-6 mt-3 space-y-4">
            {/* 타임라인 버티컬 라인 */}
            <div className="absolute left-2.5 top-2 bottom-2 w-0.5 bg-surface-container-highest" />

            {schedule.map((item, idx) => {
              const itemDiff = diffDaysFromToday(item.date);
              const isDeadlineMatch =
                dday.found &&
                dday.matchedStep === item.step &&
                dday.matchedDate === item.date;

              let dotClass = 'bg-outline-variant';
              if (isDeadlineMatch && dday.isUrgent) {
                dotClass = 'bg-error ring-4 ring-error-container';
              } else if (idx === 0 || (itemDiff !== null && itemDiff >= 0)) {
                dotClass = 'bg-secondary';
              }

              return (
                <div key={idx} className="relative flex items-start justify-between">
                  <div className={`absolute -left-6 top-1 w-2.5 h-2.5 rounded-full ${dotClass}`} />
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-body-md text-body-md text-on-surface font-semibold">
                        {item.step ? item.step : <MissingText />}
                      </span>
                      {itemDiff !== null && (
                        <span
                          className={`px-1.5 py-0.5 rounded font-label-sm text-label-sm ${
                            isDeadlineMatch && dday.isUrgent
                              ? 'bg-error-container text-on-error-container'
                              : 'bg-secondary-fixed text-on-secondary-fixed'
                          }`}
                        >
                          {itemDiff > 0
                            ? `D-${itemDiff}`
                            : itemDiff === 0
                              ? 'D-Day'
                              : `D+${Math.abs(itemDiff)}`}
                        </span>
                      )}
                    </div>
                    <p className="font-body-sm text-body-sm text-on-surface-variant">
                      {formatScheduleDateTime(item.date, item.time)}
                    </p>
                    <p className="font-body-sm text-body-sm text-on-surface-variant/80">
                      <span className="font-medium text-secondary">공고 원문:</span>{' '}
                      {item.source ? item.source : <MissingText />}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 카드 2: 지원 자격 및 가산점 분석 */}
      <div className="brand-card rounded-2xl p-space-md space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="w-7 h-7 rounded-lg bg-surface-container flex items-center justify-center text-on-surface">
              <span className="material-symbols-outlined text-[18px]">fact_check</span>
            </span>
            <h3 className="font-headline-sm text-headline-sm text-on-surface">
              지원 자격 및 가산점
            </h3>
          </div>
          {isEditing && (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() =>
                  setDraft((prev) => ({
                    ...prev,
                    eligibility: [
                      ...prev.eligibility,
                      { item: '', condition: '', source: '' },
                    ],
                  }))
                }
                className="inline-flex items-center gap-0.5 px-2 py-1 rounded-lg bg-surface-container text-on-surface font-label-sm text-label-sm"
              >
                <span className="material-symbols-outlined text-[14px]">add</span>
                자격
              </button>
              <button
                type="button"
                onClick={() =>
                  setDraft((prev) => ({
                    ...prev,
                    bonus_points: [
                      ...prev.bonus_points,
                      { item: '', points: '', source: '' },
                    ],
                  }))
                }
                className="inline-flex items-center gap-0.5 px-2 py-1 rounded-lg bg-secondary-fixed text-on-secondary-fixed font-label-sm text-label-sm"
              >
                <span className="material-symbols-outlined text-[14px]">add</span>
                가산점
              </button>
            </div>
          )}
        </div>

        {isEditing ? (
          <div className="space-y-3">
            <div>
              <label className="block font-label-sm text-label-sm text-on-surface-variant mb-1">
                요구 · 우대 기술스택 / 직무 역량 (쉼표로 구분)
              </label>
              <input
                type="text"
                value={draft.techSkillsText}
                onChange={(e) =>
                  setDraft((prev) => ({ ...prev, techSkillsText: e.target.value }))
                }
                placeholder="예: Python, SQL, AWS, Excel, Figma"
                className="w-full px-3 py-2 bg-surface-container-low rounded-lg text-on-surface font-body-sm text-body-sm focus:bg-surface-container-lowest focus:outline-none focus:ring-2 focus:ring-secondary/20"
              />
            </div>
            {draft.eligibility.map((elig, idx) => (
              <div
                key={`edit-elig-${idx}`}
                className="bg-surface-container-low rounded-xl p-3 space-y-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="px-2 py-0.5 rounded-full bg-surface-container-highest text-on-surface font-label-sm text-label-sm">
                    지원 자격 #{idx + 1}
                  </span>
                  <button
                    type="button"
                    aria-label="지원 자격 삭제"
                    onClick={() =>
                      setDraft((prev) => ({
                        ...prev,
                        eligibility: prev.eligibility.filter((_, i) => i !== idx),
                      }))
                    }
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-outline hover:text-error"
                  >
                    <span className="material-symbols-outlined text-[18px]">delete</span>
                  </button>
                </div>
                <input
                  type="text"
                  value={elig.item}
                  onChange={(e) =>
                    setDraft((prev) => ({
                      ...prev,
                      eligibility: prev.eligibility.map((x, i) =>
                        i === idx ? { ...x, item: e.target.value } : x
                      ),
                    }))
                  }
                  placeholder="자격 항목 (예: 공인어학성적)"
                  className="w-full px-2.5 py-1.5 bg-surface-container-lowest rounded-lg text-on-surface font-body-md text-body-md focus:outline-none focus:ring-2 focus:ring-secondary/20"
                />
                <input
                  type="text"
                  value={elig.condition}
                  onChange={(e) =>
                    setDraft((prev) => ({
                      ...prev,
                      eligibility: prev.eligibility.map((x, i) =>
                        i === idx ? { ...x, condition: e.target.value } : x
                      ),
                    }))
                  }
                  placeholder="세부 조건 (예: TOEIC 700점 이상)"
                  className="w-full px-2.5 py-1.5 bg-surface-container-lowest rounded-lg text-on-surface font-body-sm text-body-sm focus:outline-none focus:ring-2 focus:ring-secondary/20"
                />
                <input
                  type="text"
                  value={elig.source}
                  onChange={(e) =>
                    setDraft((prev) => ({
                      ...prev,
                      eligibility: prev.eligibility.map((x, i) =>
                        i === idx ? { ...x, source: e.target.value } : x
                      ),
                    }))
                  }
                  placeholder="공고 원문 근거 (선택)"
                  className="w-full px-2.5 py-1.5 bg-surface-container-lowest rounded-lg text-on-surface-variant font-body-sm text-body-sm focus:outline-none focus:ring-2 focus:ring-secondary/20"
                />
              </div>
            ))}

            {draft.bonus_points.map((bonus, idx) => (
              <div
                key={`edit-bonus-${idx}`}
                className="bg-surface-container-low rounded-xl p-3 space-y-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="px-2 py-0.5 rounded-full bg-secondary-fixed text-on-secondary-fixed font-label-sm text-label-sm">
                    우대·가산 #{idx + 1}
                  </span>
                  <button
                    type="button"
                    aria-label="가산점 삭제"
                    onClick={() =>
                      setDraft((prev) => ({
                        ...prev,
                        bonus_points: prev.bonus_points.filter((_, i) => i !== idx),
                      }))
                    }
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-outline hover:text-error"
                  >
                    <span className="material-symbols-outlined text-[18px]">delete</span>
                  </button>
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={bonus.item}
                    onChange={(e) =>
                      setDraft((prev) => ({
                        ...prev,
                        bonus_points: prev.bonus_points.map((x, i) =>
                          i === idx ? { ...x, item: e.target.value } : x
                        ),
                      }))
                    }
                    placeholder="우대·가산 항목 (예: AWS 경험 또는 전기기사)"
                    className="flex-1 min-w-0 px-2.5 py-1.5 bg-surface-container-lowest rounded-lg text-on-surface font-body-md text-body-md focus:outline-none focus:ring-2 focus:ring-secondary/20"
                  />
                  <div className="relative w-24 shrink-0">
                    <input
                      type="number"
                      step="0.5"
                      value={bonus.points}
                      onChange={(e) =>
                        setDraft((prev) => ({
                          ...prev,
                          bonus_points: prev.bonus_points.map((x, i) =>
                            i === idx ? { ...x, points: e.target.value } : x
                          ),
                        }))
                      }
                      placeholder="선택"
                      className="w-full pl-2.5 pr-6 py-1.5 bg-surface-container-lowest rounded-lg text-on-surface font-body-md text-body-md focus:outline-none focus:ring-2 focus:ring-secondary/20"
                    />
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-label-sm text-on-surface-variant">
                      점
                    </span>
                  </div>
                </div>
                <input
                  type="text"
                  value={bonus.source}
                  onChange={(e) =>
                    setDraft((prev) => ({
                      ...prev,
                      bonus_points: prev.bonus_points.map((x, i) =>
                        i === idx ? { ...x, source: e.target.value } : x
                      ),
                    }))
                  }
                  placeholder="공고 원문 근거 (선택)"
                  className="w-full px-2.5 py-1.5 bg-surface-container-lowest rounded-lg text-on-surface-variant font-body-sm text-body-sm focus:outline-none focus:ring-2 focus:ring-secondary/20"
                />
              </div>
            ))}

            {draft.eligibility.length === 0 && draft.bonus_points.length === 0 && (
              <p className="text-body-sm text-outline py-1">
                상단 버튼으로 지원 자격이나 우대·가산점 항목을 추가할 수 있습니다.
              </p>
            )}
          </div>
        ) : eligibility.length === 0 && bonusPoints.length === 0 && techSkills.length === 0 ? (
          <div className="py-2 text-body-sm text-outline">공고에 없음</div>
        ) : (
          <>
            {/* 요구 · 우대 기술스택 */}
            {techSkills.length > 0 && (
              <div className="bg-surface-container-low rounded-xl p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-label-md text-label-md text-on-surface flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-secondary text-[17px]">
                      code
                    </span>
                    요구 · 우대 기술/직무 역량
                  </span>
                  <span className="font-label-sm text-label-sm text-secondary">
                    {specMatch.skillMatch.matchedSkills.length}/{techSkills.length} 보유
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {techSkills.map((sk) => {
                    const isMatched = specMatch.skillMatch.matchedSkills.includes(sk);
                    return (
                      <span
                        key={sk}
                        className={`px-2.5 py-1 rounded-lg font-label-sm text-label-sm ${
                          isMatched
                            ? 'bg-tertiary-fixed text-on-tertiary-fixed font-semibold'
                            : 'bg-surface-container-lowest text-on-surface-variant'
                        }`}
                      >
                        {isMatched ? `✓ ${sk}` : sk}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 지원 자격 항목 */}
            {eligibility.map((elig, idx) => (
              <div
                key={`elig-${idx}`}
                className="bg-surface-container-low rounded-xl p-3 space-y-1.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="material-symbols-outlined text-secondary text-[18px] shrink-0">
                      language
                    </span>
                    <span className="font-body-md text-body-md text-on-surface font-semibold truncate">
                      {elig.item ? elig.item : <MissingText />}
                    </span>
                  </div>
                  <span className="px-2 py-0.5 rounded-full bg-surface-container-highest text-on-surface font-label-sm text-label-sm shrink-0">
                    지원 자격
                  </span>
                </div>
                <p className="font-body-md text-body-md text-on-surface">
                  {elig.condition ? elig.condition : <MissingText />}
                </p>
                <div className="p-2 bg-surface-container rounded text-on-surface-variant font-body-sm text-body-sm">
                  <span className="font-medium text-secondary">공고 원문:</span>{' '}
                  {elig.source ? elig.source : <MissingText />}
                </div>
              </div>
            ))}

            {/* 가산점 / 우대사항 항목 */}
            {bonusPoints.map((bonus, idx) => (
              <div
                key={`bonus-${idx}`}
                className="bg-surface-container-low rounded-xl p-3 space-y-1.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="material-symbols-outlined text-secondary-container text-[18px] shrink-0">
                      verified
                    </span>
                    <span className="font-body-md text-body-md text-on-surface font-semibold truncate">
                      {bonus.item ? bonus.item : <MissingText />}
                    </span>
                  </div>
                  {bonus.points !== null &&
                  bonus.points !== undefined &&
                  bonus.points > 0 ? (
                    <span className="px-2 py-0.5 rounded-full bg-secondary-fixed text-on-secondary-fixed font-label-sm text-label-sm font-bold shrink-0">
                      +{bonus.points}점
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-full bg-surface-container-highest text-on-surface-variant font-label-sm text-label-sm shrink-0">
                      우대사항
                    </span>
                  )}
                </div>
                <div className="p-2 bg-surface-container rounded text-on-surface-variant font-body-sm text-body-sm">
                  <span className="font-medium text-secondary">공고 원문:</span>{' '}
                  {bonus.source ? bonus.source : <MissingText />}
                </div>
              </div>
            ))}
          </>
        )}
      </div>

      {/* 카드 3: 제출 서류 인터랙티브 체크리스트 */}
      <div className="brand-card rounded-2xl p-space-md space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-7 h-7 rounded-lg bg-surface-container flex items-center justify-center text-on-surface">
              <span className="material-symbols-outlined text-[18px]">checklist</span>
            </span>
            <h3 className="font-headline-sm text-headline-sm text-on-surface">
              제출 서류 체크리스트
            </h3>
          </div>
          {isEditing ? (
            <button
              type="button"
              onClick={() =>
                setDraft((prev) => ({
                  ...prev,
                  documents: [...prev.documents, { text: '' }],
                }))
              }
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-secondary-fixed text-on-secondary-fixed font-label-sm text-label-sm"
            >
              <span className="material-symbols-outlined text-[15px]">add</span>
              서류 추가
            </button>
          ) : (
            <span
              id="checklist-counter"
              className="font-label-sm text-label-sm text-on-surface-variant bg-surface-container-high px-2 py-0.5 rounded-full"
            >
              {completedDocsCount} / {documents.length} 완료
            </span>
          )}
        </div>

        {isEditing ? (
          <div className="space-y-2">
            {draft.documents.length === 0 ? (
              <p className="text-body-sm text-outline py-1">
                등록된 제출 서류가 없습니다. &apos;서류 추가&apos;를 눌러 추가하세요.
              </p>
            ) : (
              draft.documents.map((doc, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={doc.text}
                    onChange={(e) =>
                      setDraft((prev) => ({
                        ...prev,
                        documents: prev.documents.map((d, i) =>
                          i === idx ? { ...d, text: e.target.value } : d
                        ),
                      }))
                    }
                    placeholder="제출 서류명 (예: 공인어학성적 증명서)"
                    className="flex-1 px-3 py-2 bg-surface-container-low rounded-lg text-on-surface font-body-md text-body-md focus:bg-surface-container-lowest focus:outline-none focus:ring-2 focus:ring-secondary/20"
                  />
                  <button
                    type="button"
                    aria-label="서류 삭제"
                    onClick={() =>
                      setDraft((prev) => ({
                        ...prev,
                        documents: prev.documents.filter((_, i) => i !== idx),
                      }))
                    }
                    className="w-9 h-9 rounded-lg flex items-center justify-center text-outline hover:text-error hover:bg-error-container/40 shrink-0"
                  >
                    <span className="material-symbols-outlined text-[18px]">delete</span>
                  </button>
                </div>
              ))
            )}
          </div>
        ) : documents.length === 0 ? (
          <div className="py-2 text-body-sm text-outline">공고에 없음</div>
        ) : (
          <div className="space-y-2" id="checklist-items">
            {documents.map((doc, idx) => {
              const isChecked = Boolean(checkedDocs[idx]);
              return (
                <label
                  key={idx}
                  className="flex items-start gap-3 p-2.5 rounded-lg bg-surface-container-low active:bg-surface-container cursor-pointer select-none"
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => toggleDoc(idx)}
                    className="mt-0.5 w-5 h-5 rounded accent-secondary-container cursor-pointer"
                  />
                  <div className="min-w-0 flex-1">
                    <p
                      className={`font-body-md text-body-md text-on-surface font-medium item-title ${
                        isChecked ? 'line-through opacity-70' : ''
                      }`}
                    >
                      {doc ? doc : <MissingText />}
                    </p>
                    <span
                      className={`font-body-sm text-body-sm font-medium ${
                        isChecked ? 'text-secondary' : 'text-on-surface-variant'
                      }`}
                    >
                      {isChecked ? '준비 완료' : '제출 전 확인 필요'}
                    </span>
                  </div>
                </label>
              );
            })}
            {documents.length > 0 && completedDocsCount === documents.length && (
              <div className="pt-2 mt-1 border-t border-surface-container-high flex items-center gap-2.5 mascot-pop">
                <Mascot variant="saved" size="xs" animation="pop" />
                <p className="font-label-md text-label-md text-on-tertiary-fixed-variant">
                  제출 서류를 모두 준비했어요!
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 카드 3-B': 공고에 자소서 문항이 없을 때 — 예시 문항 (실제 문항 아님) */}
      {!isEditing && essayQuestions.length === 0 && (
        <div className="brand-card rounded-2xl p-space-md space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="w-7 h-7 rounded-lg bg-surface-container flex items-center justify-center text-on-surface">
                <span className="material-symbols-outlined text-[18px]">edit_document</span>
              </span>
              <h3 className="font-headline-sm text-headline-sm text-on-surface">
                자기소개서 문항
              </h3>
            </div>
            <span className="inline-flex items-center gap-1 font-label-sm text-label-sm font-bold text-amber-800 bg-amber-100 border border-amber-300 px-2.5 py-0.5 rounded-full whitespace-nowrap">
              <span className="material-symbols-outlined text-[14px]">info</span>
              예시 · 공고에 없음
            </span>
          </div>
          <p className="font-label-sm text-label-sm text-on-surface-variant font-normal">
            이 공고문에는 자소서 문항이 없어요. 문항은 보통 지원서 작성 화면에서 확인할 수 있고,
            아래는 {data.company_type === '사기업' ? '민간 기업' : '공기업·공공기관'}에서 자주
            나오는 주제를 정리한 <b>예시</b>예요. 실제 문항과 다를 수 있으니 연습용으로만
            참고하세요.
          </p>
          <ul className="space-y-1.5">
            {(data.company_type === '사기업'
              ? EXAMPLE_ESSAY_PRIVATE
              : EXAMPLE_ESSAY_PUBLIC
            ).map((q, i) => (
              <li
                key={q}
                className="flex gap-2 rounded-xl bg-surface-container-low px-3 py-2 font-body-sm text-body-sm text-on-surface-variant"
              >
                <span className="shrink-0 font-label-sm text-label-sm text-outline tabular-nums">
                  예시 {i + 1}
                </span>
                <span>{q}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 카드 3-B: 자기소개서 문항 */}
      {(isEditing || essayQuestions.length > 0) && (
        <div className="brand-card rounded-2xl p-space-md space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="w-7 h-7 rounded-lg bg-surface-container flex items-center justify-center text-on-surface">
                <span className="material-symbols-outlined text-[18px]">edit_document</span>
              </span>
              <h3 className="font-headline-sm text-headline-sm text-on-surface">
                자기소개서 문항
              </h3>
            </div>
            {isEditing ? (
              <button
                type="button"
                onClick={() =>
                  setDraft((prev) => ({
                    ...prev,
                    essay_questions: [
                      ...prev.essay_questions,
                      { question: '', max_chars: '' },
                    ],
                  }))
                }
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-secondary-fixed text-on-secondary-fixed font-label-sm text-label-sm"
              >
                <span className="material-symbols-outlined text-[15px]">add</span>
                문항 추가
              </button>
            ) : (
              <div className="flex items-center gap-1.5">
                {writtenEssaysCount > 0 && (
                  <button
                    type="button"
                    onClick={handleCopyAllEssayDrafts}
                    className="no-print inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-surface-container hover:bg-secondary-fixed text-on-surface-variant hover:text-secondary font-label-sm text-label-sm transition-colors whitespace-nowrap"
                    title="모든 문항과 초안을 한 번에 복사"
                  >
                    <span className="material-symbols-outlined text-[13px]">content_copy</span>
                    <span>전체 복사</span>
                  </button>
                )}
                <span className="font-label-sm text-label-sm text-secondary bg-secondary-fixed/50 px-2.5 py-0.5 rounded-full tabular-nums">
                  작성 {writtenEssaysCount} / {essayQuestions.length}문항
                </span>
              </div>
            )}
          </div>

          {isEditing ? (
            <div className="space-y-2.5">
              {draft.essay_questions.length === 0 ? (
                <p className="text-body-sm text-outline py-1">
                  등록된 자소서 문항이 없습니다. &apos;문항 추가&apos;를 눌러 추가하세요.
                </p>
              ) : (
                draft.essay_questions.map((eq, idx) => (
                  <div
                    key={idx}
                    className="bg-surface-container-low rounded-xl p-3 space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-label-sm text-label-sm text-secondary font-semibold">
                        문항 {idx + 1}
                      </span>
                      <button
                        type="button"
                        aria-label="문항 삭제"
                        onClick={() =>
                          setDraft((prev) => ({
                            ...prev,
                            essay_questions: prev.essay_questions.filter(
                              (_, i) => i !== idx
                            ),
                          }))
                        }
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-outline hover:text-error"
                      >
                        <span className="material-symbols-outlined text-[18px]">delete</span>
                      </button>
                    </div>
                    <input
                      type="text"
                      value={eq.question}
                      onChange={(e) =>
                        setDraft((prev) => ({
                          ...prev,
                          essay_questions: prev.essay_questions.map((x, i) =>
                            i === idx ? { ...x, question: e.target.value } : x
                          ),
                        }))
                      }
                      placeholder="자소서 문항 내용을 입력하세요"
                      className="w-full px-2.5 py-1.5 bg-surface-container-lowest rounded-lg text-on-surface font-body-sm text-body-sm focus:outline-none focus:ring-2 focus:ring-secondary/20"
                    />
                    <input
                      type="text"
                      value={eq.max_chars}
                      onChange={(e) =>
                        setDraft((prev) => ({
                          ...prev,
                          essay_questions: prev.essay_questions.map((x, i) =>
                            i === idx ? { ...x, max_chars: e.target.value } : x
                          ),
                        }))
                      }
                      placeholder="글자 수 제한 (예: 700자 이내)"
                      className="w-full px-2.5 py-1.5 bg-surface-container-lowest rounded-lg text-on-surface-variant font-body-sm text-body-sm focus:outline-none focus:ring-2 focus:ring-secondary/20"
                    />
                  </div>
                ))
              )}
            </div>
          ) : (
            <div className="space-y-2.5">
              {essayQuestions.map((eq, idx) => {
                const draftText = essayDrafts[idx] ?? '';
                const isOpen = Boolean(openEssayIdxMap[idx]);
                const withSpaces = draftText.length;
                const withoutSpaces = draftText.replace(/\s/g, '').length;
                const charLimit = parseMaxCharsLimit(eq.max_chars);
                const overCount = charLimit !== null && withSpaces > charLimit ? withSpaces - charLimit : 0;
                const limitPct =
                  charLimit !== null ? Math.min(100, Math.round((withSpaces / charLimit) * 100)) : 0;

                return (
                  <div
                    key={idx}
                    className="p-3 rounded-xl bg-surface-container-low space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <span className="font-label-sm text-label-sm text-secondary font-semibold">
                          문항 {idx + 1}
                        </span>
                        <span
                          className={`px-1.5 py-0.5 rounded text-[11px] font-semibold ${
                            overCount > 0
                              ? 'bg-error-container text-on-error-container'
                              : withSpaces > 0
                                ? 'bg-tertiary-fixed text-on-tertiary-fixed'
                                : 'bg-surface-container text-outline'
                          }`}
                        >
                          {overCount > 0
                            ? '글자 수 초과'
                            : withSpaces > 0
                              ? '작성 중'
                              : '미작성'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {eq.max_chars && (
                          <span
                            className={`font-label-sm text-label-sm ${
                              overCount > 0 ? 'text-error font-semibold' : 'text-on-surface-variant'
                            }`}
                          >
                            {eq.max_chars}
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() =>
                            setOpenEssayIdxMap((prev) => ({
                              ...prev,
                              [idx]: !prev[idx],
                            }))
                          }
                          className={`px-2 py-0.5 rounded-md font-label-sm text-label-sm transition-colors ${
                            overCount > 0
                              ? 'bg-error-container text-on-error-container'
                              : isOpen || withSpaces > 0
                                ? 'bg-secondary-fixed text-on-secondary-fixed'
                                : 'bg-surface-container text-on-surface-variant hover:text-on-surface'
                          }`}
                        >
                          {isOpen
                            ? '초안 접기'
                            : withSpaces > 0
                              ? `초안 (${withSpaces}자)`
                              : '내 초안 작성'}
                        </button>
                      </div>
                    </div>
                    <p className="font-body-sm text-body-sm text-on-surface leading-relaxed">
                      {eq.question ? eq.question : <MissingText />}
                    </p>
                    {isOpen && (
                      <div className="pt-1 space-y-2">
                        {keywords.length > 0 && (
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[11px] font-medium text-on-surface-variant shrink-0">
                              추천 키워드 넣기:
                            </span>
                            {keywords.slice(0, 6).map((kw) => (
                              <button
                                key={kw}
                                type="button"
                                onClick={() => handleInsertKeywordToDraft(idx, kw)}
                                className="px-2 py-0.5 rounded-md bg-secondary-fixed/70 hover:bg-secondary-fixed text-on-secondary-fixed text-[11px] font-semibold active:scale-95 transition-all"
                              >
                                + {kw}
                              </button>
                            ))}
                          </div>
                        )}
                        <textarea
                          ref={(el) => {
                            essayTextareaRefs.current[idx] = el;
                          }}
                          rows={4}
                          value={draftText}
                          onChange={(e) => onChangeEssayDraft(idx, e.target.value)}
                          placeholder="여기에 문항 초안이나 핵심 키워드를 작성해 보세요. 글자 수가 실시간으로 계산됩니다."
                          className={`w-full p-2.5 bg-surface-container-lowest rounded-lg text-on-surface font-body-sm text-body-sm placeholder:text-outline/70 focus:outline-none focus:ring-2 resize-y leading-relaxed ${
                            overCount > 0
                              ? 'ring-2 ring-error focus:ring-error'
                              : 'focus:ring-secondary/20'
                          }`}
                        />
                        {charLimit !== null && (
                          <div className="w-full h-1.5 rounded-full bg-surface-container-highest overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-200 ${
                                overCount > 0 ? 'bg-error' : 'bg-secondary'
                              }`}
                              style={{ width: `${limitPct}%` }}
                            />
                          </div>
                        )}
                        <div className="flex items-center justify-between gap-2 text-[11px] text-on-surface-variant tabular-nums flex-wrap">
                          <span>
                            공백 포함{' '}
                            <strong className={overCount > 0 ? 'text-error' : 'text-secondary'}>
                              {withSpaces.toLocaleString()}
                              {charLimit !== null ? ` / ${charLimit.toLocaleString()}자` : '자'}
                            </strong>{' '}
                            · 제외 <strong>{withoutSpaces.toLocaleString()}자</strong>
                            {overCount > 0 && (
                              <span className="ml-1.5 text-error font-semibold">
                                ({overCount.toLocaleString()}자 초과)
                              </span>
                            )}
                          </span>
                          <div className="flex items-center gap-1.5 shrink-0 no-print">
                            {reusableEssays.length > 0 && (
                              <button
                                type="button"
                                onClick={() => {
                                  setReuseSearchQuery('');
                                  setReuseEssayTargetIdx(idx);
                                }}
                                className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-secondary-fixed/70 hover:bg-secondary-fixed text-on-secondary-fixed font-label-sm text-label-sm"
                              >
                                <span className="material-symbols-outlined text-[13px]">
                                  library_books
                                </span>
                                <span>다른 공고 초안 참고</span>
                              </button>
                            )}
                            <button
                              type="button"
                              disabled={!draftText.trim()}
                              onClick={() =>
                                handleCopyText(
                                  draftText,
                                  `문항 ${idx + 1} 초안이 복사되었습니다`,
                                  () => {
                                    setCopiedEssayIdx(idx);
                                    window.setTimeout(
                                      () => setCopiedEssayIdx((prev) => (prev === idx ? null : prev)),
                                      1800
                                    );
                                  }
                                )
                              }
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-surface-container-lowest text-on-surface hover:text-secondary disabled:opacity-45 font-label-sm text-label-sm"
                            >
                              <span className="material-symbols-outlined text-[13px]">
                                {copiedEssayIdx === idx ? 'check' : 'content_copy'}
                              </span>
                              {copiedEssayIdx === idx ? '복사됨' : '초안 복사'}
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 카드 3-C: 자소서 키워드 · 예상 면접 질문 */}
      {(isEditing || keywords.length > 0 || interviewQuestions.length > 0) && (
        <div className="brand-card rounded-2xl p-space-md space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="w-7 h-7 rounded-lg bg-surface-container flex items-center justify-center text-secondary">
                <span className="material-symbols-outlined text-[18px]">psychology</span>
              </span>
              <div>
                <h3 className="font-headline-sm text-headline-sm text-on-surface leading-tight">
                  자소서 키워드 · 예상 면접 질문
                </h3>
                <p className="font-label-sm text-label-sm text-on-surface-variant font-normal">
                  {isEditing
                    ? '쉼표/줄바꿈으로 직접 수정할 수 있습니다'
                    : '키워드를 누르면 복사됩니다 · 직무 맞춤형 포인트'}
                </p>
              </div>
            </div>
          </div>

          {isEditing ? (
            <div className="space-y-3">
              <div>
                <label className="block font-label-sm text-label-sm text-on-surface-variant mb-1">
                  핵심 키워드 (쉼표로 구분)
                </label>
                <input
                  type="text"
                  value={draft.keywordsText}
                  onChange={(e) =>
                    setDraft((prev) => ({ ...prev, keywordsText: e.target.value }))
                  }
                  placeholder="예: 전력계통 안정성, 문제해결력, 데이터 기반 의사결정"
                  className="w-full px-3 py-2 bg-surface-container-low rounded-lg text-on-surface font-body-sm text-body-sm focus:bg-surface-container-lowest focus:outline-none focus:ring-2 focus:ring-secondary/20"
                />
              </div>
              <div>
                <label className="block font-label-sm text-label-sm text-on-surface-variant mb-1">
                  예상 면접 질문 (한 줄에 하나씩 입력)
                </label>
                <textarea
                  rows={3}
                  value={draft.interviewQuestionsText}
                  onChange={(e) =>
                    setDraft((prev) => ({
                      ...prev,
                      interviewQuestionsText: e.target.value,
                    }))
                  }
                  placeholder="예상 면접 질문을 한 줄씩 입력하세요"
                  className="w-full p-2.5 bg-surface-container-low rounded-lg text-on-surface font-body-sm text-body-sm focus:bg-surface-container-lowest focus:outline-none focus:ring-2 focus:ring-secondary/20 resize-y leading-relaxed"
                />
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {keywords.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {keywords.map((kw) => {
                    const isCopied = copiedKeyword === kw;
                    return (
                      <button
                        key={kw}
                        type="button"
                        onClick={() =>
                          handleCopyText(kw, `'${kw}' 키워드가 복사되었습니다`, () => {
                            setCopiedKeyword(kw);
                            window.setTimeout(
                              () => setCopiedKeyword((prev) => (prev === kw ? null : prev)),
                              1600
                            );
                          })
                        }
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg font-label-sm text-label-sm transition-colors active:scale-95 ${
                          isCopied
                            ? 'bg-tertiary-fixed text-on-tertiary-fixed'
                            : 'bg-secondary-fixed/60 text-on-secondary-fixed hover:bg-secondary-fixed'
                        }`}
                      >
                        <span>#{kw}</span>
                        <span className="material-symbols-outlined text-[13px]">
                          {isCopied ? 'check' : 'content_copy'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}

              {interviewQuestions.length > 0 && (
                <div className="space-y-2">
                  {interviewQuestions.map((q, qIdx) => {
                    const noteVal = interviewNotes[qIdx] ?? '';
                    const isNoteOpen = Boolean(openInterviewIdxMap[qIdx]);
                    const hasNote = noteVal.trim().length > 0;
                    return (
                      <div
                        key={qIdx}
                        className="p-2.5 rounded-lg bg-surface-container-low space-y-2"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-start gap-2 min-w-0 flex-1">
                            <span className="w-5 h-5 rounded-full bg-secondary-fixed text-on-secondary-fixed font-label-sm text-label-sm flex items-center justify-center shrink-0 mt-0.5 tabular-nums">
                              {qIdx + 1}
                            </span>
                            <p className="font-body-sm text-body-sm text-on-surface leading-relaxed">
                              {q}
                            </p>
                          </div>
                          {onChangeInterviewNote && (
                            <button
                              type="button"
                              onClick={() =>
                                setOpenInterviewIdxMap((prev) => ({
                                  ...prev,
                                  [qIdx]: !prev[qIdx],
                                }))
                              }
                              className={`no-print shrink-0 px-2 py-0.5 rounded-md font-label-sm text-label-sm transition-colors ${
                                isNoteOpen || hasNote
                                  ? 'bg-secondary-fixed text-on-secondary-fixed'
                                  : 'bg-surface-container text-on-surface-variant hover:text-on-surface'
                              }`}
                            >
                              {isNoteOpen
                                ? '메모 접기'
                                : hasNote
                                  ? '답변 메모됨'
                                  : '답변 메모'}
                            </button>
                          )}
                        </div>
                        {(isNoteOpen || (hasNote && !isEditing)) && !isNoteOpen && (
                          <p className="pl-7 text-body-sm text-on-surface-variant line-clamp-2">
                            {noteVal}
                          </p>
                        )}
                        {isNoteOpen && onChangeInterviewNote && (
                          <div className="pl-7 space-y-1.5">
                            <textarea
                              rows={3}
                              value={noteVal}
                              onChange={(e) => onChangeInterviewNote(qIdx, e.target.value)}
                              placeholder="STAR 기법(상황-과제-행동-결과)이나 핵심 답변 키워드를 적어두세요."
                              className="w-full p-2 bg-surface-container-lowest rounded-lg text-on-surface font-body-sm text-body-sm placeholder:text-outline/70 focus:outline-none focus:ring-2 focus:ring-secondary/20 resize-y leading-relaxed"
                            />
                            <div className="flex items-center justify-between text-[11px] text-on-surface-variant">
                              <span className="tabular-nums">{noteVal.length}자 작성</span>
                              <button
                                type="button"
                                disabled={!hasNote}
                                onClick={() =>
                                  handleCopyText(
                                    `Q. ${q}\nA. ${noteVal}`,
                                    `면접 질문 ${qIdx + 1} 답변이 복사되었습니다`
                                  )
                                }
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-surface-container-lowest hover:text-secondary disabled:opacity-45 font-label-sm text-label-sm"
                              >
                                <span className="material-symbols-outlined text-[12px]">
                                  content_copy
                                </span>
                                <span>질문+답변 복사</span>
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}
        </div>

        <div className="lg:col-span-5 flex flex-col gap-4 lg:sticky lg:top-[84px]">
      {/* 통합 스펙 매칭 카드 (판정 결과 + 내 스펙 즉시 수정) */}
      <div
        ref={matchResultCardRef}
        className="brand-card rounded-2xl p-space-md space-y-4 scroll-mt-24"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <Mascot
              variant={specMatch.overallStatus === 'eligible' ? 'saved' : 'explaining'}
              size="md"
            />
            <div className="min-w-0">
              <h3 className="font-headline-sm text-headline-sm text-on-surface leading-tight">
                내 스펙 매칭 판정
              </h3>
              <p className="font-label-sm text-label-sm text-on-surface-variant font-normal truncate">
                자격증 · 어학 · 역량 실시간 계산
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => setAccordionOpen((prev) => !prev)}
              className={`no-print inline-flex items-center gap-0.5 px-2.5 py-1 rounded-lg font-label-sm text-label-sm transition-colors whitespace-nowrap ${
                accordionOpen
                  ? 'bg-secondary text-on-secondary'
                  : 'bg-surface-container-low hover:bg-surface-container text-secondary'
              }`}
            >
              <span>내 스펙 수정</span>
              <span
                className="material-symbols-outlined text-[16px] transition-transform duration-200"
                style={{ transform: accordionOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
              >
                expand_more
              </span>
            </button>
          </div>
        </div>

        {accordionOpen && (
          <div className="pt-3 pb-3 border-y border-[#edf2f9] space-y-4">
            {/* 학력 · 경력 연차 기준 */}
            <div>
              <label className="block font-label-md text-label-md text-on-surface mb-2">
                학력 · 경력 기준
              </label>
              <div className="grid grid-cols-2 gap-2">
                <select
                  aria-label="최종학력"
                  value={profileMeta.education}
                  onChange={(e) =>
                    onChangeProfileMeta((prev) => ({
                      ...prev,
                      education: e.target.value as EducationLevel | '',
                    }))
                  }
                  className="w-full px-2.5 py-2 bg-surface-container-low rounded-lg text-on-surface font-body-sm text-body-sm focus:bg-surface-container-lowest focus:outline-none focus:ring-2 focus:ring-secondary/20"
                >
                  {INLINE_EDUCATION_OPTIONS.map((opt) => (
                    <option key={opt.label} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <select
                  aria-label="경력 연차"
                  value={
                    profileMeta.careerYears !== null && profileMeta.careerYears !== undefined
                      ? String(profileMeta.careerYears)
                      : ''
                  }
                  onChange={(e) => {
                    const val = e.target.value;
                    onChangeProfileMeta((prev) => ({
                      ...prev,
                      careerYears: val === '' ? null : Number(val),
                    }));
                  }}
                  className="w-full px-2.5 py-2 bg-surface-container-low rounded-lg text-on-surface font-body-sm text-body-sm focus:bg-surface-container-lowest focus:outline-none focus:ring-2 focus:ring-secondary/20"
                >
                  {INLINE_CAREER_OPTIONS.map((opt) => (
                    <option key={opt.label} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block font-label-md text-label-md text-on-surface mb-2">
                등록된 자격증
              </label>
              <div className="flex flex-wrap gap-2">
                {certificates.map((cert, idx) => (
                  <button
                    key={cert}
                    type="button"
                    onClick={() => handleRemoveCertificate(cert)}
                    title="탭하여 삭제"
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg font-label-md text-label-md transition-opacity active:opacity-75 ${
                      idx === 0
                        ? 'bg-secondary-fixed text-on-secondary-fixed'
                        : 'bg-surface-container-high text-on-surface'
                    }`}
                  >
                    <span>{cert}</span>
                    <span className="material-symbols-outlined text-[14px]">close</span>
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    setCertSearchQuery('');
                    setCertCategory('전체');
                    setActiveModalLangExam(null);
                    setShowCertModal(true);
                  }}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-surface-container text-secondary font-label-md text-label-md active:bg-surface-container-highest"
                >
                  <span className="material-symbols-outlined text-[14px]">add</span>
                  자격증 추가
                </button>
              </div>
            </div>

            <div>
              <label
                className="block font-label-md text-label-md text-on-surface mb-2"
                htmlFor="lang-exam-select"
              >
                내 공인 어학 성적
              </label>

              {languageSpecs.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2.5">
                  {languageSpecs.map((spec) => {
                    const expiry = getLanguageExpiryInfo(
                      spec.acquiredDate,
                      dday.matchedDate
                    );
                    return (
                      <button
                        key={spec.exam}
                        type="button"
                        onClick={() => handleRemoveLanguageSpec(spec.exam)}
                        title="탭하여 삭제"
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg font-label-sm text-label-sm active:opacity-75 ${
                          expiry?.isExpired
                            ? 'bg-error-container text-on-error-container'
                            : 'bg-secondary-fixed text-on-secondary-fixed'
                        }`}
                      >
                        <span>
                          {spec.exam} {spec.value}
                          {expiry
                            ? expiry.isExpired
                              ? ' (만료)'
                              : ` (~${expiry.expiresAt.slice(2, 10)})`
                            : ''}
                        </span>
                        <span className="material-symbols-outlined text-[14px]">close</span>
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="flex gap-2">
                <select
                  id="lang-exam-select"
                  value={selectedLangExam}
                  onChange={(e) => handleSelectLanguageExamChange(e.target.value)}
                  className="w-[132px] shrink-0 px-2.5 py-2.5 bg-surface-container-low rounded-lg text-on-surface font-label-md text-label-md focus:bg-surface-container-lowest focus:outline-none focus:ring-2 focus:ring-secondary/20"
                >
                  {LANGUAGE_EXAMS.map((exam) => (
                    <option key={exam.name} value={exam.name}>
                      {exam.name}
                    </option>
                  ))}
                </select>

                {currentLangSpec.mode === 'score' ? (
                  <div className="relative flex-1 min-w-0">
                    <input
                      id="toeic-score"
                      type="number"
                      min={0}
                      max={currentLangSpec.maxScore}
                      value={langScoreInput}
                      onChange={(e) => setLangScoreInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleApplyScore();
                        }
                      }}
                      placeholder={currentLangSpec.placeholder ?? '점수 입력'}
                      className="w-full pl-3 pr-8 py-2.5 bg-surface-container-low rounded-lg text-on-surface font-headline-sm text-headline-sm focus:bg-surface-container-lowest focus:outline-none focus:ring-2 focus:ring-secondary/20"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 font-label-md text-label-md text-on-surface-variant">
                      {currentLangSpec.unit ?? '점'}
                    </span>
                  </div>
                ) : (
                  <select
                    id="lang-grade-select"
                    value={langGradeInput}
                    onChange={(e) => setLangGradeInput(e.target.value)}
                    className="flex-1 min-w-0 px-3 py-2.5 bg-surface-container-low rounded-lg text-on-surface font-headline-sm text-headline-sm focus:bg-surface-container-lowest focus:outline-none focus:ring-2 focus:ring-secondary/20"
                  >
                    {(currentLangSpec.grades ?? []).map((grade) => (
                      <option key={grade} value={grade}>
                        {grade}
                      </option>
                    ))}
                  </select>
                )}

                <button
                  type="button"
                  onClick={handleApplyScore}
                  className="px-4 py-2.5 rounded-lg bg-primary text-on-primary font-label-md text-label-md active:opacity-90 shrink-0"
                >
                  적용
                </button>
              </div>
              <div className="flex items-center gap-2 mt-2">
                <span className="font-label-sm text-label-sm text-on-surface-variant font-normal shrink-0">
                  시험 취득일(선택·2년 만료 체크):
                </span>
                <input
                  type="date"
                  aria-label="어학 시험 취득일"
                  value={langAcquiredDate}
                  onChange={(e) => setLangAcquiredDate(e.target.value)}
                  className="flex-1 min-w-0 px-2.5 py-1.5 bg-surface-container-low rounded-lg text-on-surface font-body-sm text-body-sm focus:bg-surface-container-lowest focus:outline-none focus:ring-2 focus:ring-secondary/20"
                />
              </div>
              <p
                className={`mt-2 font-body-sm text-body-sm flex items-center gap-1 ${
                  specFeedback ? 'text-on-tertiary-fixed-variant' : 'text-secondary'
                }`}
              >
                <span className="material-symbols-outlined text-[16px]">
                  {specFeedback ? 'check_circle' : 'info'}
                </span>
                {specFeedback ?? '내 스펙 정보를 바탕으로 지원 조건과 가산점이 자동 계산됩니다.'}
              </p>
            </div>

            {/* 내 직무 역량 · 기술스택 빠른 관리 */}
            <div className="pt-3 border-t border-surface-container-high space-y-2">
              <label className="block font-label-md text-label-md text-on-surface">
                내 직무 역량 · 기술스택 ({skills.length}개)
              </label>
              {skills.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {skills.map((skill) => (
                    <button
                      key={skill}
                      type="button"
                      onClick={() => handleRemoveSkill(skill)}
                      title="탭하여 삭제"
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-tertiary-fixed text-on-tertiary-fixed font-label-sm text-label-sm active:opacity-75"
                    >
                      <span>{skill}</span>
                      <span className="material-symbols-outlined text-[14px]">close</span>
                    </button>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={skillInput}
                  onChange={(e) => setSkillInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddInlineSkill();
                    }
                  }}
                  placeholder="예: Python, SQL, AWS, Excel, Figma"
                  className="flex-1 min-w-0 px-3 py-2 bg-surface-container-low rounded-lg text-on-surface font-body-sm text-body-sm placeholder:text-outline/70 focus:bg-surface-container-lowest focus:outline-none focus:ring-2 focus:ring-secondary/20"
                />
                <button
                  type="button"
                  onClick={handleAddInlineSkill}
                  className="px-3.5 py-2 rounded-lg bg-primary text-on-primary font-label-md text-label-md active:opacity-90 shrink-0"
                >
                  추가
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 요약 2열 카드: 지원 가능 여부 / 예상 가산점 또는 우대·역량 */}
        <div className="grid grid-cols-2 gap-2.5">
          <div
            className={`rounded-xl p-3 space-y-1 ${
              specMatch.overallStatus === 'eligible'
                ? 'bg-tertiary-fixed/40'
                : specMatch.overallStatus === 'ineligible'
                  ? 'bg-error-container/50'
                  : 'bg-surface-container-low'
            }`}
          >
            <span className="font-label-sm text-label-sm text-on-surface-variant block">
              지원 가능 여부
            </span>
            <div className="flex items-center gap-1.5">
              <span
                className={`material-symbols-outlined text-[20px] ${
                  specMatch.overallStatus === 'eligible'
                    ? 'text-on-tertiary-fixed-variant'
                    : specMatch.overallStatus === 'ineligible'
                      ? 'text-error'
                      : 'text-outline'
                }`}
                style={{ fontVariationSettings: "'FILL' 1" }}
              >
                {specMatch.overallStatus === 'eligible'
                  ? 'check_circle'
                  : specMatch.overallStatus === 'ineligible'
                    ? 'cancel'
                    : 'help'}
              </span>
              <span className="font-headline-sm text-headline-sm text-on-surface">
                {specMatch.overallStatus === 'eligible'
                  ? '지원 가능'
                  : specMatch.overallStatus === 'ineligible'
                    ? '요건 미달'
                    : '확인 필요'}
              </span>
            </div>
            <span className="font-body-sm text-body-sm text-on-surface-variant block">
              충족 {specMatch.metCount} · 미달 {specMatch.unmetCount} · 확인 {specMatch.checkCount}
            </span>
          </div>

          {(() => {
            const hasPointBonus = specMatch.bonusResults.some((b) => b.isPointBased);
            const showPointMode = hasPointBonus || specMatch.bonusResults.length === 0;
            return (
              <div className="rounded-xl p-3 bg-secondary-fixed/45 space-y-1">
                <span className="font-label-sm text-label-sm text-on-secondary-fixed block">
                  {showPointMode ? '예상 가산점' : '우대사항 일치'}
                </span>
                <div className="flex items-center gap-1.5">
                  <span
                    className="material-symbols-outlined text-[20px] text-secondary"
                    style={{ fontVariationSettings: "'FILL' 1" }}
                  >
                    stars
                  </span>
                  <span className="font-headline-lg text-headline-lg text-secondary tabular-nums">
                    {showPointMode
                      ? `+${specMatch.totalBonusPoints}점`
                      : `${specMatch.matchedPreferenceCount}/${specMatch.bonusResults.length}건`}
                  </span>
                </div>
                <span className="font-body-sm text-body-sm text-on-secondary-fixed/80 block">
                  {specMatch.skillMatch.totalSkills > 0
                    ? `역량 ${specMatch.skillMatch.matchedSkills.length}/${specMatch.skillMatch.totalSkills} 일치`
                    : `${specMatch.bonusResults.filter((b) => b.matched).length} / ${specMatch.bonusResults.length}개 항목 적용`}
                </span>
              </div>
            );
          })()}
        </div>

        {/* 지원 자격 항목별 판정 */}
        <div className="space-y-2">
          <h4 className="font-label-md text-label-md text-on-surface">지원 자격 판정 내역</h4>
          {specMatch.eligibilityResults.length === 0 ? (
            <p className="text-body-sm text-outline">공고에 없음</p>
          ) : (
            <div className="space-y-1.5">
              {specMatch.eligibilityResults.map((res, idx) => (
                <div
                  key={idx}
                  className="flex items-start justify-between gap-2 p-2.5 rounded-lg bg-surface-container-low"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-body-md text-body-md text-on-surface font-semibold truncate">
                      {res.title}
                    </p>
                    <p className="font-body-sm text-body-sm text-on-surface-variant mt-0.5">
                      {res.detail}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 px-2 py-0.5 rounded-full font-label-sm text-label-sm ${
                      res.status === 'met'
                        ? 'bg-tertiary-fixed text-on-tertiary-fixed'
                        : res.status === 'unmet'
                          ? 'bg-error-container text-on-error-container'
                          : 'bg-surface-container-highest text-on-surface-variant'
                    }`}
                  >
                    {res.status === 'met'
                      ? '충족'
                      : res.status === 'unmet'
                        ? '미달'
                        : '확인'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 직무 역량 · 기술스택 매칭 */}
        {specMatch.skillMatch.totalSkills > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="font-label-md text-label-md text-on-surface">
                직무 역량 · 기술스택 매칭
              </h4>
              <span className="font-label-sm text-label-sm text-secondary tabular-nums">
                {specMatch.skillMatch.matchedSkills.length} / {specMatch.skillMatch.totalSkills}개 보유
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {specMatch.skillMatch.matchedSkills.map((sk) => (
                <span
                  key={`matched-${sk}`}
                  className="px-2.5 py-1 rounded-lg bg-tertiary-fixed text-on-tertiary-fixed font-label-sm text-label-sm font-semibold"
                >
                  ✓ {sk}
                </span>
              ))}
              {specMatch.skillMatch.missingSkills.map((sk) => (
                <span
                  key={`missing-${sk}`}
                  className="px-2.5 py-1 rounded-lg bg-surface-container-low text-on-surface-variant font-label-sm text-label-sm"
                >
                  {sk}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* 가산점 / 우대사항 항목별 적용 내역 (수동 토글 가능) */}
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h4 className="font-label-md text-label-md text-on-surface">
                {specMatch.bonusResults.some((b) => b.isPointBased)
                  ? '가산점 · 우대사항 내역'
                  : '우대사항 매칭 내역'}
              </h4>
              {specMatch.bonusResults.length > 0 && (
                <p className="font-label-sm text-label-sm text-on-surface-variant font-normal">
                  해당 여부나 중복 제한에 따라 항목을 눌러 직접 켜고 끌 수 있습니다
                </p>
              )}
            </div>
            {hasAnyBonusOverride && (
              <button
                type="button"
                onClick={onResetBonusOverrides}
                className="shrink-0 px-2 py-1 rounded-lg bg-surface-container text-on-surface-variant font-label-sm text-label-sm hover:text-on-surface"
              >
                자동 판정 복원
              </button>
            )}
          </div>
          {specMatch.bonusResults.length === 0 ? (
            <p className="text-body-sm text-outline">공고에 없음</p>
          ) : (
            <div className="space-y-1.5">
              {specMatch.bonusResults.map((bonus, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => onToggleBonusOverride(idx, !bonus.matched)}
                  className="w-full text-left flex items-start justify-between gap-2 p-2.5 rounded-lg bg-surface-container-low hover:bg-surface-container active:scale-[0.99] transition-all"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="font-body-md text-body-md text-on-surface font-semibold truncate">
                        {bonus.title}
                      </p>
                      {bonus.overridden && (
                        <span className="text-[11px] font-medium text-secondary shrink-0">
                          · 수동설정
                        </span>
                      )}
                    </div>
                    <p className="font-body-sm text-body-sm text-on-surface-variant mt-0.5">
                      {bonus.detail}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-full font-label-sm text-label-sm font-bold ${
                      bonus.matched
                        ? 'bg-secondary text-on-secondary'
                        : 'bg-surface-container-highest text-outline'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[14px]">
                      {bonus.matched ? 'check' : 'add'}
                    </span>
                    {bonus.isPointBased
                      ? bonus.matched
                        ? `+${bonus.points}점 적용`
                        : `제외 (+${bonus.points}점)`
                      : bonus.matched
                        ? '우대 해당'
                        : '보유 시 선택'}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 카드 5: 지원 진행 상태 & 개인 메모 */}
      <div className="brand-card rounded-2xl p-space-md space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="w-7 h-7 rounded-lg bg-surface-container flex items-center justify-center text-secondary">
              <span className="material-symbols-outlined text-[18px]">edit_calendar</span>
            </span>
            <div>
              <h3 className="font-headline-sm text-headline-sm text-on-surface leading-tight">
                지원 상태 · 메모
              </h3>
              <p className="font-label-sm text-label-sm text-on-surface-variant font-normal">
                진행 단계와 자소서·면접 포인트를 기록해 두세요
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {APPLICATION_STATUSES.map((status) => {
            const active = applicationStatus === status;
            return (
              <button
                key={status}
                type="button"
                onClick={() => onChangeApplicationStatus(status)}
                className={`px-3 py-1.5 rounded-lg font-label-sm text-label-sm transition-colors whitespace-nowrap shrink-0 ${
                  active
                    ? 'bg-secondary text-on-secondary shadow-sm'
                    : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container'
                }`}
              >
                {status}
              </button>
            );
          })}
        </div>

        <div>
          <textarea
            value={memo}
            onChange={(e) => onChangeMemo(e.target.value)}
            rows={3}
            placeholder="예: 자소서 문항 핵심 키워드, 필기 과목 범위, 근무지/연봉 메모..."
            className="w-full p-3 bg-surface-container-low rounded-xl text-on-surface font-body-sm text-body-sm placeholder:text-outline/70 focus:bg-surface-container-lowest focus:outline-none focus:ring-2 focus:ring-secondary/20 resize-y"
          />
        </div>
      </div>

      {/* Desktop Right-Rail Action Bar */}
      <div className="no-print hidden lg:flex items-center gap-2 pt-1">
        {isEditing ? (
          <>
            <button
              type="button"
              onClick={handleCancelEdit}
              className="h-12 px-5 rounded-xl bg-surface-container hover:bg-surface-container-high text-on-surface font-label-md text-label-md shrink-0 whitespace-nowrap transition-colors"
            >
              취소
            </button>
            <button
              type="button"
              onClick={handleSaveEdit}
              className="flex-1 h-12 rounded-xl bg-secondary hover:bg-on-secondary-fixed-variant text-on-secondary font-label-md text-label-md flex items-center justify-center gap-2 shadow-sm active:opacity-90 whitespace-nowrap transition-colors"
            >
              <span className="material-symbols-outlined text-[20px]">check</span>
              <span>수정 내용 저장하기</span>
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              aria-label="원문 보기"
              onClick={() => setShowOriginalModal(true)}
              className="h-12 w-12 rounded-xl bg-surface-container-lowest border border-[#e2e9f5] hover:bg-surface-container-low flex items-center justify-center text-on-surface shrink-0 transition-colors"
            >
              <span className="material-symbols-outlined text-[20px]">open_in_new</span>
            </button>
            <button
              type="button"
              aria-label="분석 결과 수정"
              onClick={handleStartEdit}
              className="h-12 px-4 rounded-xl bg-surface-container-lowest border border-[#e2e9f5] hover:bg-surface-container-low flex items-center justify-center gap-1.5 text-on-surface font-label-md text-label-md shrink-0 whitespace-nowrap transition-colors"
            >
              <span className="material-symbols-outlined text-[18px]">edit</span>
              <span>수정</span>
            </button>
            <button
              type="button"
              onClick={onToggleSave}
              className={`flex-1 h-12 rounded-xl font-label-md text-label-md flex items-center justify-center gap-2 shadow-sm transition-all whitespace-nowrap ${
                isSaved
                  ? 'bg-tertiary-fixed text-on-tertiary-fixed hover:bg-tertiary-fixed/80'
                  : 'bg-secondary text-on-secondary hover:bg-on-secondary-fixed-variant'
              }`}
            >
              <span
                className="material-symbols-outlined text-[20px]"
                style={isSaved ? { fontVariationSettings: "'FILL' 1" } : undefined}
              >
                {isSaved ? 'bookmark_added' : 'bookmark'}
              </span>
              <span>{isSaved ? '내 공고함에 저장됨' : '내 공고에 저장하기'}</span>
            </button>
          </>
        )}
      </div>
        </div>
      </div>

      {/* 하단 플로팅 액션 독 (Mobile) */}
      <div className="no-print lg:hidden fixed bottom-0 inset-x-0 z-40 bg-surface/95 backdrop-blur-md pt-2 pb-safe border-t border-[#e6edf7]">
        <div className="max-w-[480px] mx-auto px-gutter pb-3 flex items-center gap-2">
          {isEditing ? (
            <>
              <button
                type="button"
                onClick={handleCancelEdit}
                className="h-12 px-5 rounded-xl bg-surface-container text-on-surface font-label-md text-label-md active:bg-surface-container-high shrink-0 whitespace-nowrap"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleSaveEdit}
                className="flex-1 h-12 rounded-xl bg-secondary text-on-secondary font-label-md text-label-md flex items-center justify-center gap-2 shadow-sm active:opacity-90 whitespace-nowrap"
              >
                <span className="material-symbols-outlined text-[20px]">check</span>
                <span>수정 내용 저장하기</span>
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                aria-label="원문 보기"
                onClick={() => setShowOriginalModal(true)}
                className="h-12 w-12 rounded-xl bg-surface-container flex items-center justify-center text-on-surface active:bg-surface-container-high shrink-0"
              >
                <span className="material-symbols-outlined text-[20px]">open_in_new</span>
              </button>
              <button
                type="button"
                aria-label="분석 결과 수정"
                onClick={handleStartEdit}
                className="h-12 px-3.5 rounded-xl bg-surface-container flex items-center justify-center gap-1.5 text-on-surface font-label-md text-label-md active:bg-surface-container-high shrink-0 whitespace-nowrap"
              >
                <span className="material-symbols-outlined text-[18px]">edit</span>
                <span>수정</span>
              </button>
              <button
                id="save-btn"
                type="button"
                onClick={onToggleSave}
                className={`flex-1 h-12 rounded-xl font-label-md text-label-md flex items-center justify-center gap-2 shadow-sm transition-colors whitespace-nowrap ${
                  isSaved
                    ? 'bg-tertiary-fixed text-on-tertiary-fixed'
                    : 'bg-secondary text-on-secondary active:bg-on-secondary-fixed-variant'
                }`}
              >
                <span
                  className="material-symbols-outlined text-[20px]"
                  style={isSaved ? { fontVariationSettings: "'FILL' 1" } : undefined}
                >
                  {isSaved ? 'bookmark_added' : 'bookmark'}
                </span>
                <span>{isSaved ? '내 공고함에 저장됨' : '내 공고에 저장하기'}</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* 원문 보기 모달 */}
      {showOriginalModal && (
        <div
          className="fixed inset-0 z-50 bg-primary/35 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setShowOriginalModal(false)}
        >
          <div
            className="w-full max-w-[480px] sm:max-w-[540px] bg-surface-container-lowest rounded-t-3xl sm:rounded-3xl p-5 max-h-[75vh] flex flex-col shadow-2xl border border-[#e6edf7]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-surface-container-high">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-secondary text-[20px]">
                  article
                </span>
                <h3 className="font-headline-sm text-headline-sm text-on-surface">
                  입력한 공고 원문
                </h3>
              </div>
              <button
                type="button"
                aria-label="닫기"
                onClick={() => setShowOriginalModal(false)}
                className="w-9 h-9 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-container-high"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>
            <div className="overflow-y-auto whitespace-pre-wrap text-body-sm text-on-surface-variant leading-relaxed bg-surface-container-low rounded-xl p-3.5 space-y-2">
              {attachedFileName && (
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-secondary-fixed text-on-secondary-fixed font-label-sm text-label-sm">
                  <span className="material-symbols-outlined text-[15px]">attach_file</span>
                  <span>첨부 파일: {attachedFileName}</span>
                </div>
              )}
              <p>
                {originalText ||
                  (attachedFileName
                    ? `첨부한 파일(${attachedFileName})을 바탕으로 분석된 공고입니다.`
                    : '원문 내용이 없습니다.')}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 공식 자격증 명단 선택 모달 */}
      {showCertModal && (
        <div
          className="fixed inset-0 z-50 bg-primary/35 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setShowCertModal(false)}
        >
          <div
            className="w-full max-w-[480px] sm:max-w-[520px] bg-surface-container-lowest rounded-t-3xl sm:rounded-3xl p-5 max-h-[82vh] flex flex-col shadow-2xl border border-[#e6edf7]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 모달 헤더 */}
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-surface-container-high">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-secondary text-[20px]">
                  workspace_premium
                </span>
                <div>
                  <h3 className="font-headline-sm text-headline-sm text-on-surface leading-tight">
                    공식 자격증 명단 선택
                  </h3>
                  <p className="font-label-sm text-label-sm text-on-surface-variant font-normal">
                    국가기술·국가공인 자격증 목록에서 선택하세요
                  </p>
                </div>
              </div>
              <button
                type="button"
                aria-label="닫기"
                onClick={() => setShowCertModal(false)}
                className="w-9 h-9 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-container-high"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            {/* 검색창 */}
            <div className="relative mb-3">
              <span className="material-symbols-outlined text-outline text-[18px] absolute left-3 top-1/2 -translate-y-1/2">
                search
              </span>
              <input
                type="text"
                value={certSearchQuery}
                onChange={(e) => setCertSearchQuery(e.target.value)}
                placeholder="자격증 또는 발급기관 검색 (예: 전기기사, 한국사)"
                autoFocus
                className="w-full pl-9 pr-8 py-2.5 bg-surface-container-low rounded-xl text-on-surface font-body-md text-body-md placeholder:text-outline/70 focus:bg-surface-container-lowest focus:outline-none focus:ring-2 focus:ring-secondary/20"
              />
              {certSearchQuery && (
                <button
                  type="button"
                  aria-label="검색어 지우기"
                  onClick={() => setCertSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-outline hover:text-on-surface"
                >
                  <span className="material-symbols-outlined text-[16px]">cancel</span>
                </button>
              )}
            </div>

            {/* 카테고리 필터 칩 */}
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-3 mb-2 border-b border-surface-container-high">
              {CERT_CATEGORIES.map((category) => {
                const isActive = certCategory === category;
                return (
                  <button
                    key={category}
                    type="button"
                    onClick={() => setCertCategory(category)}
                    className={`shrink-0 px-3 py-1.5 rounded-full font-label-sm text-label-sm transition-colors ${
                      isActive
                        ? 'bg-secondary text-on-secondary'
                        : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container'
                    }`}
                  >
                    {category}
                  </button>
                );
              })}
            </div>

            {/* 자격증 리스트 */}
            <div className="flex-1 overflow-y-auto space-y-1.5 pr-0.5 min-h-[220px]">
              {filteredCertifications.length === 0 ? (
                <div className="py-10 text-center text-body-sm text-outline">
                  검색 결과와 일치하는 공식 자격증이 없습니다.
                </div>
              ) : (
                filteredCertifications.map((cert) => {
                  const langExam = LANGUAGE_EXAMS.find((e) => e.name === cert.name);
                  const existingLang = langExam
                    ? languageSpecs.find((item) => item.exam === cert.name)
                    : undefined;
                  const isSelected = langExam
                    ? Boolean(existingLang)
                    : certificates.includes(cert.name);
                  const isEditingLang = activeModalLangExam === cert.name;

                  return (
                    <div
                      key={cert.name}
                      className={`rounded-xl transition-colors ${
                        isSelected
                          ? 'bg-secondary-fixed/70 text-on-secondary-fixed'
                          : 'bg-surface-container-low text-on-surface'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => handleToggleCertificate(cert.name)}
                        className="w-full flex items-center justify-between gap-3 p-3 text-left rounded-xl hover:bg-black/[0.03]"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="font-body-md text-body-md font-semibold truncate">
                            {cert.name}
                          </p>
                          <p className="font-label-sm text-label-sm text-on-surface-variant font-normal truncate mt-0.5">
                            {cert.issuer} · {cert.category}
                          </p>
                        </div>
                        <span
                          className={`shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-full font-label-sm text-label-sm ${
                            isSelected
                              ? 'bg-secondary text-on-secondary'
                              : 'bg-surface-container-highest text-on-surface-variant'
                          }`}
                        >
                          <span className="material-symbols-outlined text-[14px]">
                            {isSelected ? 'check' : langExam ? 'edit' : 'add'}
                          </span>
                          {existingLang
                            ? existingLang.value
                            : isSelected
                              ? '선택됨'
                              : langExam
                                ? '점수/등급'
                                : '선택'}
                        </span>
                      </button>

                      {langExam && isEditingLang && (
                        <div className="px-3 pb-3 pt-1 space-y-2 border-t border-black/5">
                          {langExam.mode === 'score' ? (
                            <div className="flex gap-2">
                              <div className="relative flex-1">
                                <input
                                  type="number"
                                  min={0}
                                  max={langExam.maxScore}
                                  value={modalLangScore}
                                  onChange={(e) => setModalLangScore(e.target.value)}
                                  placeholder={langExam.placeholder ?? '점수 입력'}
                                  autoFocus
                                  className="w-full pl-3 pr-8 py-2 bg-surface-container-lowest rounded-lg text-on-surface font-body-md text-body-md focus:outline-none focus:ring-2 focus:ring-secondary/20"
                                />
                                <span className="absolute right-3 top-1/2 -translate-y-1/2 font-label-sm text-label-sm text-on-surface-variant">
                                  {langExam.unit ?? '점'}
                                </span>
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  const raw = modalLangScore.trim();
                                  if (!raw) return;
                                  const num = Number(raw);
                                  const maxScore = langExam.maxScore ?? 9999;
                                  if (!Number.isFinite(num) || num < 0 || num > maxScore) {
                                    showTempFeedback(
                                      `${langExam.name} 점수는 0~${maxScore}${langExam.unit ?? '점'} 사이로 입력해 주세요`
                                    );
                                    return;
                                  }
                                  upsertLanguageSpec(
                                    langExam.name,
                                    `${Math.round(num)}${langExam.unit ?? '점'}`
                                  );
                                  setActiveModalLangExam(null);
                                }}
                                className="px-3.5 py-2 rounded-lg bg-secondary text-on-secondary font-label-md text-label-md shrink-0"
                              >
                                반영
                              </button>
                            </div>
                          ) : (
                            <div className="space-y-2">
                              <div className="flex flex-wrap gap-1.5">
                                {(langExam.grades ?? []).map((grade) => {
                                  const active = modalLangGrade === grade;
                                  return (
                                    <button
                                      key={grade}
                                      type="button"
                                      onClick={() => setModalLangGrade(grade)}
                                      className={`px-2.5 py-1 rounded-lg font-label-sm text-label-sm transition-colors ${
                                        active
                                          ? 'bg-secondary text-on-secondary'
                                          : 'bg-surface-container-lowest text-on-surface hover:bg-surface-container'
                                      }`}
                                    >
                                      {grade}
                                    </button>
                                  );
                                })}
                              </div>
                              <div className="flex justify-end gap-2">
                                {existingLang && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      handleRemoveLanguageSpec(langExam.name);
                                      setActiveModalLangExam(null);
                                    }}
                                    className="px-3 py-1.5 rounded-lg bg-surface-container-high text-on-surface-variant font-label-sm text-label-sm"
                                  >
                                    삭제
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => {
                                    upsertLanguageSpec(langExam.name, modalLangGrade);
                                    setActiveModalLangExam(null);
                                  }}
                                  className="px-3.5 py-1.5 rounded-lg bg-secondary text-on-secondary font-label-sm text-label-sm"
                                >
                                  {modalLangGrade} 반영
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* 하단 완료 버튼 */}
            <div className="pt-3 mt-3 border-t border-surface-container-high">
              <button
                type="button"
                onClick={() => setShowCertModal(false)}
                className="w-full h-11 rounded-xl bg-primary text-on-primary font-label-md text-label-md flex items-center justify-center gap-1.5 active:opacity-90"
              >
                <span>
                  선택 완료 (자격증 {certificates.length}개 · 어학 {languageSpecs.length}개)
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 다른 공고 자소서 초안 참고 모달 */}
      {reuseEssayTargetIdx !== null && (
        <div
          className="no-print fixed inset-0 z-50 bg-primary/35 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setReuseEssayTargetIdx(null)}
        >
          <div
            className="w-full max-w-[480px] sm:max-w-[540px] bg-surface-container-lowest rounded-t-3xl sm:rounded-3xl p-5 max-h-[82vh] flex flex-col shadow-2xl border border-[#e6edf7]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-surface-container-high">
              <div className="flex items-center gap-2 min-w-0">
                <span className="material-symbols-outlined text-secondary text-[20px]">
                  library_books
                </span>
                <div className="min-w-0">
                  <h3 className="font-headline-sm text-headline-sm text-on-surface leading-tight truncate">
                    다른 공고 자소서 초안 불러오기
                  </h3>
                  <p className="font-label-sm text-label-sm text-on-surface-variant font-normal truncate">
                    문항 {reuseEssayTargetIdx + 1}번 초안에 이어 붙이거나 덮어쓸 수 있어요
                  </p>
                </div>
              </div>
              <button
                type="button"
                aria-label="닫기"
                onClick={() => setReuseEssayTargetIdx(null)}
                className="w-9 h-9 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-container-high shrink-0"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            <div className="relative mb-3">
              <span className="material-symbols-outlined text-outline text-[18px] absolute left-3 top-1/2 -translate-y-1/2">
                search
              </span>
              <input
                type="text"
                value={reuseSearchQuery}
                onChange={(e) => setReuseSearchQuery(e.target.value)}
                placeholder="기관명, 문항, 초안 키워드 검색"
                autoFocus
                className="w-full pl-9 pr-3 py-2.5 bg-surface-container-low rounded-xl text-on-surface font-body-sm text-body-sm placeholder:text-outline/70 focus:bg-surface-container-lowest focus:outline-none focus:ring-2 focus:ring-secondary/20"
              />
            </div>

            <div className="flex-1 overflow-y-auto space-y-2.5 pr-0.5 min-h-[200px]">
              {filteredReusableEssays.length === 0 ? (
                <div className="py-10 text-center text-body-sm text-outline">
                  일치하는 자소서 초안이 없습니다.
                </div>
              ) : (
                filteredReusableEssays.map((refItem, refIdx) => (
                  <div
                    key={`${refItem.announcementId}-${refIdx}`}
                    className="p-3 rounded-xl bg-surface-container-low space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-label-md text-label-md text-primary truncate">
                        {refItem.organization}
                        {refItem.position ? ` · ${refItem.position}` : ''}
                      </span>
                      <span className="font-label-sm text-label-sm text-secondary tabular-nums shrink-0">
                        {refItem.draft.length}자
                      </span>
                    </div>
                    <p className="font-label-sm text-label-sm text-on-surface-variant leading-snug">
                      {refItem.question}
                    </p>
                    <p className="font-body-sm text-body-sm text-on-surface bg-surface-container-lowest rounded-lg p-2.5 whitespace-pre-wrap line-clamp-4 leading-relaxed">
                      {refItem.draft}
                    </p>
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() =>
                          handleCopyText(refItem.draft, '참고 초안이 복사되었습니다')
                        }
                        className="px-2.5 py-1 rounded-lg bg-surface-container-lowest text-on-surface-variant hover:text-secondary font-label-sm text-label-sm"
                      >
                        복사
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const targetIdx = reuseEssayTargetIdx;
                          const prev = essayDrafts[targetIdx] ?? '';
                          const combined = prev.trim()
                            ? `${prev.trimEnd()}\n\n${refItem.draft}`
                            : refItem.draft;
                          onChangeEssayDraft(targetIdx, combined);
                          setReuseEssayTargetIdx(null);
                          showTempEditToast(
                            `문항 ${targetIdx + 1}번에 초안을 이어 붙였습니다`
                          );
                        }}
                        className="px-2.5 py-1 rounded-lg bg-secondary-fixed text-on-secondary-fixed hover:bg-secondary-fixed-dim/55 font-label-sm text-label-sm"
                      >
                        이어 붙이기
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const targetIdx = reuseEssayTargetIdx;
                          onChangeEssayDraft(targetIdx, refItem.draft);
                          setReuseEssayTargetIdx(null);
                          showTempEditToast(
                            `문항 ${targetIdx + 1}번 초안에 적용했습니다`
                          );
                        }}
                        className="px-2.5 py-1 rounded-lg bg-secondary text-on-secondary font-label-sm text-label-sm"
                      >
                        덮어쓰기
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
