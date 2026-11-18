export type CertCategory =
  | '전체'
  | '어학'
  | '공통·사무'
  | '전기·통신'
  | 'IT·데이터'
  | '기계·안전'
  | '토목·환경'
  | '경영·회계';

export interface LanguageExamSpec {
  name: string;
  issuer: string;
  mode: 'score' | 'grade';
  unit?: string;
  maxScore?: number;
  placeholder?: string;
  grades?: string[];
}

export interface OfficialCertification {
  name: string;
  category: Exclude<CertCategory, '전체'>;
  issuer: string;
}

export const CERT_CATEGORIES: CertCategory[] = [
  '전체',
  '어학',
  '공통·사무',
  '전기·통신',
  'IT·데이터',
  '기계·안전',
  '토목·환경',
  '경영·회계',
];

export const LANGUAGE_EXAMS: LanguageExamSpec[] = [
  {
    name: 'TOEIC',
    issuer: '한국TOEIC위원회 (YBM)',
    mode: 'score',
    unit: '점',
    maxScore: 990,
    placeholder: '예: 850',
  },
  {
    name: 'TOEIC Speaking',
    issuer: '한국TOEIC위원회 (YBM)',
    mode: 'grade',
    grades: ['AL', 'AH', 'AM', 'IH', 'IM3', 'IM2', 'IM1', 'IL', 'NH', 'NM', 'NL'],
  },
  {
    name: 'OPIc',
    issuer: 'ACTFL / 크레듀',
    mode: 'grade',
    grades: ['AL', 'IH', 'IM3', 'IM2', 'IM1', 'IL', 'NH', 'NM', 'NL'],
  },
  {
    name: 'NEW TEPS',
    issuer: '서울대학교 TEPS관리위원회',
    mode: 'score',
    unit: '점',
    maxScore: 600,
    placeholder: '예: 340',
  },
  {
    name: 'TOEFL iBT',
    issuer: 'ETS',
    mode: 'score',
    unit: '점',
    maxScore: 120,
    placeholder: '예: 95',
  },
  {
    name: 'JPT',
    issuer: 'YBM 일본어능력시험',
    mode: 'score',
    unit: '점',
    maxScore: 990,
    placeholder: '예: 750',
  },
  {
    name: 'JLPT',
    issuer: '일본국제교육지원협회',
    mode: 'grade',
    grades: ['N1', 'N2', 'N3', 'N4', 'N5'],
  },
  {
    name: 'HSK',
    issuer: '중국국가한판',
    mode: 'grade',
    grades: ['6급', '5급', '4급', '3급'],
  },
];

export const OFFICIAL_CERTIFICATIONS: OfficialCertification[] = [
  // 어학
  ...LANGUAGE_EXAMS.map((exam) => ({
    name: exam.name,
    category: '어학' as const,
    issuer: exam.issuer,
  })),

  // 공통·사무
  { name: '한국사능력검정시험 1급', category: '공통·사무', issuer: '국사편찬위원회' },
  { name: '한국사능력검정시험 2급', category: '공통·사무', issuer: '국사편찬위원회' },
  { name: '한국사능력검정시험 3급', category: '공통·사무', issuer: '국사편찬위원회' },
  { name: '컴퓨터활용능력 1급', category: '공통·사무', issuer: '대한상공회의소' },
  { name: '컴퓨터활용능력 2급', category: '공통·사무', issuer: '대한상공회의소' },
  { name: '워드프로세서', category: '공통·사무', issuer: '대한상공회의소' },
  { name: 'KBS한국어능력시험 1급', category: '공통·사무', issuer: 'KBS 한국어진흥원' },
  { name: 'KBS한국어능력시험 2+급', category: '공통·사무', issuer: 'KBS 한국어진흥원' },
  { name: 'KBS한국어능력시험 2-급', category: '공통·사무', issuer: 'KBS 한국어진흥원' },
  { name: '국어능력인증시험(ToKL) 1급', category: '공통·사무', issuer: '한국언어문화연구원' },
  { name: '국어능력인증시험(ToKL) 2급', category: '공통·사무', issuer: '한국언어문화연구원' },

  // 전기·통신
  { name: '전기기사', category: '전기·통신', issuer: '한국산업인력공단(Q-Net)' },
  { name: '전기산업기사', category: '전기·통신', issuer: '한국산업인력공단(Q-Net)' },
  { name: '전기공사기사', category: '전기·통신', issuer: '한국산업인력공단(Q-Net)' },
  { name: '전기공사산업기사', category: '전기·통신', issuer: '한국산업인력공단(Q-Net)' },
  { name: '전자기사', category: '전기·통신', issuer: '한국산업인력공단(Q-Net)' },
  { name: '정보통신기사', category: '전기·통신', issuer: '한국방송통신전파진흥원' },
  { name: '무선설비기사', category: '전기·통신', issuer: '한국방송통신전파진흥원' },
  { name: '신재생에너지발전설비기사(태양광)', category: '전기·통신', issuer: '한국산업인력공단(Q-Net)' },
  { name: '발송배전기술사', category: '전기·통신', issuer: '한국산업인력공단(Q-Net)' },

  // IT·데이터
  { name: '정보처리기사', category: 'IT·데이터', issuer: '한국산업인력공단(Q-Net)' },
  { name: '정보처리산업기사', category: 'IT·데이터', issuer: '한국산업인력공단(Q-Net)' },
  { name: '정보보안기사', category: 'IT·데이터', issuer: '한국인터넷진흥원(KISA)' },
  { name: '정보보안산업기사', category: 'IT·데이터', issuer: '한국인터넷진흥원(KISA)' },
  { name: '빅데이터분석기사', category: 'IT·데이터', issuer: '한국데이터산업진흥원' },
  { name: 'SQLD (SQL 개발자)', category: 'IT·데이터', issuer: '한국데이터산업진흥원' },
  { name: 'ADsP (데이터분석 준전문가)', category: 'IT·데이터', issuer: '한국데이터산업진흥원' },
  { name: '네트워크관리사 2급', category: 'IT·데이터', issuer: '한국정보통신자격협회' },
  { name: '리눅스마스터 1급', category: 'IT·데이터', issuer: '한국정보통신자격협회' },

  // 기계·안전
  { name: '일반기계기사', category: '기계·안전', issuer: '한국산업인력공단(Q-Net)' },
  { name: '건설기계설비기사', category: '기계·안전', issuer: '한국산업인력공단(Q-Net)' },
  { name: '공조냉동기계기사', category: '기계·안전', issuer: '한국산업인력공단(Q-Net)' },
  { name: '에너지관리기사', category: '기계·안전', issuer: '한국산업인력공단(Q-Net)' },
  { name: '산업안전기사', category: '기계·안전', issuer: '한국산업인력공단(Q-Net)' },
  { name: '산업안전산업기사', category: '기계·안전', issuer: '한국산업인력공단(Q-Net)' },
  { name: '건설안전기사', category: '기계·안전', issuer: '한국산업인력공단(Q-Net)' },
  { name: '소방설비기사(전기분야)', category: '기계·안전', issuer: '한국산업인력공단(Q-Net)' },
  { name: '소방설비기사(기계분야)', category: '기계·안전', issuer: '한국산업인력공단(Q-Net)' },
  { name: '가스기사', category: '기계·안전', issuer: '한국산업인력공단(Q-Net)' },
  { name: '위험물산업기사', category: '기계·안전', issuer: '한국산업인력공단(Q-Net)' },
  { name: '원자력기사', category: '기계·안전', issuer: '한국산업인력공단(Q-Net)' },

  // 토목·환경
  { name: '토목기사', category: '토목·환경', issuer: '한국산업인력공단(Q-Net)' },
  { name: '토목산업기사', category: '토목·환경', issuer: '한국산업인력공단(Q-Net)' },
  { name: '건축기사', category: '토목·환경', issuer: '한국산업인력공단(Q-Net)' },
  { name: '건축설비기사', category: '토목·환경', issuer: '한국산업인력공단(Q-Net)' },
  { name: '수질환경기사', category: '토목·환경', issuer: '한국산업인력공단(Q-Net)' },
  { name: '대기환경기사', category: '토목·환경', issuer: '한국산업인력공단(Q-Net)' },
  { name: '폐기물처리기사', category: '토목·환경', issuer: '한국산업인력공단(Q-Net)' },
  { name: '조경기사', category: '토목·환경', issuer: '한국산업인력공단(Q-Net)' },
  { name: '지적기사', category: '토목·환경', issuer: '한국산업인력공단(Q-Net)' },

  // 경영·회계
  { name: '공인회계사(CPA)', category: '경영·회계', issuer: '금융감독원' },
  { name: '세무사(CTA)', category: '경영·회계', issuer: '한국산업인력공단(Q-Net)' },
  { name: '공인노무사', category: '경영·회계', issuer: '한국산업인력공단(Q-Net)' },
  { name: '재경관리사', category: '경영·회계', issuer: '삼일회계법인' },
  { name: '전산회계 1급', category: '경영·회계', issuer: '한국세무사회' },
  { name: '전산세무 1급', category: '경영·회계', issuer: '한국세무사회' },
  { name: '전산세무 2급', category: '경영·회계', issuer: '한국세무사회' },
  { name: '매경TEST 우수', category: '경영·회계', issuer: '매일경제신문' },
  { name: 'TESAT 1급', category: '경영·회계', issuer: '한국경제신문' },
  { name: '사회조사분석사 2급', category: '경영·회계', issuer: '한국산업인력공단(Q-Net)' },
  { name: '직업상담사 2급', category: '경영·회계', issuer: '한국산업인력공단(Q-Net)' },
];
