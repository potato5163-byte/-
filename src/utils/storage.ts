import type { SavedAnnouncement, SpecRecommendationResponse } from '../types';
import type {
  EducationLevel,
  LanguageSpec,
  UserProfileMeta,
} from './specMatching';

const SAVED_ANNOUNCEMENTS_KEY = 'gonggo_saved_announcements_v1';
const SPEC_CERTIFICATES_KEY = 'gonggo_spec_certificates_v1';
const SPEC_LANGUAGES_KEY = 'gonggo_spec_languages_v1';
const SPEC_SKILLS_KEY = 'gonggo_spec_skills_v1';
const SPEC_PROFILE_META_KEY = 'gonggo_spec_profile_v1';
const SPEC_RECOMMENDATIONS_KEY = 'gonggo_spec_recommendations_v1';

export const DEFAULT_CERTIFICATES = ['전기기사', '컴퓨터활용능력 2급'];
export const DEFAULT_LANGUAGE_SPECS: LanguageSpec[] = [
  { exam: 'TOEIC', value: '785점' },
];
export const DEFAULT_SKILLS = ['Python', 'SQL'];
export const DEFAULT_PROFILE_META: UserProfileMeta = {
  education: '학사',
  careerYears: 0,
};

function addDaysYyyyMmDd(daysToAdd: number): string {
  const now = new Date();
  const target = new Date(now.getFullYear(), now.getMonth(), now.getDate() + daysToAdd);
  const y = target.getFullYear();
  const m = String(target.getMonth() + 1).padStart(2, '0');
  const d = String(target.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function createInitialSavedAnnouncements(): SavedAnnouncement[] {
  const nowIso = new Date().toISOString();
  const kpxDeadline = addDaysYyyyMmDd(7);
  const kpxWritten = addDaysYyyyMmDd(21);
  const khnpDeadline = addDaysYyyyMmDd(12);
  const khnpWritten = addDaysYyyyMmDd(26);
  const exDeadline = addDaysYyyyMmDd(18);
  const exInterview = addDaysYyyyMmDd(32);

  return [
    {
      id: 'sample-kpx',
      categoryTag: '공기업 · 정규직',
      selectedForCompare: true,
      applicationStatus: '지원 예정',
      memo: 'NCS 직업기초능력 + 전기 전공 40문항 대비 필요. 어학성적표 미리 PDF 발급하기.',
      bonusOverrides: {},
      savedAt: nowIso,
      updatedAt: nowIso,
      attachedFileName: null,
      checkedDocs: { 0: true, 1: true, 2: false },
      originalText: `[한국전력거래소] 2026년도 하반기 일반정규직(전기 직렬) 신입직원 채용공고
1. 모집분야: 전기 직렬 (일반정규직)
2. 전형절차: 서류전형 → 필기전형(NCS/전공) → 1차·2차 면접 → 최종합격
3. 전형일정:
- 서류 접수 마감: ${kpxDeadline} 18:00까지 (온라인 채용홈페이지)
- 필기전형: ${kpxWritten} 10:00 (서울/나주)
4. 지원자격:
- 학력 및 연령: 제한 없음 (블라인드 채용)
- 어학성적: TOEIC 700점 이상 또는 TOEIC Speaking IM2 이상 또는 OPIc IM2 이상
5. 우대사항(가산점):
- 전기기사 자격증 소지자: 필기전형 5점 가산
- 한국사능력검정시험 2급 이상: 필기전형 2점 가산
6. 제출서류:
- 입사지원서 및 자기소개서 (온라인 작성)
- 공인어학성적 증명서 사본
- 자격증 사본 (해당자)`,
      analysis: {
        company_type: '공기업',
        organization: '한국전력거래소',
        position: '전기 직렬 (일반정규직)',
        employment_type: '일반정규직',
        experience_level: '신입 (학력·연령 무관)',
        location: '전남 나주 / 서울',
        headcount: '14명',
        compensation: '공기업 내규 (초임 약 4,300만원대)',
        deadline_type: 'fixed',
        tech_skills: ['전력계통', '전기설비'],
        keywords: ['전력계통 안정성', '설비 점검 역량', '현장 문제해결', '공공 책임감'],
        interview_questions: [
          '전력거래소 전기 직렬에 지원한 동기와 입사 후 기여하고 싶은 분야를 말씀해 주세요.',
          '전공 프로젝트나 실습 중 설비·계통 문제를 분석해 해결한 경험이 있나요?',
          '협업 과정에서 의견 충돌이 발생했을 때 어떻게 조율했는지 구체적으로 설명해 주세요.',
        ],
        stages: ['서류전형', '필기전형', '1차·2차 면접', '최종합격'],
        essay_questions: [
          {
            question: '지원 분야의 직무 수행을 위해 본인이 갖추고 있는 핵심 역량과 경험을 기술하시오.',
            max_chars: '700자 이내',
          },
          {
            question: '조직 내 협업 과정에서 갈등을 해결하고 성과를 달성한 경험을 구체적으로 기술하시오.',
            max_chars: '700자 이내',
          },
        ],
        schedule: [
          {
            step: '서류 접수 마감',
            date: kpxDeadline,
            time: '18:00',
            source: `서류 접수 마감: ${kpxDeadline} 18:00까지 (온라인 채용홈페이지)`,
          },
          {
            step: '필기전형',
            date: kpxWritten,
            time: '10:00',
            source: `필기전형: ${kpxWritten} 10:00 (서울/나주)`,
          },
        ],
        eligibility: [
          {
            item: '학력 및 연령',
            condition: '제한 없음 (블라인드 채용)',
            source: '학력 및 연령: 제한 없음 (블라인드 채용)',
          },
          {
            item: '공인어학성적',
            condition: 'TOEIC 700점 이상 또는 TOEIC Speaking IM2 이상 또는 OPIc IM2 이상',
            source: '어학성적: TOEIC 700점 이상 또는 TOEIC Speaking IM2 이상 또는 OPIc IM2 이상',
          },
        ],
        bonus_points: [
          {
            item: '전기기사',
            points: 5,
            source: '전기기사 자격증 소지자: 필기전형 5점 가산',
          },
          {
            item: '한국사능력검정시험 2급 이상',
            points: 2,
            source: '한국사능력검정시험 2급 이상: 필기전형 2점 가산',
          },
        ],
        documents: [
          '입사지원서 및 자기소개서',
          '공인어학성적 증명서 사본',
          '자격증 사본 (해당자)',
        ],
      },
    },
    {
      id: 'sample-khnp',
      categoryTag: '공기업 · 대졸신입',
      selectedForCompare: true,
      applicationStatus: '지원 완료',
      memo: '지원서 제출 완료. 필기 시험장 서울 배정 신청.',
      bonusOverrides: {},
      savedAt: nowIso,
      updatedAt: nowIso,
      attachedFileName: null,
      checkedDocs: { 0: true, 1: false, 2: false },
      originalText: `[한국수력원자력] 대졸수준 신입사원(원자력/전기) 선발공고
1. 모집분야: 원자력/전기
2. 전형절차: 서류전형 → 필기시험 → 면접전형 → 신체검사
3. 일정안내:
- 지원서 접수 마감: ${khnpDeadline} 15:00
- 필기시험: ${khnpWritten} 09:30
4. 지원자격:
- 어학기준: TOEIC 750점 이상 또는 TEPS 300점 이상 또는 OPIc IM3 이상
- 학력·연령: 제한 없음
5. 가산점 기준:
- 전기기사 자격 보유자: 5점 가산
- 컴퓨터활용능력 1급: 2점 가산
6. 제출서류:
- 지원서 및 자기소개서
- 어학성적표
- 자격증 취득확인서`,
      analysis: {
        company_type: '공기업',
        organization: '한국수력원자력',
        position: '원자력/전기',
        employment_type: '대졸수준 정규직',
        experience_level: '신입',
        location: '경북 경주 및 사업소',
        headcount: '25명',
        deadline_type: 'fixed',
        keywords: ['발전설비 이해', '안전수칙 준수', '에너지 전환', '직무 전문성'],
        interview_questions: [
          '한국수력원자력이 추구하는 에너지 안전과 관련해 본인이 가진 강점은 무엇인가요?',
          '전기·원자력 전공 지식 중 실무에 가장 자신 있는 영역을 설명해 보세요.',
        ],
        stages: ['서류전형', '필기시험', '면접전형', '신체검사'],
        essay_questions: [
          {
            question: '한국수력원자력에 지원한 동기와 입사 후 직무 수행 계획을 기술하시오.',
            max_chars: '800자 이내',
          },
        ],
        schedule: [
          {
            step: '지원서 접수 마감',
            date: khnpDeadline,
            time: '15:00',
            source: `지원서 접수 마감: ${khnpDeadline} 15:00`,
          },
          {
            step: '필기시험',
            date: khnpWritten,
            time: '09:30',
            source: `필기시험: ${khnpWritten} 09:30`,
          },
        ],
        eligibility: [
          {
            item: '학력·연령',
            condition: '제한 없음',
            source: '학력·연령: 제한 없음',
          },
          {
            item: '어학성적',
            condition: 'TOEIC 750점 이상 또는 TEPS 300점 이상 또는 OPIc IM3 이상',
            source: '어학기준: TOEIC 750점 이상 또는 TEPS 300점 이상 또는 OPIc IM3 이상',
          },
        ],
        bonus_points: [
          {
            item: '전기기사',
            points: 5,
            source: '전기기사 자격 보유자: 5점 가산',
          },
          {
            item: '컴퓨터활용능력 1급',
            points: 2,
            source: '컴퓨터활용능력 1급: 2점 가산',
          },
        ],
        documents: ['지원서 및 자기소개서', '어학성적표', '자격증 취득확인서'],
      },
    },
    {
      id: 'sample-ex',
      categoryTag: '준정부기관 · 인턴연계',
      selectedForCompare: false,
      applicationStatus: '지원 예정',
      memo: '경험기술서 작성 시 인턴 프로젝트 위주로 정리하기.',
      bonusOverrides: {},
      savedAt: nowIso,
      updatedAt: nowIso,
      attachedFileName: null,
      checkedDocs: { 0: false, 1: false, 2: false, 3: false },
      originalText: `[한국도로공사] 신입(채용형 인턴) 전기직 채용공고
1. 모집분야: 전기직 (신입)
2. 전형단계: 서류 → 필기 → 면접 → 인턴근무 → 정규임용
3. 주요일정:
- 서류 접수 마감: ${exDeadline} 18:00
- 면접전형 예정: ${exInterview} 10:00
4. 지원자격:
- 전기기사 자격증 소지자 또는 TOEIC 700점 이상
- 학력 무관
5. 우대가점:
- 전기기사 소지자: 3점 가산
6. 제출서류:
- 입사지원서
- 전기기사 자격증 사본
- 공인어학성적 증명서
- 경력/경험기술서`,
      analysis: {
        company_type: '공기업',
        organization: '한국도로공사',
        position: '전기직 (신입)',
        employment_type: '채용형 인턴',
        experience_level: '신입',
        location: '전국 (본사 김천)',
        headcount: '12명',
        deadline_type: 'fixed',
        keywords: ['인프라 유지관리', '현장 대응력', '유관 경험', '성실한 협업'],
        interview_questions: [
          '인턴 또는 팀 프로젝트에서 직접 성과를 냈던 경험을 소개해 주세요.',
          '전국 사업소 순환 근무 및 현장 업무에 대해 본인은 어떻게 준비되어 있나요?',
        ],
        stages: ['서류전형', '필기전형', '면접전형', '정규임용'],
        essay_questions: null,
        schedule: [
          {
            step: '서류 접수 마감',
            date: exDeadline,
            time: '18:00',
            source: `서류 접수 마감: ${exDeadline} 18:00`,
          },
          {
            step: '면접전형 예정',
            date: exInterview,
            time: '10:00',
            source: `면접전형 예정: ${exInterview} 10:00`,
          },
        ],
        eligibility: [
          {
            item: '학력',
            condition: '학력 무관',
            source: '학력 무관',
          },
          {
            item: '자격 및 어학',
            condition: '전기기사 자격증 소지자 또는 TOEIC 700점 이상',
            source: '전기기사 자격증 소지자 또는 TOEIC 700점 이상',
          },
        ],
        bonus_points: [
          {
            item: '전기기사',
            points: 3,
            source: '전기기사 소지자: 3점 가산',
          },
        ],
        documents: [
          '입사지원서',
          '전기기사 자격증 사본',
          '공인어학성적 증명서',
          '경력/경험기술서',
        ],
      },
    },
    {
      id: 'sample-navercloud',
      categoryTag: '사기업 · IT/플랫폼',
      selectedForCompare: false,
      applicationStatus: '지원 예정',
      memo: 'SQL·Python 활용 경험 및 데이터 파이프라인 프로젝트 포트폴리오 정리하기.',
      essayDrafts: {},
      bonusOverrides: {},
      savedAt: nowIso,
      updatedAt: nowIso,
      attachedFileName: null,
      checkedDocs: { 0: true, 1: false },
      originalText: `[네이버클라우드] 데이터 엔지니어 (신입/주니어) 수시채용
1. 모집직무: 데이터 엔지니어 (정규직 / 수습 3개월)
2. 경력요건: 신입 또는 유관 경력 1년 이상 (학력·전공 무관)
3. 근무지 및 처우: 경기 성남 분당(1784) · 연봉 5,200만원 이상 · 선택적 근로시간제 · 식대 및 복지포인트 지원
4. 접수기간: 채용 시 마감 (수시 서류 검토)
5. 전형절차: 서류전형 → 온라인 코딩테스트 → 1차 기술면접 → 2차 컬처핏 면접 → 최종합격
6. 자격요건:
 - Python 및 SQL 기반 데이터 처리 경험자
 - 대용량 데이터 모델링 및 ETL 기초 이해
7. 우대사항:
 - AWS 또는 GCP 클라우드 환경 구축 경험
 - Airflow / Spark 활용 프로젝트 경험자
8. 제출서류:
 - 자유양식 이력서 및 경력기술서 (PDF)
 - GitHub 링크 또는 기술 포트폴리오`,
      analysis: {
        company_type: '사기업',
        organization: '네이버클라우드',
        position: '데이터 엔지니어 (신입/주니어)',
        employment_type: '정규직 (수습 3개월)',
        experience_level: '신입 · 경력 1년 이상',
        location: '경기 성남 분당',
        headcount: '0명',
        compensation: '연봉 5,200만원~ · 선택적 근로시간제 · 식대 지원',
        deadline_type: 'until_hired',
        tech_skills: ['Python', 'SQL', 'AWS', 'Airflow', 'Spark'],
        keywords: ['대용량 데이터 파이프라인', 'ETL 최적화', '클라우드 아키텍처', '문제 원인 분석'],
        interview_questions: [
          '대용량 데이터를 처리하면서 쿼리 성능이나 파이프라인 병목을 개선해 본 경험이 있나요?',
          'Python과 SQL을 활용해 데이터 정합성 검증이나 자동화를 구현한 사례를 설명해 주세요.',
          '클라우드 환경(AWS/GCP)에서 장애나 비용 이슈를 다룰 때 우선순위를 어떻게 정하나요?',
        ],
        stages: ['서류전형', '코딩테스트', '1차 기술면접', '2차 임원면접', '최종합격'],
        essay_questions: [
          {
            question: '본인이 진행한 데이터/개발 프로젝트 중 가장 기술적으로 어려웠던 문제와 해결 과정을 기술해 주세요.',
            max_chars: '1,000자 이내',
          },
        ],
        schedule: [
          {
            step: '서류 접수 (채용 시 마감)',
            date: null,
            time: null,
            source: '접수기간: 채용 시 마감 (수시 서류 검토)',
          },
        ],
        eligibility: [
          {
            item: '학력·전공',
            condition: '학력·전공 무관',
            source: '신입 또는 유관 경력 1년 이상 (학력·전공 무관)',
          },
          {
            item: '필수 기술 역량',
            condition: 'Python 및 SQL 기반 데이터 처리 경험자',
            source: 'Python 및 SQL 기반 데이터 처리 경험자',
          },
        ],
        bonus_points: [
          {
            item: 'AWS 또는 GCP 클라우드 환경 구축 경험',
            points: null,
            source: 'AWS 또는 GCP 클라우드 환경 구축 경험',
          },
          {
            item: 'Airflow / Spark 활용 프로젝트 경험자',
            points: null,
            source: 'Airflow / Spark 활용 프로젝트 경험자',
          },
        ],
        documents: [
          '자유양식 이력서 및 경력기술서 (PDF)',
          'GitHub 링크 또는 기술 포트폴리오',
        ],
      },
    },
  ];
}

export function loadSavedAnnouncements(): SavedAnnouncement[] {
  try {
    const raw = window.localStorage.getItem(SAVED_ANNOUNCEMENTS_KEY);
    if (!raw) {
      const initial = createInitialSavedAnnouncements();
      persistSavedAnnouncements(initial);
      return initial;
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return (parsed as Partial<SavedAnnouncement>[])
        .filter((item): item is Partial<SavedAnnouncement> & { analysis: SavedAnnouncement['analysis'] } =>
          Boolean(item && typeof item === 'object' && item.analysis)
        )
        .map((item) => ({
          id: item.id || `ann-${Date.now()}`,
          analysis: item.analysis,
          originalText: item.originalText ?? '',
          attachedFileName: item.attachedFileName ?? null,
          sourceUrl: typeof item.sourceUrl === 'string' ? item.sourceUrl : null,
          isPinned: Boolean(item.isPinned),
          checkedDocs: item.checkedDocs ?? {},
          categoryTag: item.categoryTag || '공기업 · 저장 공고',
          selectedForCompare: Boolean(item.selectedForCompare),
          applicationStatus: item.applicationStatus || '지원 예정',
          memo: typeof item.memo === 'string' ? item.memo : '',
          essayDrafts: item.essayDrafts ?? {},
          interviewNotes: item.interviewNotes ?? {},
          bonusOverrides: item.bonusOverrides ?? {},
          savedAt: item.savedAt || new Date().toISOString(),
          updatedAt: item.updatedAt || new Date().toISOString(),
        }));
    }
  } catch {
    // ignore storage errors
  }
  return createInitialSavedAnnouncements();
}

export function persistSavedAnnouncements(items: SavedAnnouncement[]): void {
  try {
    window.localStorage.setItem(SAVED_ANNOUNCEMENTS_KEY, JSON.stringify(items));
  } catch {
    // ignore storage errors
  }
}

export function loadSpecCertificates(): string[] {
  try {
    const raw = window.localStorage.getItem(SPEC_CERTIFICATES_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.filter((x): x is string => typeof x === 'string');
      }
    }
  } catch {
    // ignore
  }
  return DEFAULT_CERTIFICATES;
}

export function persistSpecCertificates(certs: string[]): void {
  try {
    window.localStorage.setItem(SPEC_CERTIFICATES_KEY, JSON.stringify(certs));
  } catch {
    // ignore
  }
}

export function loadSpecLanguages(): LanguageSpec[] {
  try {
    const raw = window.localStorage.getItem(SPEC_LANGUAGES_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.filter(
          (x): x is LanguageSpec =>
            Boolean(x && typeof x.exam === 'string' && typeof x.value === 'string')
        );
      }
    }
  } catch {
    // ignore
  }
  return DEFAULT_LANGUAGE_SPECS;
}

export function persistSpecLanguages(specs: LanguageSpec[]): void {
  try {
    window.localStorage.setItem(SPEC_LANGUAGES_KEY, JSON.stringify(specs));
  } catch {
    // ignore
  }
}

export function loadSpecSkills(): string[] {
  try {
    const raw = window.localStorage.getItem(SPEC_SKILLS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.filter((x): x is string => typeof x === 'string' && x.trim().length > 0);
      }
    }
  } catch {
    // ignore
  }
  return DEFAULT_SKILLS;
}

export function persistSpecSkills(skills: string[]): void {
  try {
    window.localStorage.setItem(SPEC_SKILLS_KEY, JSON.stringify(skills));
  } catch {
    // ignore
  }
}

export function loadSpecProfileMeta(): UserProfileMeta {
  try {
    const raw = window.localStorage.getItem(SPEC_PROFILE_META_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<UserProfileMeta>;
      if (parsed && typeof parsed === 'object') {
        const validEdu: EducationLevel[] = ['고졸', '전문학사', '학사', '석사', '박사'];
        const education =
          typeof parsed.education === 'string' &&
          validEdu.includes(parsed.education as EducationLevel)
            ? (parsed.education as EducationLevel)
            : '';
        const careerYears =
          typeof parsed.careerYears === 'number' &&
          Number.isFinite(parsed.careerYears) &&
          parsed.careerYears >= 0
            ? Math.min(40, Math.round(parsed.careerYears))
            : null;
        return { education, careerYears };
      }
    }
  } catch {
    // ignore
  }
  return DEFAULT_PROFILE_META;
}

export function persistSpecProfileMeta(meta: UserProfileMeta): void {
  try {
    window.localStorage.setItem(SPEC_PROFILE_META_KEY, JSON.stringify(meta));
  } catch {
    // ignore
  }
}

export interface GonggoBackupPayload {
  version: number;
  exportedAt: string;
  savedAnnouncements: SavedAnnouncement[];
  certificates: string[];
  languageSpecs: LanguageSpec[];
  skills?: string[];
  profileMeta?: UserProfileMeta;
}

export function exportBackupFile(
  savedAnnouncements: SavedAnnouncement[],
  certificates: string[],
  languageSpecs: LanguageSpec[],
  skills: string[] = [],
  profileMeta: UserProfileMeta = DEFAULT_PROFILE_META
): void {
  const payload: GonggoBackupPayload = {
    version: 2,
    exportedAt: new Date().toISOString(),
    savedAnnouncements,
    certificates,
    languageSpecs,
    skills,
    profileMeta,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const dateTag = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `공고정리_백업_${dateTag}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function parseBackupFileContent(rawText: string): GonggoBackupPayload | null {
  try {
    const parsed = JSON.parse(rawText) as Partial<GonggoBackupPayload>;
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.savedAnnouncements)) {
      return null;
    }

    const normalizedAnnouncements: SavedAnnouncement[] = parsed.savedAnnouncements
      .filter((item) => item && typeof item === 'object' && item.analysis)
      .map((item) => ({
        id: item.id || `ann-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        analysis: item.analysis,
        originalText: typeof item.originalText === 'string' ? item.originalText : '',
        attachedFileName: item.attachedFileName ?? null,
        sourceUrl: typeof item.sourceUrl === 'string' ? item.sourceUrl : null,
        isPinned: Boolean(item.isPinned),
        checkedDocs: item.checkedDocs ?? {},
        categoryTag: item.categoryTag || '공고 · 저장 공고',
        selectedForCompare: Boolean(item.selectedForCompare),
        applicationStatus: item.applicationStatus || '지원 예정',
        memo: typeof item.memo === 'string' ? item.memo : '',
        essayDrafts: item.essayDrafts ?? {},
        interviewNotes: item.interviewNotes ?? {},
        bonusOverrides: item.bonusOverrides ?? {},
        savedAt: item.savedAt || new Date().toISOString(),
        updatedAt: item.updatedAt || new Date().toISOString(),
      }));

    const validEdu: EducationLevel[] = ['고졸', '전문학사', '학사', '석사', '박사'];
    const rawMeta = parsed.profileMeta;
    const normalizedMeta: UserProfileMeta | undefined =
      rawMeta && typeof rawMeta === 'object'
        ? {
            education:
              typeof rawMeta.education === 'string' &&
              validEdu.includes(rawMeta.education as EducationLevel)
                ? (rawMeta.education as EducationLevel)
                : '',
            careerYears:
              typeof rawMeta.careerYears === 'number' &&
              Number.isFinite(rawMeta.careerYears) &&
              rawMeta.careerYears >= 0
                ? Math.min(40, Math.round(rawMeta.careerYears))
                : null,
          }
        : undefined;

    return {
      version: parsed.version ?? 1,
      exportedAt: parsed.exportedAt ?? new Date().toISOString(),
      savedAnnouncements: normalizedAnnouncements,
      certificates: Array.isArray(parsed.certificates)
        ? parsed.certificates.filter((c): c is string => typeof c === 'string')
        : DEFAULT_CERTIFICATES,
      languageSpecs: Array.isArray(parsed.languageSpecs)
        ? parsed.languageSpecs
            .filter(
              (s): s is LanguageSpec =>
                Boolean(s && typeof s.exam === 'string' && typeof s.value === 'string')
            )
            .map((s) => ({
              exam: s.exam,
              value: s.value,
              ...(typeof s.acquiredDate === 'string' && s.acquiredDate
                ? { acquiredDate: s.acquiredDate }
                : {}),
            }))
        : DEFAULT_LANGUAGE_SPECS,
      skills: Array.isArray(parsed.skills)
        ? parsed.skills.filter((s): s is string => typeof s === 'string')
        : DEFAULT_SKILLS,
      profileMeta: normalizedMeta,
    };
  } catch {
    return null;
  }
}

function escapeCsvCell(value: string): string {
  const normalized = value.replace(/\r?\n/g, ' ');
  const neutralized = /^[=+\-@\t\r]/.test(normalized)
    ? `'${normalized}`
    : normalized;
  const safe = neutralized.replace(/"/g, '""');
  return `"${safe}"`;
}

export function exportAnnouncementsCsv(
  rows: Array<{
    item: SavedAnnouncement;
    ddayLabel: string;
    deadlineText: string;
    specStatusLabel: string;
    bonusText: string;
    progressText: string;
  }>
): void {
  const headers = [
    '기관명/회사명',
    '기업구분',
    '직무/직렬',
    '고용형태',
    '경력요건',
    '근무지',
    '연봉/처우',
    '지원상태',
    '서류마감일',
    'D-Day',
    '스펙판정',
    '가산점/우대',
    '서류준비율',
    '공고링크',
    '메모',
  ];

  const csvLines = [headers.map(escapeCsvCell).join(',')];

  for (const row of rows) {
    const a = row.item.analysis;
    const cells = [
      a.organization ?? '',
      a.company_type ?? '',
      a.position ?? '',
      a.employment_type ?? '',
      a.experience_level ?? '',
      a.location ?? '',
      a.compensation ?? '',
      row.item.applicationStatus,
      row.deadlineText,
      row.ddayLabel,
      row.specStatusLabel,
      row.bonusText,
      row.progressText,
      row.item.sourceUrl ?? '',
      row.item.memo ?? '',
    ];
    csvLines.push(cells.map((c) => escapeCsvCell(String(c))).join(','));
  }

  const csvContent = `\uFEFF${csvLines.join('\r\n')}`;
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const dateTag = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `공고정리_지원현황_${dateTag}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function loadSpecRecommendationCache(): SpecRecommendationResponse | null {
  try {
    const raw = localStorage.getItem(SPEC_RECOMMENDATIONS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SpecRecommendationResponse>;
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.recommendations)) {
      return null;
    }
    return {
      overall_advice: typeof parsed.overall_advice === 'string' ? parsed.overall_advice : '',
      recommendations: parsed.recommendations,
      generatedAt: typeof parsed.generatedAt === 'string' ? parsed.generatedAt : undefined,
    };
  } catch {
    return null;
  }
}

export function persistSpecRecommendationCache(
  data: SpecRecommendationResponse | null
): void {
  try {
    if (!data) {
      localStorage.removeItem(SPEC_RECOMMENDATIONS_KEY);
      return;
    }
    localStorage.setItem(SPEC_RECOMMENDATIONS_KEY, JSON.stringify(data));
  } catch {
    // Ignore storage quota errors
  }
}


