import React from 'react';
import type {
  CompanyType,
  RecommendSectorFilter,
  RecommendedCompany,
  SavedAnnouncement,
  SpecRecommendationResponse,
} from '../types';
import type { LanguageSpec, UserProfileMeta } from '../utils/specMatching';
import { Mascot } from './Mascot';

interface RecommendViewProps {
  certificates: string[];
  languageSpecs: LanguageSpec[];
  skills: string[];
  profileMeta: UserProfileMeta;
  savedAnnouncements: SavedAnnouncement[];
  sector: RecommendSectorFilter;
  onChangeSector: (sector: RecommendSectorFilter) => void;
  targetRole: string;
  onChangeTargetRole: (role: string) => void;
  result: SpecRecommendationResponse | null;
  isLoading: boolean;
  errorMessage: string | null;
  onRequestRecommend: () => void;
  onOpenSpecModal: () => void;
  onSaveRecommendedCompany: (rec: RecommendedCompany) => void;
  onOpenSavedAnnouncement: (id: string) => void;
  onGoAnalyzeWithHint: (companyType: CompanyType) => void;
}

function getFitBadgeStyle(fit: RecommendedCompany['fit_level']): string {
  switch (fit) {
    case '높음':
      return 'bg-tertiary-fixed text-on-tertiary-fixed';
    case '도전':
      return 'bg-[var(--color-bell-soft)] border border-[var(--color-bell-border)] text-[var(--color-bell-ink)]';
    default:
      return 'bg-secondary-fixed text-on-secondary-fixed';
  }
}

export const RecommendView: React.FC<RecommendViewProps> = ({
  certificates,
  languageSpecs,
  skills,
  profileMeta,
  savedAnnouncements,
  sector,
  onChangeSector,
  targetRole,
  onChangeTargetRole,
  result,
  isLoading,
  errorMessage,
  onRequestRecommend,
  onOpenSpecModal,
  onSaveRecommendedCompany,
  onOpenSavedAnnouncement,
  onGoAnalyzeWithHint,
}) => {
  const careerLabel =
    profileMeta.careerYears === 0
      ? '신입'
      : typeof profileMeta.careerYears === 'number'
        ? `경력 ${profileMeta.careerYears}년+`
        : '';

  const specSummaryParts = [
    profileMeta.education || null,
    careerLabel || null,
    certificates.length > 0 ? `자격증 ${certificates.length}개` : null,
    languageSpecs.length > 0
      ? languageSpecs.map((l) => `${l.exam} ${l.value}`).slice(0, 2).join(', ')
      : null,
    skills.length > 0 ? `역량 ${skills.length}개` : null,
  ].filter(Boolean);

  const hasAnySpec =
    certificates.length > 0 ||
    languageSpecs.length > 0 ||
    skills.length > 0 ||
    Boolean(profileMeta.education) ||
    (profileMeta.careerYears !== null && profileMeta.careerYears !== undefined);

  const sectorOptions: Array<{ id: RecommendSectorFilter; label: string }> = [
    { id: 'all', label: '전체 (공기업·사기업)' },
    { id: '공기업', label: '공기업·공공기관' },
    { id: '사기업', label: '사기업·IT·대기업' },
  ];

  const findSavedByOrg = (org: string): SavedAnnouncement | undefined => {
    const normalized = org.replace(/\s+/g, '').toLowerCase();
    return savedAnnouncements.find(
      (item) =>
        (item.analysis.organization ?? '').replace(/\s+/g, '').toLowerCase() ===
        normalized
    );
  };

  return (
    <div className="w-full space-y-5 pb-10">
      {/* Top Compact Config Card */}
      <section className="brand-card rounded-3xl p-4 sm:p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3.5 min-w-0 flex-1">
            <Mascot
              variant={isLoading ? 'analyzing' : result ? 'saved' : 'hello'}
              size="xl"
              animation={isLoading ? 'analyzing' : 'float'}
            />
            <div className="min-w-0 flex-1 space-y-1">
              <h1 className="font-headline-md text-headline-md text-primary tracking-tight">
                내 스펙 맞춤 기업 추천
              </h1>
              <p className="font-body-sm text-body-sm text-on-surface-variant leading-relaxed">
                {hasAnySpec
                  ? specSummaryParts.join(' · ')
                  : '등록된 스펙이 없어요. 내 스펙을 입력하거나 희망 직무를 적어 주세요.'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onOpenSpecModal}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-surface-container-low hover:bg-secondary-fixed/50 text-secondary font-label-sm text-label-sm transition-colors whitespace-nowrap shrink-0"
          >
            <span className="material-symbols-outlined text-[16px]">tune</span>
            <span>내 스펙 수정</span>
          </button>
        </div>

        <div className="pt-3 border-t border-[#edf2f9] space-y-3">
          {/* 기업 유형 선택 */}
          <div className="grid grid-cols-3 gap-1 p-1 bg-surface-container rounded-xl">
            {sectorOptions.map((opt) => {
              const active = sector === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  disabled={isLoading}
                  onClick={() => onChangeSector(opt.id)}
                  className={`min-h-[38px] px-2 rounded-lg text-label-sm font-label-sm transition-all whitespace-nowrap truncate ${
                    active
                      ? 'bg-surface-container-lowest text-secondary shadow-xs'
                      : 'text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>

          {/* 희망 직무 입력 + 추천받기 CTA */}
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={targetRole}
              disabled={isLoading}
              onChange={(e) => onChangeTargetRole(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !isLoading) {
                  e.preventDefault();
                  onRequestRecommend();
                }
              }}
              placeholder="희망 직무·지역·관심 분야 (예: 전기직, 백엔드, 수도권, 금융권 — 선택)"
              className="flex-1 min-w-0 px-3.5 py-2.5 bg-surface-container-low rounded-xl text-on-surface font-body-sm text-body-sm placeholder:text-outline/75 focus:bg-surface-container-lowest focus:outline-none focus:ring-2 focus:ring-secondary/20"
            />
            <button
              type="button"
              disabled={isLoading}
              onClick={onRequestRecommend}
              className="h-11 px-5 rounded-xl bg-secondary hover:bg-on-secondary-fixed-variant text-on-secondary font-label-md text-label-md inline-flex items-center justify-center gap-1.5 shadow-xs active:scale-[0.98] transition-all disabled:opacity-70 whitespace-nowrap shrink-0"
            >
              <span className="material-symbols-outlined text-[18px]">
                {isLoading ? 'progress_activity' : 'auto_awesome'}
              </span>
              <span>
                {isLoading
                  ? '분석 중...'
                  : result
                    ? '다시 추천받기'
                    : '맞춤 기업 추천받기'}
              </span>
            </button>
          </div>
        </div>

        {errorMessage && (
          <div
            role="alert"
            className="p-3 rounded-xl bg-error-container text-on-error-container flex items-center gap-2 text-body-sm font-body-sm font-medium"
          >
            <span className="material-symbols-outlined text-[18px] shrink-0">error</span>
            <span>{errorMessage}</span>
          </div>
        )}
      </section>

      {/* Loading State */}
      {isLoading && (
        <div
          role="status"
          aria-live="polite"
          className="brand-card rounded-3xl p-8 text-center space-y-3 mascot-pop"
        >
          <Mascot
            variant="analyzing"
            size="2xl"
            animation="analyzing"
            className="mx-auto"
          />
          <div className="space-y-1">
            <p className="font-headline-sm text-headline-sm text-primary">
              내 스펙에 맞는 기업과 직무를 찾고 있어요
            </p>
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              자격증 가산점 · 어학 기준 · 보유 역량을 바탕으로 매칭 중입니다
            </p>
          </div>
        </div>
      )}

      {/* Recommendation Results */}
      {!isLoading && result && result.recommendations.length > 0 && (
        <div className="space-y-4">
          {result.overall_advice && (
            <div className="brand-card rounded-2xl p-4 flex items-center gap-3.5">
              <Mascot variant="explaining" size="lg" />
              <div className="min-w-0 flex-1 space-y-0.5">
                <p className="font-label-sm text-label-sm text-secondary">
                  공정이가 본 내 스펙 포인트
                </p>
                <p className="font-body-sm text-body-sm text-on-surface leading-relaxed">
                  {result.overall_advice}
                </p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-stretch">
            {result.recommendations.map((rec, idx) => {
              const savedMatch = findSavedByOrg(rec.organization);
              const searchQuery = encodeURIComponent(
                `${rec.organization} ${rec.recommended_position} 채용공고`
              );
              const searchUrl = `https://www.google.com/search?q=${searchQuery}`;

              return (
                <article
                  key={`${rec.organization}-${idx}`}
                  className="brand-card rounded-2xl p-4 flex flex-col justify-between gap-3"
                >
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`px-2 py-0.5 rounded-md font-label-sm text-label-sm ${
                            rec.company_type === '공기업'
                              ? 'bg-secondary-fixed text-on-secondary-fixed'
                              : 'bg-surface-container-high text-on-surface-variant'
                          }`}
                        >
                          {rec.company_type}
                        </span>
                        <span className="font-label-sm text-label-sm text-on-surface-variant font-normal">
                          {rec.typical_hiring_period}
                        </span>
                      </div>
                      <span
                        className={`px-2 py-0.5 rounded-md font-label-sm text-label-sm ${getFitBadgeStyle(
                          rec.fit_level
                        )}`}
                      >
                        적합도 {rec.fit_level}
                      </span>
                    </div>

                    <div>
                      <h2 className="font-headline-sm text-headline-sm text-primary font-semibold">
                        {rec.organization}
                      </h2>
                      <p className="font-body-md text-body-md text-secondary font-medium mt-0.5">
                        {rec.recommended_position}
                      </p>
                    </div>

                    <div className="pt-2.5 border-t border-[#edf2f9] space-y-2">
                      <p className="font-body-sm text-body-sm text-on-surface leading-relaxed">
                        {rec.fit_summary}
                      </p>

                      {Array.isArray(rec.matched_specs) && rec.matched_specs.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {rec.matched_specs.slice(0, 3).map((spec, sIdx) => (
                            <span
                              key={sIdx}
                              className="px-2 py-0.5 rounded-md bg-tertiary-fixed/70 text-on-tertiary-fixed font-label-sm text-[11.5px]"
                            >
                              ✓ {spec}
                            </span>
                          ))}
                        </div>
                      )}

                      {rec.preparation_tip && (
                        <p className="font-body-sm text-body-sm text-on-surface-variant leading-snug">
                          <span className="font-semibold text-primary">준비 팁:</span>{' '}
                          {rec.preparation_tip}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="pt-2.5 border-t border-[#edf2f9] flex items-center justify-between gap-2 flex-wrap">
                    {savedMatch ? (
                      <button
                        type="button"
                        onClick={() => onOpenSavedAnnouncement(savedMatch.id)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-tertiary-fixed text-on-tertiary-fixed font-label-sm text-label-sm hover:opacity-90 transition-opacity whitespace-nowrap"
                      >
                        <span
                          className="material-symbols-outlined text-[15px]"
                          style={{ fontVariationSettings: "'FILL' 1" }}
                        >
                          bookmark_added
                        </span>
                        <span>내 공고함에 있음</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onSaveRecommendedCompany(rec)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-secondary-fixed hover:bg-secondary-fixed-dim/55 text-on-secondary-fixed font-label-sm text-label-sm transition-colors whitespace-nowrap"
                      >
                        <span className="material-symbols-outlined text-[15px]">
                          bookmark_add
                        </span>
                        <span>목표 공고로 저장</span>
                      </button>
                    )}

                    <div className="flex items-center gap-1.5">
                      <a
                        href={searchUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-surface-container-low hover:bg-surface-container text-on-surface-variant hover:text-secondary font-label-sm text-label-sm transition-colors whitespace-nowrap"
                      >
                        <span className="material-symbols-outlined text-[14px]">
                          open_in_new
                        </span>
                        <span>공고 검색</span>
                      </a>
                      <button
                        type="button"
                        onClick={() => onGoAnalyzeWithHint(rec.company_type)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-surface-container-low hover:bg-surface-container text-secondary font-label-sm text-label-sm transition-colors whitespace-nowrap"
                      >
                        <span>공고 분석</span>
                        <span className="material-symbols-outlined text-[14px]">
                          arrow_forward
                        </span>
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      )}

      {/* Empty Initial State */}
      {!isLoading && !result && (
        <div className="brand-card rounded-3xl p-7 text-center space-y-2">
          <p className="font-headline-sm text-headline-sm text-primary">
            보유 스펙과 잘 맞는 기업을 한눈에 골라드려요
          </p>
          <p className="font-body-sm text-body-sm text-on-surface-variant max-w-md mx-auto leading-relaxed">
            자격증 가산점이 큰 공기업부터 보유 기술스택과 어학 기준이 맞는 사기업까지
            추천받고, 마음에 드는 곳은 바로 목표 공고로 저장해 보세요.
          </p>
        </div>
      )}
    </div>
  );
};
