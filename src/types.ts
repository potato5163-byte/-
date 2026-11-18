export type CompanyType = '공기업' | '사기업';
export type DeadlineType = 'fixed' | 'rolling' | 'until_hired';

export interface ScheduleItem {
  step: string | null;
  date: string | null;
  time: string | null;
  source: string | null;
}

export interface EligibilityItem {
  item: string | null;
  condition: string | null;
  source: string | null;
}

export interface BonusPointItem {
  item: string | null;
  points: number | null;
  source: string | null;
}

export interface EssayQuestionItem {
  question: string | null;
  max_chars: string | null;
}

export interface JobAnalysis {
  company_type?: CompanyType | null;
  organization: string | null;
  position: string | null;
  employment_type?: string | null;
  experience_level?: string | null;
  location?: string | null;
  headcount?: string | null;
  compensation?: string | null;
  deadline_type?: DeadlineType | null;
  tech_skills?: (string | null)[] | null;
  keywords?: (string | null)[] | null;
  interview_questions?: (string | null)[] | null;
  schedule: ScheduleItem[] | null;
  eligibility: EligibilityItem[] | null;
  bonus_points: BonusPointItem[] | null;
  documents: (string | null)[] | null;
  stages: (string | null)[] | null;
  essay_questions?: EssayQuestionItem[] | null;
}

export type ApplicationStatus =
  | '지원 예정'
  | '지원 완료'
  | '서류 합격'
  | '필기 합격'
  | '최종 합격'
  | '불합격'
  | '보류';

export const APPLICATION_STATUSES: ApplicationStatus[] = [
  '지원 예정',
  '지원 완료',
  '서류 합격',
  '필기 합격',
  '최종 합격',
  '불합격',
  '보류',
];

export interface SavedAnnouncement {
  id: string;
  analysis: JobAnalysis;
  originalText: string;
  attachedFileName: string | null;
  sourceUrl?: string | null;
  isPinned?: boolean;
  checkedDocs: Record<number, boolean>;
  categoryTag: string;
  selectedForCompare: boolean;
  applicationStatus: ApplicationStatus;
  memo: string;
  essayDrafts?: Record<number, string>;
  interviewNotes?: Record<number, string>;
  bonusOverrides?: Record<number, boolean>;
  savedAt: string;
  updatedAt: string;
}

export type RecommendSectorFilter = 'all' | '공기업' | '사기업';

export interface RecommendedCompany {
  company_type: CompanyType;
  organization: string;
  recommended_position: string;
  fit_level: '높음' | '적합' | '도전';
  fit_summary: string;
  matched_specs: string[];
  preparation_tip: string;
  typical_hiring_period: string;
}

export interface SpecRecommendationResponse {
  overall_advice: string;
  recommendations: RecommendedCompany[];
  generatedAt?: string;
}

