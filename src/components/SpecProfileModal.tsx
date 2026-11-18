import React, { useEffect, useMemo, useState } from 'react';
import {
  CERT_CATEGORIES,
  LANGUAGE_EXAMS,
  OFFICIAL_CERTIFICATIONS,
  type CertCategory,
} from '../data/officialCertifications';
import {
  getLanguageExpiryInfo,
  type EducationLevel,
  type LanguageSpec,
  type UserProfileMeta,
} from '../utils/specMatching';
import { Mascot } from './Mascot';

const PRESET_SKILLS = [
  'Python',
  'SQL',
  'Excel',
  'TypeScript',
  'React',
  'Java',
  'Spring',
  'AWS',
  'Figma',
  '데이터 분석',
  'CAD',
  '인턴/유관경력',
];

const EDUCATION_OPTIONS: Array<{ value: EducationLevel | ''; label: string }> = [
  { value: '', label: '학력 미설정' },
  { value: '고졸', label: '고졸' },
  { value: '전문학사', label: '전문학사 (2·3년제)' },
  { value: '학사', label: '학사 (4년제 대졸)' },
  { value: '석사', label: '석사' },
  { value: '박사', label: '박사' },
];

const CAREER_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '', label: '경력 미설정' },
  { value: '0', label: '신입 (경력 없음)' },
  { value: '1', label: '1년 이상' },
  { value: '2', label: '2년 이상' },
  { value: '3', label: '3년 이상' },
  { value: '5', label: '5년 이상' },
  { value: '7', label: '7년 이상' },
  { value: '10', label: '10년 이상' },
];

interface SpecProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
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
}

export const SpecProfileModal: React.FC<SpecProfileModalProps> = ({
  isOpen,
  onClose,
  certificates,
  onChangeCertificates,
  languageSpecs,
  onChangeLanguageSpecs,
  skills,
  onChangeSkills,
  profileMeta,
  onChangeProfileMeta,
}) => {
  const [certSearchQuery, setCertSearchQuery] = useState('');
  const [certCategory, setCertCategory] = useState<CertCategory>('전체');
  const [selectedLangExam, setSelectedLangExam] = useState<string>('TOEIC');
  const [langScoreInput, setLangScoreInput] = useState<string>(
    () =>
      languageSpecs
        .find((s) => s.exam === 'TOEIC')
        ?.value.replace(/[^0-9]/g, '') ?? ''
  );
  const [langGradeInput, setLangGradeInput] = useState<string>('IM2');
  const [langAcquiredDate, setLangAcquiredDate] = useState<string>(
    () => languageSpecs.find((s) => s.exam === 'TOEIC')?.acquiredDate ?? ''
  );
  const [skillInput, setSkillInput] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);

  const currentLangSpec = useMemo(
    () => LANGUAGE_EXAMS.find((e) => e.name === selectedLangExam) ?? LANGUAGE_EXAMS[0],
    [selectedLangExam]
  );

  // Sync score/grade/date input whenever languageSpecs changes externally or modal reopens
  useEffect(() => {
    if (!isOpen) return;
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
  }, [isOpen, currentLangSpec, languageSpecs]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  const filteredCertifications = useMemo(() => {
    const query = certSearchQuery.trim().toLowerCase();
    return OFFICIAL_CERTIFICATIONS.filter((cert) => {
      if (cert.category === '어학') return false;
      const matchCategory = certCategory === '전체' || cert.category === certCategory;
      const matchQuery =
        !query ||
        cert.name.toLowerCase().includes(query) ||
        cert.issuer.toLowerCase().includes(query) ||
        cert.category.toLowerCase().includes(query);
      return matchCategory && matchQuery;
    });
  }, [certSearchQuery, certCategory]);

  if (!isOpen) return null;

  const showTempFeedback = (msg: string) => {
    setFeedback(msg);
    window.setTimeout(() => {
      setFeedback((prev) => (prev === msg ? null : prev));
    }, 2400);
  };

  const handleToggleCert = (certName: string) => {
    onChangeCertificates((prev) => {
      if (prev.includes(certName)) {
        showTempFeedback(`'${certName}' 해제됨`);
        return prev.filter((item) => item !== certName);
      }
      showTempFeedback(`'${certName}' 추가됨`);
      return [...prev, certName];
    });
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

  const handleApplyScore = () => {
    const cleanDate = langAcquiredDate.trim() || undefined;
    if (currentLangSpec.mode === 'score') {
      const raw = langScoreInput.trim();
      if (!raw) return;
      const num = Number(raw);
      const maxScore = currentLangSpec.maxScore ?? 9999;
      if (!Number.isFinite(num) || num < 0 || num > maxScore) {
        showTempFeedback(`0~${maxScore}${currentLangSpec.unit ?? '점'} 범위로 입력하세요`);
        return;
      }
      const normalizedScore = String(Math.round(num));
      const formatted = `${normalizedScore}${currentLangSpec.unit ?? '점'}`;
      onChangeLanguageSpecs((prev) => {
        const exists = prev.some((s) => s.exam === currentLangSpec.name);
        const entry: LanguageSpec = {
          exam: currentLangSpec.name,
          value: formatted,
          ...(cleanDate ? { acquiredDate: cleanDate } : {}),
        };
        return exists
          ? prev.map((s) => (s.exam === currentLangSpec.name ? entry : s))
          : [...prev, entry];
      });
      showTempFeedback(`${currentLangSpec.name} ${formatted} 반영됨`);
    } else {
      if (!langGradeInput) return;
      onChangeLanguageSpecs((prev) => {
        const exists = prev.some((s) => s.exam === currentLangSpec.name);
        const entry: LanguageSpec = {
          exam: currentLangSpec.name,
          value: langGradeInput,
          ...(cleanDate ? { acquiredDate: cleanDate } : {}),
        };
        return exists
          ? prev.map((s) => (s.exam === currentLangSpec.name ? entry : s))
          : [...prev, entry];
      });
      showTempFeedback(`${currentLangSpec.name} ${langGradeInput} 반영됨`);
    }
  };

  const handleToggleSkill = (skillName: string) => {
    const trimmed = skillName.trim();
    if (!trimmed) return;
    onChangeSkills((prev) => {
      const exists = prev.some((s) => s.toLowerCase() === trimmed.toLowerCase());
      if (exists) {
        showTempFeedback(`'${trimmed}' 역량 삭제됨`);
        return prev.filter((s) => s.toLowerCase() !== trimmed.toLowerCase());
      }
      showTempFeedback(`'${trimmed}' 역량 추가됨`);
      return [...prev, trimmed];
    });
  };

  const handleAddCustomSkill = () => {
    const trimmed = skillInput.trim();
    if (!trimmed) return;
    const exists = skills.some((s) => s.toLowerCase() === trimmed.toLowerCase());
    if (!exists) {
      onChangeSkills((prev) => [...prev, trimmed]);
      showTempFeedback(`'${trimmed}' 역량 추가됨`);
    }
    setSkillInput('');
  };

  const handleRemoveLanguageSpec = (examName: string) => {
    onChangeLanguageSpecs((prev) => prev.filter((s) => s.exam !== examName));
    showTempFeedback(`${examName} 삭제됨`);
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-primary/35 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[480px] sm:max-w-[520px] bg-surface-container-lowest rounded-t-3xl sm:rounded-3xl p-5 max-h-[86vh] flex flex-col shadow-2xl border border-[#e6edf7]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between pb-3 mb-3 border-b border-surface-container-high">
          <div className="flex items-center gap-2.5">
            <Mascot variant="explaining" size="md" />
            <div>
              <h3 className="font-headline-sm text-headline-sm text-on-surface leading-tight">
                내 스펙 프로필 관리
              </h3>
              <p className="font-label-sm text-label-sm text-on-surface-variant font-normal">
                입력해 두면 공정이가 지원 가능 여부와 가산점을 바로 계산해 드려요
              </p>
            </div>
          </div>
          <button
            type="button"
            aria-label="닫기"
            onClick={onClose}
            className="w-9 h-9 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-container-high"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto space-y-4 pr-0.5">
          {/* 학력 · 경력 연차 */}
          <div className="space-y-2">
            <h4 className="font-label-md text-label-md text-on-surface">
              학력 · 경력 기준
            </h4>
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
                className="w-full px-2.5 py-2 bg-surface-container-low rounded-lg text-on-surface font-body-sm text-body-sm focus:outline-none focus:ring-2 focus:ring-secondary/20"
              >
                {EDUCATION_OPTIONS.map((opt) => (
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
                className="w-full px-2.5 py-2 bg-surface-container-low rounded-lg text-on-surface font-body-sm text-body-sm focus:outline-none focus:ring-2 focus:ring-secondary/20"
              >
                {CAREER_OPTIONS.map((opt) => (
                  <option key={opt.label} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* 공인 어학 성적 */}
          <div className="space-y-2 pt-2 border-t border-surface-container-high">
            <h4 className="font-label-md text-label-md text-on-surface">
              내 공인 어학 성적
            </h4>
            {languageSpecs.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {languageSpecs.map((spec) => {
                  const expiry = getLanguageExpiryInfo(spec.acquiredDate);
                  return (
                    <button
                      key={spec.exam}
                      type="button"
                      onClick={() => handleRemoveLanguageSpec(spec.exam)}
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
                value={selectedLangExam}
                onChange={(e) => handleSelectLanguageExamChange(e.target.value)}
                className="w-[132px] shrink-0 px-2.5 py-2 bg-surface-container-low rounded-lg text-on-surface font-label-md text-label-md focus:outline-none focus:ring-2 focus:ring-secondary/20"
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
                    placeholder={currentLangSpec.placeholder ?? '점수'}
                    className="w-full pl-3 pr-7 py-2 bg-surface-container-low rounded-lg text-on-surface font-body-md text-body-md focus:outline-none focus:ring-2 focus:ring-secondary/20"
                  />
                  <span className="absolute right-2.5 top-1/2 -translate-y-1/2 font-label-sm text-label-sm text-on-surface-variant">
                    {currentLangSpec.unit ?? '점'}
                  </span>
                </div>
              ) : (
                <select
                  value={langGradeInput}
                  onChange={(e) => setLangGradeInput(e.target.value)}
                  className="flex-1 min-w-0 px-3 py-2 bg-surface-container-low rounded-lg text-on-surface font-body-md text-body-md focus:outline-none focus:ring-2 focus:ring-secondary/20"
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
                className="px-3.5 py-2 rounded-lg bg-primary text-on-primary font-label-md text-label-md shrink-0"
              >
                적용
              </button>
            </div>

            <div className="flex items-center gap-2">
              <span className="font-label-sm text-label-sm text-on-surface-variant font-normal shrink-0">
                시험 취득일(선택·2년 만료 체크):
              </span>
              <input
                type="date"
                aria-label="어학 성적 취득일"
                value={langAcquiredDate}
                onChange={(e) => setLangAcquiredDate(e.target.value)}
                className="flex-1 min-w-0 px-2.5 py-1.5 bg-surface-container-low rounded-lg text-on-surface font-body-sm text-body-sm focus:outline-none focus:ring-2 focus:ring-secondary/20"
              />
            </div>
          </div>

          {/* 보유 자격증 */}
          <div className="space-y-2 pt-2 border-t border-surface-container-high">
            <div className="flex items-center justify-between">
              <h4 className="font-label-md text-label-md text-on-surface">
                보유 자격증 ({certificates.length}개)
              </h4>
              {feedback && (
                <span className="font-label-sm text-label-sm text-on-tertiary-fixed-variant">
                  {feedback}
                </span>
              )}
            </div>

            {certificates.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {certificates.map((cert) => (
                  <button
                    key={cert}
                    type="button"
                    onClick={() => handleToggleCert(cert)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-secondary-fixed text-on-secondary-fixed font-label-sm text-label-sm active:opacity-75"
                  >
                    <span>{cert}</span>
                    <span className="material-symbols-outlined text-[14px]">close</span>
                  </button>
                ))}
              </div>
            )}

            <div className="relative">
              <span className="material-symbols-outlined text-outline text-[18px] absolute left-3 top-1/2 -translate-y-1/2">
                search
              </span>
              <input
                type="text"
                value={certSearchQuery}
                onChange={(e) => setCertSearchQuery(e.target.value)}
                placeholder="공식 자격증 검색 (예: 전기기사, 한국사)"
                className="w-full pl-9 pr-3 py-2 bg-surface-container-low rounded-xl text-on-surface font-body-sm text-body-sm placeholder:text-outline/70 focus:outline-none focus:ring-2 focus:ring-secondary/20"
              />
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
              {CERT_CATEGORIES.filter((c) => c !== '어학').map((category) => {
                const isActive = certCategory === category;
                return (
                  <button
                    key={category}
                    type="button"
                    onClick={() => setCertCategory(category)}
                    className={`shrink-0 px-2.5 py-1 rounded-full font-label-sm text-label-sm ${
                      isActive
                        ? 'bg-secondary text-on-secondary'
                        : 'bg-surface-container-low text-on-surface-variant'
                    }`}
                  >
                    {category}
                  </button>
                );
              })}
            </div>

            <div className="space-y-1.5 max-h-[220px] overflow-y-auto pr-0.5">
              {filteredCertifications.map((cert) => {
                const isSelected = certificates.includes(cert.name);
                return (
                  <button
                    key={cert.name}
                    type="button"
                    onClick={() => handleToggleCert(cert.name)}
                    className={`w-full flex items-center justify-between gap-2 p-2.5 rounded-xl text-left transition-colors ${
                      isSelected
                        ? 'bg-secondary-fixed/70 text-on-secondary-fixed'
                        : 'bg-surface-container-low text-on-surface hover:bg-surface-container'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-body-sm text-body-sm font-semibold truncate">
                        {cert.name}
                      </p>
                      <p className="font-label-sm text-label-sm text-on-surface-variant font-normal truncate">
                        {cert.issuer} · {cert.category}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-label-sm text-label-sm ${
                        isSelected
                          ? 'bg-secondary text-on-secondary'
                          : 'bg-surface-container-highest text-on-surface-variant'
                      }`}
                    >
                      <span className="material-symbols-outlined text-[13px]">
                        {isSelected ? 'check' : 'add'}
                      </span>
                      {isSelected ? '보유' : '선택'}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 직무 역량 · 기술스택 (사기업 우대/자격 매칭용) */}
          <div className="space-y-2.5 pt-3 border-t border-surface-container-high">
            <div>
              <h4 className="font-label-md text-label-md text-on-surface">
                내 직무 역량 · 기술스택 ({skills.length}개)
              </h4>
              <p className="font-label-sm text-label-sm text-on-surface-variant font-normal">
                사기업 기술요건·우대사항 매칭에 사용됩니다
              </p>
            </div>

            {skills.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {skills.map((skill) => (
                  <button
                    key={skill}
                    type="button"
                    onClick={() => handleToggleSkill(skill)}
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
                    handleAddCustomSkill();
                  }
                }}
                placeholder="직접 입력 (예: FastAPI, SAP, 데이터분석)"
                className="flex-1 min-w-0 px-3 py-2 bg-surface-container-low rounded-lg text-on-surface font-body-sm text-body-sm placeholder:text-outline/70 focus:outline-none focus:ring-2 focus:ring-secondary/20"
              />
              <button
                type="button"
                onClick={handleAddCustomSkill}
                className="px-3.5 py-2 rounded-lg bg-primary text-on-primary font-label-md text-label-md shrink-0"
              >
                추가
              </button>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {PRESET_SKILLS.map((preset) => {
                const active = skills.some(
                  (s) => s.toLowerCase() === preset.toLowerCase()
                );
                return (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => handleToggleSkill(preset)}
                    className={`px-2.5 py-1 rounded-full font-label-sm text-label-sm transition-colors ${
                      active
                        ? 'bg-secondary text-on-secondary'
                        : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container'
                    }`}
                  >
                    {active ? `✓ ${preset}` : `+ ${preset}`}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="pt-3 mt-3 border-t border-surface-container-high">
          <button
            type="button"
            onClick={onClose}
            className="w-full h-11 rounded-xl bg-primary text-on-primary font-label-md text-label-md active:opacity-90"
          >
            저장 완료
          </button>
        </div>
      </div>
    </div>
  );
};
