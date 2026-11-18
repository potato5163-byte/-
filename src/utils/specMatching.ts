import type { BonusPointItem, EligibilityItem, JobAnalysis } from '../types';
import { parseYyyyMmDd } from './dday';

export type EducationLevel = '고졸' | '전문학사' | '학사' | '석사' | '박사';

export interface UserProfileMeta {
  education: EducationLevel | '';
  careerYears: number | null;
}

export interface LanguageSpec {
  exam: string;
  value: string;
  acquiredDate?: string;
}

export interface LanguageExpiryInfo {
  expiresAt: string;
  isExpired: boolean;
  isExpiringSoon: boolean;
  daysLeft: number;
}

export type MatchStatus = 'met' | 'unmet' | 'check';

export interface EligibilityMatchResult {
  title: string;
  condition: string;
  status: MatchStatus;
  detail: string;
}

export interface BonusMatchResult {
  title: string;
  points: number;
  isPointBased: boolean;
  matched: boolean;
  autoMatched: boolean;
  overridden: boolean;
  detail: string;
}

export interface SkillMatchSummary {
  matchedSkills: string[];
  missingSkills: string[];
  totalSkills: number;
}

export interface SpecMatchSummary {
  overallStatus: 'eligible' | 'ineligible' | 'check';
  overallLabel: string;
  totalBonusPoints: number;
  matchedPreferenceCount: number;
  metCount: number;
  unmetCount: number;
  checkCount: number;
  eligibilityResults: EligibilityMatchResult[];
  bonusResults: BonusMatchResult[];
  skillMatch: SkillMatchSummary;
}

const SPEAKING_GRADE_ORDER: Record<string, number> = {
  NL: 1,
  NM: 2,
  NH: 3,
  IL: 4,
  IM1: 5,
  IM2: 6,
  IM3: 7,
  IH: 8,
  AM: 9,
  AH: 10,
  AL: 11,
};

const JLPT_GRADE_ORDER: Record<string, number> = {
  N5: 1,
  N4: 2,
  N3: 3,
  N2: 4,
  N1: 5,
};

const HSK_GRADE_ORDER: Record<string, number> = {
  '3급': 3,
  '4급': 4,
  '5급': 5,
  '6급': 6,
};

function normalizeText(s: string): string {
  return s.replace(/\s+/g, '').toLowerCase();
}

function parseExamScore(clause: string, examKeywords: string[], minDigits = 2, maxDigits = 4): number | null {
  // Strip explicit date/year expressions so "2026년", "2026.01.01", "2025-12-31" never masquerade as test scores
  const cleaned = clause
    .replace(/\b\d{4}[.\-/]\d{1,2}(?:[.\-/]\d{1,2})?\b/g, ' ')
    .replace(/\b\d{4}\s*년(?:\s*\d{1,2}\s*월)?(?:\s*\d{1,2}\s*일)?/g, ' ');

  // Priority 1: Number directly followed by "점"
  const scoreWithUnit = new RegExp(`(\\d{${minDigits},${maxDigits}})\\s*점`).exec(cleaned);
  if (scoreWithUnit && scoreWithUnit[1]) {
    const num = Number(scoreWithUnit[1]);
    if (Number.isFinite(num)) return num;
  }

  // Priority 2: Number appearing shortly after the exam name (not followed by digit/년/월/일/배/명/%)
  const escapedKeywords = examKeywords.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const afterExamRegex = new RegExp(
    `(?:${escapedKeywords})[^\\d]{0,16}(\\d{${minDigits},${maxDigits}})(?![\\d년월일명배%])`,
    'i'
  );
  const afterExam = afterExamRegex.exec(cleaned);
  if (afterExam && afterExam[1]) {
    const num = Number(afterExam[1]);
    if (Number.isFinite(num)) return num;
  }

  return null;
}

function parseSpeakingGrade(text: string): string | null {
  const m = /\b(AL|AH|AM|IH|IM3|IM2|IM1|IM|IL|NH|NM|NL)\b/i.exec(text);
  if (!m) return null;
  const upper = m[1].toUpperCase();
  return upper === 'IM' ? 'IM1' : upper;
}

const EDUCATION_ORDER: Record<EducationLevel, number> = {
  고졸: 1,
  전문학사: 2,
  학사: 3,
  석사: 4,
  박사: 5,
};

export function getLanguageExpiryInfo(
  acquiredDate?: string,
  referenceDateStr?: string | null
): LanguageExpiryInfo | null {
  const acquired = parseYyyyMmDd(acquiredDate);
  if (!acquired) return null;

  // Standard Korean official language score validity: 2 years from test date
  const expiry = new Date(
    acquired.getFullYear() + 2,
    acquired.getMonth(),
    acquired.getDate()
  );
  const expiresAt = `${expiry.getFullYear()}-${String(expiry.getMonth() + 1).padStart(
    2,
    '0'
  )}-${String(expiry.getDate()).padStart(2, '0')}`;

  const parsedRef = parseYyyyMmDd(referenceDateStr);
  const now = new Date();
  const refDate =
    parsedRef ?? new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const msPerDay = 1000 * 60 * 60 * 24;
  const daysLeft = Math.round((expiry.getTime() - refDate.getTime()) / msPerDay);

  return {
    expiresAt,
    isExpired: daysLeft < 0,
    isExpiringSoon: daysLeft >= 0 && daysLeft <= 60,
    daysLeft,
  };
}

function getSpecEntry(specs: LanguageSpec[], examName: string): LanguageSpec | undefined {
  return specs.find((s) => s.exam.toLowerCase() === examName.toLowerCase());
}

function getNumericSpec(specs: LanguageSpec[], examName: string): number | null {
  const found = getSpecEntry(specs, examName);
  if (!found) return null;
  const m = /(\d+)/.exec(found.value);
  return m ? Number(m[1]) : null;
}

function getGradeSpec(specs: LanguageSpec[], examName: string): string | null {
  const found = getSpecEntry(specs, examName);
  return found ? found.value.trim().toUpperCase() : null;
}

function evaluateExpirySuffix(
  spec: LanguageSpec | undefined,
  referenceDate?: string | null
): { expiredDetail: string | null; note: string } {
  if (!spec?.acquiredDate) return { expiredDetail: null, note: '' };
  const info = getLanguageExpiryInfo(spec.acquiredDate, referenceDate);
  if (!info) return { expiredDetail: null, note: '' };
  if (info.isExpired) {
    return {
      expiredDetail: `${spec.exam} ${spec.value} 유효기간 만료 (${info.expiresAt})`,
      note: '',
    };
  }
  if (info.isExpiringSoon) {
    return {
      expiredDetail: null,
      note: ` · 만료 임박 ${info.expiresAt}`,
    };
  }
  return { expiredDetail: null, note: '' };
}

function evaluateLanguageText(
  text: string,
  specs: LanguageSpec[],
  referenceDate?: string | null
): { handled: boolean; status: MatchStatus; detail: string } {
  const lower = text.toLowerCase();
  const hasLangKeyword =
    lower.includes('toeic') ||
    lower.includes('토익') ||
    lower.includes('opic') ||
    lower.includes('오픽') ||
    lower.includes('토스') ||
    lower.includes('스피킹') ||
    lower.includes('teps') ||
    lower.includes('텝스') ||
    lower.includes('toefl') ||
    lower.includes('토플') ||
    lower.includes('jlpt') ||
    lower.includes('jpt') ||
    lower.includes('hsk') ||
    lower.includes('어학');

  if (!hasLangKeyword) {
    return { handled: false, status: 'check', detail: '' };
  }

  // Split by "또는" / "or" / "/" if multiple alternatives exist (OR logic)
  const clauses = text.split(/또는|\bor\b|\//i).map((c) => c.trim()).filter(Boolean);
  const evaluations: Array<{ status: MatchStatus; detail: string }> = [];

  for (const clause of clauses.length > 0 ? clauses : [text]) {
    const cl = clause.toLowerCase();

    // TOEIC Speaking
    if (
      cl.includes('토익스피킹') ||
      cl.includes('toeic speaking') ||
      cl.includes('토스')
    ) {
      const reqGrade = parseSpeakingGrade(clause);
      const specEntry = getSpecEntry(specs, 'TOEIC Speaking');
      const myGrade = getGradeSpec(specs, 'TOEIC Speaking');
      if (reqGrade) {
        if (!myGrade) {
          evaluations.push({
            status: 'unmet',
            detail: `TOEIC Speaking 미등록 (기준: ${reqGrade} 이상)`,
          });
        } else {
          const exp = evaluateExpirySuffix(specEntry, referenceDate);
          if (exp.expiredDetail) {
            evaluations.push({ status: 'unmet', detail: exp.expiredDetail });
          } else if (
            (SPEAKING_GRADE_ORDER[myGrade] ?? 0) >= (SPEAKING_GRADE_ORDER[reqGrade] ?? 0)
          ) {
            evaluations.push({
              status: 'met',
              detail: `내 성적 TOEIC Speaking ${myGrade} (기준 ${reqGrade} 충족${exp.note})`,
            });
          } else {
            evaluations.push({
              status: 'unmet',
              detail: `내 성적 TOEIC Speaking ${myGrade} (기준 ${reqGrade} 미달)`,
            });
          }
        }
        continue;
      }
      const reqScore = parseExamScore(clause, ['토익스피킹', 'toeic speaking', '토스'], 2, 3);
      if (reqScore !== null) {
        evaluations.push({
          status: myGrade ? 'check' : 'unmet',
          detail: myGrade
            ? `TOEIC Speaking ${myGrade} 보유 (점수 기준 직접 확인)`
            : 'TOEIC Speaking 성적 미등록',
        });
        continue;
      }
    }

    // OPIc
    if (cl.includes('opic') || cl.includes('오픽')) {
      const reqGrade = parseSpeakingGrade(clause);
      const specEntry = getSpecEntry(specs, 'OPIc');
      const myGrade = getGradeSpec(specs, 'OPIc');
      if (reqGrade) {
        if (!myGrade) {
          evaluations.push({
            status: 'unmet',
            detail: `OPIc 미등록 (기준: ${reqGrade} 이상)`,
          });
        } else {
          const exp = evaluateExpirySuffix(specEntry, referenceDate);
          if (exp.expiredDetail) {
            evaluations.push({ status: 'unmet', detail: exp.expiredDetail });
          } else if (
            (SPEAKING_GRADE_ORDER[myGrade] ?? 0) >= (SPEAKING_GRADE_ORDER[reqGrade] ?? 0)
          ) {
            evaluations.push({
              status: 'met',
              detail: `내 성적 OPIc ${myGrade} (기준 ${reqGrade} 충족${exp.note})`,
            });
          } else {
            evaluations.push({
              status: 'unmet',
              detail: `내 성적 OPIc ${myGrade} (기준 ${reqGrade} 미달)`,
            });
          }
        }
        continue;
      }
    }

    // TOEIC (guard against "토익스피킹" falling through)
    if (
      (cl.includes('toeic') || cl.includes('토익')) &&
      !cl.includes('스피킹') &&
      !cl.includes('speaking')
    ) {
      const reqScore = parseExamScore(clause, ['toeic', '토익'], 3, 3);
      const specEntry = getSpecEntry(specs, 'TOEIC');
      const myScore = getNumericSpec(specs, 'TOEIC');
      if (reqScore !== null) {
        if (myScore === null) {
          evaluations.push({
            status: 'unmet',
            detail: `TOEIC 미등록 (기준: ${reqScore}점 이상)`,
          });
        } else {
          const exp = evaluateExpirySuffix(specEntry, referenceDate);
          if (exp.expiredDetail) {
            evaluations.push({ status: 'unmet', detail: exp.expiredDetail });
          } else if (myScore >= reqScore) {
            evaluations.push({
              status: 'met',
              detail: `내 성적 TOEIC ${myScore}점 (기준 ${reqScore}점 충족${exp.note})`,
            });
          } else {
            evaluations.push({
              status: 'unmet',
              detail: `내 성적 TOEIC ${myScore}점 (기준 ${reqScore}점 미달)`,
            });
          }
        }
        continue;
      }
    }

    // TEPS / NEW TEPS
    if (cl.includes('teps') || cl.includes('텝스')) {
      const reqScore = parseExamScore(clause, ['new teps', 'teps', '뉴텝스', '텝스'], 3, 3);
      const specEntry = getSpecEntry(specs, 'NEW TEPS');
      const myScore = getNumericSpec(specs, 'NEW TEPS');
      if (reqScore !== null) {
        if (myScore === null) {
          evaluations.push({
            status: 'unmet',
            detail: `TEPS 미등록 (기준: ${reqScore}점 이상)`,
          });
        } else {
          const exp = evaluateExpirySuffix(specEntry, referenceDate);
          if (exp.expiredDetail) {
            evaluations.push({ status: 'unmet', detail: exp.expiredDetail });
          } else if (myScore >= reqScore) {
            evaluations.push({
              status: 'met',
              detail: `내 성적 NEW TEPS ${myScore}점 (기준 ${reqScore}점 충족${exp.note})`,
            });
          } else {
            evaluations.push({
              status: 'unmet',
              detail: `내 성적 NEW TEPS ${myScore}점 (기준 ${reqScore}점 미달)`,
            });
          }
        }
        continue;
      }
    }

    // TOEFL
    if (cl.includes('toefl') || cl.includes('토플')) {
      const reqScore = parseExamScore(clause, ['toefl ibt', 'toefl', '토플'], 2, 3);
      const specEntry = getSpecEntry(specs, 'TOEFL iBT');
      const myScore = getNumericSpec(specs, 'TOEFL iBT');
      if (reqScore !== null) {
        if (myScore === null) {
          evaluations.push({
            status: 'unmet',
            detail: `TOEFL iBT 미등록 (기준: ${reqScore}점 이상)`,
          });
        } else {
          const exp = evaluateExpirySuffix(specEntry, referenceDate);
          if (exp.expiredDetail) {
            evaluations.push({ status: 'unmet', detail: exp.expiredDetail });
          } else if (myScore >= reqScore) {
            evaluations.push({
              status: 'met',
              detail: `내 성적 TOEFL iBT ${myScore}점 (기준 ${reqScore}점 충족${exp.note})`,
            });
          } else {
            evaluations.push({
              status: 'unmet',
              detail: `내 성적 TOEFL iBT ${myScore}점 (기준 ${reqScore}점 미달)`,
            });
          }
        }
        continue;
      }
    }

    // JPT
    if (cl.includes('jpt') && !cl.includes('jlpt')) {
      const reqScore = parseExamScore(clause, ['jpt'], 3, 3);
      const specEntry = getSpecEntry(specs, 'JPT');
      const myScore = getNumericSpec(specs, 'JPT');
      if (reqScore !== null) {
        if (myScore === null) {
          evaluations.push({
            status: 'unmet',
            detail: `JPT 미등록 (기준: ${reqScore}점 이상)`,
          });
        } else {
          const exp = evaluateExpirySuffix(specEntry, referenceDate);
          if (exp.expiredDetail) {
            evaluations.push({ status: 'unmet', detail: exp.expiredDetail });
          } else if (myScore >= reqScore) {
            evaluations.push({
              status: 'met',
              detail: `내 성적 JPT ${myScore}점 (기준 ${reqScore}점 충족${exp.note})`,
            });
          } else {
            evaluations.push({
              status: 'unmet',
              detail: `내 성적 JPT ${myScore}점 (기준 ${reqScore}점 미달)`,
            });
          }
        }
        continue;
      }
    }

    // JLPT
    if (cl.includes('jlpt')) {
      const m = /\b(N[1-5])\b/i.exec(clause);
      const reqGrade = m ? m[1].toUpperCase() : null;
      const myGrade = getGradeSpec(specs, 'JLPT');
      if (reqGrade) {
        if (!myGrade) {
          evaluations.push({ status: 'unmet', detail: `JLPT 미등록 (기준: ${reqGrade})` });
        } else if ((JLPT_GRADE_ORDER[myGrade] ?? 0) >= (JLPT_GRADE_ORDER[reqGrade] ?? 0)) {
          evaluations.push({ status: 'met', detail: `내 성적 JLPT ${myGrade} 충족` });
        } else {
          evaluations.push({ status: 'unmet', detail: `내 성적 JLPT ${myGrade} (기준 ${reqGrade} 미달)` });
        }
        continue;
      }
    }

    // HSK
    if (cl.includes('hsk')) {
      const m = /([3-6])\s*급/.exec(clause);
      const reqGrade = m ? `${m[1]}급` : null;
      const specEntry = getSpecEntry(specs, 'HSK');
      const myGrade = getGradeSpec(specs, 'HSK');
      if (reqGrade) {
        if (!myGrade) {
          evaluations.push({ status: 'unmet', detail: `HSK 미등록 (기준: ${reqGrade} 이상)` });
        } else {
          const exp = evaluateExpirySuffix(specEntry, referenceDate);
          if (exp.expiredDetail) {
            evaluations.push({ status: 'unmet', detail: exp.expiredDetail });
          } else if ((HSK_GRADE_ORDER[myGrade] ?? 0) >= (HSK_GRADE_ORDER[reqGrade] ?? 0)) {
            evaluations.push({
              status: 'met',
              detail: `내 성적 HSK ${myGrade} (기준 ${reqGrade} 충족${exp.note})`,
            });
          } else {
            evaluations.push({ status: 'unmet', detail: `내 성적 HSK ${myGrade} (기준 ${reqGrade} 미달)` });
          }
        }
        continue;
      }
    }
  }

  if (evaluations.length === 0) {
    if (specs.length > 0 && (lower.includes('어학') || lower.includes('성적'))) {
      return {
        handled: true,
        status: 'check',
        detail: `등록된 어학 성적(${specs.map((s) => `${s.exam} ${s.value}`).join(', ')}) 유효기간·기준 확인`,
      };
    }
    return { handled: false, status: 'check', detail: '' };
  }

  const metEval = evaluations.find((e) => e.status === 'met');
  if (metEval) {
    return { handled: true, status: 'met', detail: metEval.detail };
  }
  const checkEval = evaluations.find((e) => e.status === 'check');
  if (checkEval) {
    return { handled: true, status: 'check', detail: checkEval.detail };
  }
  return {
    handled: true,
    status: 'unmet',
    detail: evaluations.map((e) => e.detail).join(' / '),
  };
}

function matchCertificateAgainstText(
  cert: string,
  text: string
): boolean {
  const normCert = normalizeText(cert);
  const normText = normalizeText(text);

  if (normText.includes(normCert)) return true;

  // 한국사능력검정시험 등급 계층 (1급 >= 2급 >= 3급)
  if (normCert.includes('한국사') && normText.includes('한국사')) {
    const myGradeMatch = /([1-6])급/.exec(normCert);
    const reqGradeMatch = /([1-6])급/.exec(normText);
    if (myGradeMatch && reqGradeMatch) {
      return Number(myGradeMatch[1]) <= Number(reqGradeMatch[1]);
    }
    if (!reqGradeMatch) return true;
  }

  // 컴퓨터활용능력 등급 계층 (1급 >= 2급)
  if (
    (normCert.includes('컴퓨터활용능력') || normCert.includes('컴활')) &&
    (normText.includes('컴퓨터활용능력') || normText.includes('컴활'))
  ) {
    const myGradeMatch = /([12])급/.exec(normCert);
    const reqGradeMatch = /([12])급/.exec(normText);
    if (myGradeMatch && reqGradeMatch) {
      return Number(myGradeMatch[1]) <= Number(reqGradeMatch[1]);
    }
    if (!reqGradeMatch) return true;
  }

  // 전기기사 -> 기사 이상 조건
  if (normCert.endsWith('기사') && !normCert.endsWith('산업기사')) {
    if (normText.includes('기사이상') || normText.includes('국가기술자격증(기사이상)')) {
      return true;
    }
  }

  // Strip parenthetical info like "(SQL 개발자)" AND check parenthetical alias
  const parenMatch = /\(([^)]+)\)/.exec(cert);
  if (parenMatch && parenMatch[1]) {
    const normAlias = normalizeText(parenMatch[1]);
    if (normAlias.length >= 2 && normText.includes(normAlias)) return true;
  }
  const baseCert = normalizeText(cert.replace(/\(.*?\)/g, ''));
  if (baseCert.length >= 2 && normText.includes(baseCert)) return true;

  return false;
}

function evaluateCertificateText(
  text: string,
  certificates: string[]
): { handled: boolean; status: MatchStatus; detail: string } {
  const norm = normalizeText(text);
  const mentionsCert =
    norm.includes('자격') ||
    norm.includes('기사') ||
    norm.includes('한국사') ||
    norm.includes('컴활') ||
    norm.includes('컴퓨터활용') ||
    norm.includes('회계') ||
    norm.includes('세무') ||
    norm.includes('노무사') ||
    norm.includes('sqld') ||
    norm.includes('adsp');

  if (!mentionsCert) {
    return { handled: false, status: 'check', detail: '' };
  }

  if (norm.includes('제한없음') || norm.includes('무관') || norm.includes('해당없음')) {
    return { handled: true, status: 'met', detail: '별도 제한 없음' };
  }

  const matched = certificates.filter((c) => matchCertificateAgainstText(c, text));
  if (matched.length > 0) {
    return {
      handled: true,
      status: 'met',
      detail: `보유 자격증 일치: ${matched.join(', ')}`,
    };
  }

  // If it specifically names a required cert (e.g. 전기기사 소지자), mark unmet if none matched
  if (
    norm.includes('소지자') ||
    norm.includes('보유자') ||
    norm.includes('취득자') ||
    norm.includes('필수')
  ) {
    return {
      handled: true,
      status: 'unmet',
      detail: '등록된 자격증 중 일치 항목 없음',
    };
  }

  return {
    handled: true,
    status: 'check',
    detail: '보유 자격증 해당 여부 확인 필요',
  };
}

function matchSkillAgainstText(skill: string, text: string): boolean {
  const trimmed = skill.trim();
  if (!trimmed) return false;
  const lowerSkill = trimmed.toLowerCase();
  const lowerText = text.toLowerCase();

  // For very short ASCII skills (e.g. C, R, Go, AI), require word boundary to avoid false substring matches
  if (/^[a-z0-9+#]{1,2}$/i.test(trimmed)) {
    const escaped = lowerSkill.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(?:^|[^a-z0-9])${escaped}(?:$|[^a-z0-9])`, 'i');
    return regex.test(lowerText);
  }

  const normSkill = normalizeText(trimmed);
  const normText = normalizeText(text);
  if (normText.includes(normSkill)) return true;

  // Common Korean/English aliases
  if (normSkill === '엑셀' && normText.includes('excel')) return true;
  if (normSkill === 'excel' && normText.includes('엑셀')) return true;
  if (normSkill === '파이썬' && normText.includes('python')) return true;
  if (normSkill === 'python' && normText.includes('파이썬')) return true;
  if (normSkill.includes('인턴') && (normText.includes('인턴') || normText.includes('유관경력') || normText.includes('실무경험'))) {
    return true;
  }

  return false;
}

function evaluateEducationText(
  text: string,
  education?: EducationLevel | ''
): { handled: boolean; status: MatchStatus; detail: string } {
  const norm = normalizeText(text);
  let reqEdu: EducationLevel | null = null;
  if (norm.includes('박사')) reqEdu = '박사';
  else if (norm.includes('석사')) reqEdu = '석사';
  else if (norm.includes('학사') || norm.includes('대졸') || norm.includes('4년제')) reqEdu = '학사';
  else if (norm.includes('전문학사') || norm.includes('전문대졸') || norm.includes('초대졸')) reqEdu = '전문학사';
  else if (norm.includes('고졸')) reqEdu = '고졸';

  if (!reqEdu) return { handled: false, status: 'check', detail: '' };
  if (!education) {
    return {
      handled: true,
      status: 'check',
      detail: `학력 조건(${reqEdu} 이상) · 스펙에 최종학력 등록 필요`,
    };
  }
  if (EDUCATION_ORDER[education] >= EDUCATION_ORDER[reqEdu]) {
    return {
      handled: true,
      status: 'met',
      detail: `내 학력 ${education} (기준 ${reqEdu} 이상 충족)`,
    };
  }
  return {
    handled: true,
    status: 'unmet',
    detail: `내 학력 ${education} (기준 ${reqEdu} 이상 미달)`,
  };
}

function evaluateCareerText(
  text: string,
  careerYears?: number | null
): { handled: boolean; status: MatchStatus; detail: string } {
  const norm = normalizeText(text);
  const yearMatch = /(?:경력|유관경력|실무경력|연차)[^\d]{0,6}(\d{1,2})\s*년/.exec(norm);
  if (!yearMatch) return { handled: false, status: 'check', detail: '' };

  const reqYears = Number(yearMatch[1]);
  const allowsEntry = norm.includes('신입') || norm.includes('인턴');
  if (allowsEntry && careerYears !== null && careerYears !== undefined && careerYears === 0) {
    return {
      handled: true,
      status: 'met',
      detail: '신입 지원 가능 요건 충족',
    };
  }
  if (careerYears === null || careerYears === undefined) {
    return {
      handled: true,
      status: 'check',
      detail: `경력 ${reqYears}년 이상 요건 · 스펙에 경력 연차 등록 필요`,
    };
  }
  if (careerYears >= reqYears) {
    return {
      handled: true,
      status: 'met',
      detail: `내 경력 ${careerYears}년 (기준 ${reqYears}년 이상 충족)`,
    };
  }
  return {
    handled: true,
    status: 'unmet',
    detail: `내 경력 ${careerYears === 0 ? '신입(0년)' : `${careerYears}년`} (기준 ${reqYears}년 이상 미달)`,
  };
}

export function evaluateSpecMatching(
  analysis: JobAnalysis,
  certificates: string[],
  languageSpecs: LanguageSpec[],
  bonusOverrides?: Record<number, boolean>,
  skills: string[] = [],
  profileMeta?: UserProfileMeta,
  deadlineDate?: string | null
): SpecMatchSummary {
  const eligibilityList: EligibilityItem[] = Array.isArray(analysis.eligibility)
    ? analysis.eligibility
    : [];
  const bonusList: BonusPointItem[] = Array.isArray(analysis.bonus_points)
    ? analysis.bonus_points
    : [];
  const techSkillsList = Array.isArray(analysis.tech_skills)
    ? analysis.tech_skills.filter((s): s is string => Boolean(s && s.trim()))
    : [];

  const eligibilityResults: EligibilityMatchResult[] = eligibilityList.map((elig) => {
    const title = elig.item ?? '지원 자격';
    const condition = elig.condition ?? '공고에 없음';
    const combinedText = `${elig.item ?? ''} ${elig.condition ?? ''} ${elig.source ?? ''}`;

    const normCombined = normalizeText(combinedText);
    const hasExplicitRequirement =
      /(?:경력|유관경력|실무경력)[^\d]{0,6}\d{1,2}\s*년/.test(normCombined) ||
      /toeic|토익|opic|오픽|토스|teps|텝스|toefl|토플|jlpt|jpt|hsk|기사|자격증/.test(
        normCombined
      );
    if (
      !hasExplicitRequirement &&
      (normCombined.includes('제한없음') ||
        normCombined.includes('학력무관') ||
        normCombined.includes('연령무관') ||
        normCombined.includes('경력무관') ||
        normCombined.includes('신입무관') ||
        normCombined.includes('전공무관') ||
        normCombined.includes('블라인드'))
    ) {
      return {
        title,
        condition,
        status: 'met',
        detail: '제한 없음 조건 충족',
      };
    }

    const langEval = evaluateLanguageText(combinedText, languageSpecs, deadlineDate);
    const certEval = evaluateCertificateText(combinedText, certificates);

    // If condition requires BOTH language and certificate (AND, not OR)
    const isOrCondition = /또는|\bor\b|\//i.test(condition);
    if (langEval.handled && certEval.handled) {
      if (isOrCondition) {
        if (langEval.status === 'met') {
          return { title, condition, status: 'met', detail: langEval.detail };
        }
        if (certEval.status === 'met') {
          return { title, condition, status: 'met', detail: certEval.detail };
        }
      } else {
        const combinedStatus: MatchStatus =
          langEval.status === 'unmet' || certEval.status === 'unmet'
            ? 'unmet'
            : langEval.status === 'check' || certEval.status === 'check'
              ? 'check'
              : 'met';
        return {
          title,
          condition,
          status: combinedStatus,
          detail: `${langEval.detail} · ${certEval.detail}`,
        };
      }
    }

    if (langEval.handled) {
      return {
        title,
        condition,
        status: langEval.status,
        detail: langEval.detail,
      };
    }

    if (certEval.handled) {
      return {
        title,
        condition,
        status: certEval.status,
        detail: certEval.detail,
      };
    }

    const careerEval = evaluateCareerText(combinedText, profileMeta?.careerYears);
    if (careerEval.handled) {
      return {
        title,
        condition,
        status: careerEval.status,
        detail: careerEval.detail,
      };
    }

    if (
      normCombined.includes('학력무관') ||
      normCombined.includes('전공무관') ||
      normCombined.includes('연령무관') ||
      normCombined.includes('제한없음')
    ) {
      return {
        title,
        condition,
        status: 'met',
        detail: '제한 없음 조건 충족',
      };
    }

    const eduEval = evaluateEducationText(combinedText, profileMeta?.education);
    if (eduEval.handled) {
      return {
        title,
        condition,
        status: eduEval.status,
        detail: eduEval.detail,
      };
    }

    // Check registered user skills against eligibility condition (common in private companies)
    const matchedSkillsInElig = skills.filter((sk) =>
      matchSkillAgainstText(sk, combinedText)
    );
    if (matchedSkillsInElig.length > 0) {
      return {
        title,
        condition,
        status: 'met',
        detail: `내 직무 역량 일치: ${matchedSkillsInElig.join(', ')}`,
      };
    }

    return {
      title,
      condition,
      status: 'check',
      detail: '공고 조건 직접 확인 필요',
    };
  });

  const bonusResults: BonusMatchResult[] = bonusList.map((bonus, idx) => {
    const title = bonus.item ?? '우대/가산 항목';
    const hasNumericPoints =
      typeof bonus.points === 'number' &&
      Number.isFinite(bonus.points) &&
      bonus.points > 0;
    const points = hasNumericPoints ? bonus.points! : 0;
    const combinedText = `${bonus.item ?? ''} ${bonus.source ?? ''}`;

    let autoMatched = false;
    let detail = hasNumericPoints
      ? '등록된 스펙에 해당 항목 없음'
      : '일반 우대사항 (보유 시 눌러서 적용 표시)';

    const matchedCert = certificates.find((c) => matchCertificateAgainstText(c, combinedText));
    if (matchedCert) {
      autoMatched = true;
      detail = `내 자격증 '${matchedCert}' 적용`;
    } else {
      const langEval = evaluateLanguageText(combinedText, languageSpecs, deadlineDate);
      if (langEval.handled && langEval.status === 'met') {
        autoMatched = true;
        detail = langEval.detail;
      } else {
        const matchedSkills = skills.filter((sk) => matchSkillAgainstText(sk, combinedText));
        if (matchedSkills.length > 0) {
          autoMatched = true;
          detail = `내 역량 '${matchedSkills.join(', ')}' 일치`;
        }
      }
    }

    const overrideVal = bonusOverrides?.[idx];
    const overridden = typeof overrideVal === 'boolean';
    const matched = overridden ? overrideVal : autoMatched;

    if (overridden) {
      detail = overrideVal
        ? hasNumericPoints
          ? '수동 적용 선택됨 (중복·예외 직접 반영)'
          : '해당 있음으로 직접 표시함'
        : hasNumericPoints
          ? '수동 제외됨 (중복 가산 제한 등)'
          : '수동 제외됨';
    }

    return {
      title,
      points,
      isPointBased: hasNumericPoints,
      matched,
      autoMatched,
      overridden,
      detail,
    };
  });

  const matchedSkills: string[] = [];
  const missingSkills: string[] = [];
  for (const reqSkill of techSkillsList) {
    const isMatched =
      skills.some((sk) => matchSkillAgainstText(sk, reqSkill)) ||
      certificates.some((c) => matchCertificateAgainstText(c, reqSkill));
    if (isMatched) {
      matchedSkills.push(reqSkill);
    } else {
      missingSkills.push(reqSkill);
    }
  }

  const metCount = eligibilityResults.filter((r) => r.status === 'met').length;
  const unmetCount = eligibilityResults.filter((r) => r.status === 'unmet').length;
  const checkCount = eligibilityResults.filter((r) => r.status === 'check').length;
  const totalBonusPoints = bonusResults.reduce(
    (sum, item) => (item.matched ? sum + item.points : sum),
    0
  );
  const matchedPreferenceCount = bonusResults.filter(
    (item) => item.matched && !item.isPointBased
  ).length;

  let overallStatus: 'eligible' | 'ineligible' | 'check' = 'eligible';
  let overallLabel = '지원 가능';

  if (unmetCount > 0) {
    overallStatus = 'ineligible';
    overallLabel = '지원 요건 미달';
  } else if (eligibilityResults.length === 0) {
    overallStatus = 'check';
    overallLabel = '요건 공고에 없음';
  } else if (metCount === 0 && checkCount > 0) {
    overallStatus = 'check';
    overallLabel = '지원 요건 확인 필요';
  } else if (checkCount > 0) {
    overallStatus = 'eligible';
    overallLabel = '지원 가능 (일부 확인)';
  }

  return {
    overallStatus,
    overallLabel,
    totalBonusPoints,
    matchedPreferenceCount,
    metCount,
    unmetCount,
    checkCount,
    eligibilityResults,
    bonusResults,
    skillMatch: {
      matchedSkills,
      missingSkills,
      totalSkills: techSkillsList.length,
    },
  };
}
