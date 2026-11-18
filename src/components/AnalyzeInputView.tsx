import React, { useRef, useState } from 'react';
import { Mascot } from './Mascot';

export type CompanyTypeHint = 'auto' | '공기업' | '사기업';

export interface UrgentNoticeItem {
  id: string;
  organization: string;
  diffDays: number;
}

interface AnalyzeInputViewProps {
  text: string;
  onChangeText: (value: string) => void;
  selectedFiles: File[];
  onChangeFiles: (files: File[]) => void;
  companyTypeHint: CompanyTypeHint;
  onChangeCompanyTypeHint: (hint: CompanyTypeHint) => void;
  sourceUrl?: string | null;
  onChangeSourceUrl?: (url: string | null) => void;
  urgentNotices?: UrgentNoticeItem[];
  onOpenUrgentAnnouncement?: (id: string) => void;
  onAnalyze: () => void;
  onCancelAnalyze?: () => void;
  isLoading: boolean;
  errorMessage: string | null;
  onClearError: () => void;
  onOpenGuide?: () => void;
}

const PUBLIC_SAMPLE_NOTICE = `[한국전력거래소(KPX) 2026년 상반기 신입직원 채용공고]
1. 채용분야: 전기직(일반직 5급) 총 14명 · 일반정규직
2. 근무지: 전남 나주 본사 및 서울 경인지사
3. 원서접수: 2026. 11. 24(화) 10:00 ~ 2026. 12. 01(화) 18:00까지
4. 지원자격
 - 연령/학력: 제한 없음 (블라인드 채용)
 - 어학성적: 토익 750점 이상 또는 오픽 IM2 이상
 - 필수자격증: 전기기사 또는 전기산업기사 자격증 소지자
5. 전형절차: 서류전형(30배수) > 필기전형(전공 50%, NCS 50%, 2026.12.19) > 면접전형(직무 및 종합인성, 2027.01.07) > 최종합격자 발표(2027.01.20 14:00)
6. 우대사항: 발전소 운용 경험자, 한국사능력검정 1급(서류전형 2점 가산), 전기기사 보유자(서류전형 5점 가산)
7. 제출서류: 입사지원서 및 직무수행계획서, 공인어학성적표 사본, 전기기사 자격증 사본, 졸업(예정)증명서 원본
8. 자기소개서 문항:
 - [문항1] 지원 직무와 관련된 본인의 핵심 역량과 준비 과정을 구체적으로 기술하시오. (700자 이내)
 - [문항2] 조직 협업 중 갈등을 해결하고 공동 목표를 달성한 경험을 기술하시오. (700자 이내)`;

const PRIVATE_SAMPLE_NOTICE = `[네이버클라우드] 데이터 엔지니어 (신입/주니어) 수시채용
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
 - GitHub 링크 또는 기술 포트폴리오
9. 사전 질문:
 - [문항1] 본인이 진행한 데이터/개발 프로젝트 중 가장 기술적으로 어려웠던 문제와 해결 과정을 기술해 주세요. (1,000자 이내)`;

export const AnalyzeInputView: React.FC<AnalyzeInputViewProps> = ({
  text,
  onChangeText,
  selectedFiles,
  onChangeFiles,
  companyTypeHint,
  onChangeCompanyTypeHint,
  sourceUrl = null,
  onChangeSourceUrl,
  urgentNotices = [],
  onOpenUrgentAnnouncement,
  onAnalyze,
  onCancelAnalyze,
  isLoading,
  errorMessage,
  onClearError,
  onOpenGuide,
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileNotice, setFileNotice] = useState<string | null>(null);
  const [urlInput, setUrlInput] = useState('');
  const [isFetchingUrl, setIsFetchingUrl] = useState(false);
  const [urlNotice, setUrlNotice] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [dismissedUrgent, setDismissedUrgent] = useState(false);

  const isSupportedFile = (file: File): boolean => {
    const type = file.type.toLowerCase();
    if (type === 'application/pdf' || type.startsWith('image/')) return true;
    const lowerName = file.name.toLowerCase();
    return /\.(pdf|png|jpe?g|webp|gif|heic|heif|bmp)$/i.test(lowerName);
  };

  const handleFetchUrl = async () => {
    const trimmedUrl = urlInput.trim();
    if (!trimmedUrl) {
      setUrlNotice({ type: 'err', text: '채용공고 링크(URL)를 먼저 입력해 주세요.' });
      return;
    }

    setIsFetchingUrl(true);
    setUrlNotice(null);
    onClearError();

    try {
      const resp = await fetch('/api/fetch-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: trimmedUrl }),
      });
      const payload = await resp.json().catch(() => null);
      if (!resp.ok || !payload?.text) {
        setUrlNotice({
          type: 'err',
          text:
            payload?.error ||
            '링크에서 본문을 불러오지 못했어요. 공고를 복사해 아래 칸에 붙여넣어 주세요.',
        });
        return;
      }
      onChangeText(String(payload.text).slice(0, 30000));
      const resolvedUrl =
        typeof payload.finalUrl === 'string' && payload.finalUrl
          ? payload.finalUrl
          : trimmedUrl;
      onChangeSourceUrl?.(resolvedUrl);
      setUrlNotice({
        type: 'ok',
        text: '공고 본문을 불러왔습니다. 내용 확인 후 정리하기를 눌러주세요.',
      });
      textareaRef.current?.focus();
    } catch {
      setUrlNotice({
        type: 'err',
        text: '링크를 불러오지 못했어요. 본문을 복사해 아래 칸에 붙여넣어 주세요.',
      });
    } finally {
      setIsFetchingUrl(false);
    }
  };

  const handlePasteClipboard = async () => {
    try {
      const clipText = await navigator.clipboard.readText();
      if (clipText) {
        onChangeText(clipText.slice(0, 30000));
        onChangeSourceUrl?.(null);
        setUrlNotice(null);
        onClearError();
        textareaRef.current?.focus();
      }
    } catch {
      textareaRef.current?.focus();
    }
  };

  const handleClearText = () => {
    onChangeText('');
    onChangeSourceUrl?.(null);
    setUrlNotice(null);
    onClearError();
    textareaRef.current?.focus();
  };

  const handleSampleFill = (kind: '공기업' | '사기업') => {
    onChangeCompanyTypeHint(kind);
    onChangeText(kind === '공기업' ? PUBLIC_SAMPLE_NOTICE : PRIVATE_SAMPLE_NOTICE);
    setUrlInput('');
    onChangeSourceUrl?.(null);
    setUrlNotice(null);
    onClearError();
    textareaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    textareaRef.current?.focus();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files ? Array.from(e.target.files) : [];
    if (picked.length > 0) {
      const merged = [...selectedFiles];
      let skippedInvalid = false;
      let skippedLimit = false;

      for (const f of picked) {
        if (!isSupportedFile(f)) {
          skippedInvalid = true;
          continue;
        }
        const alreadyExists = merged.some(
          (m) => m.name === f.name && m.size === f.size
        );
        if (alreadyExists) continue;
        if (merged.length >= 5) {
          skippedLimit = true;
          continue;
        }
        merged.push(f);
      }

      if (skippedInvalid) {
        setFileNotice('PDF 또는 이미지 파일(PNG, JPG, WEBP)만 첨부할 수 있습니다.');
      } else if (skippedLimit) {
        setFileNotice('첨부 파일은 최대 5개까지만 추가할 수 있습니다.');
      } else if (merged.reduce((acc, f) => acc + f.size, 0) > 30 * 1024 * 1024) {
        setFileNotice('첨부 파일 합계가 30MB를 초과했습니다. 일부 파일을 제외해 주세요.');
      } else {
        setFileNotice(null);
      }

      onChangeFiles(merged);
      onClearError();
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleRemoveFile = (idx: number) => {
    const next = selectedFiles.filter((_, i) => i !== idx);
    onChangeFiles(next);
    onClearError();
    if (next.reduce((acc, f) => acc + f.size, 0) <= 30 * 1024 * 1024) {
      setFileNotice(null);
    }
  };

  const charCount = text.length;
  const hasValidationError = Boolean(errorMessage);
  const totalBytes = selectedFiles.reduce((acc, f) => acc + f.size, 0);

  const hintOptions: Array<{ id: CompanyTypeHint; label: string }> = [
    { id: 'auto', label: '자동 구분' },
    { id: '공기업', label: '공기업·공공기관' },
    { id: '사기업', label: '사기업·IT·대기업' },
  ];

  return (
    <div className="w-full pb-6 lg:pb-8">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-6 items-start">
        {/* Left Column: Cohesive Gongjeongi Hero + Quick Samples & Urgent Bell */}
        <div className="lg:col-span-5 flex flex-col gap-3.5">
          {(() => {
            const hasReadyInput = text.trim().length > 0 || selectedFiles.length > 0;
            const heroVariant = isFetchingUrl
              ? 'analyzing'
              : errorMessage
                ? 'explaining'
                : hasReadyInput
                  ? 'saved'
                  : 'hello';
            const heroAnimation = isFetchingUrl ? 'analyzing' : 'float';
            const heroTitle = isFetchingUrl
              ? '공고 링크에서 본문을 읽고 있어요!'
              : errorMessage
                ? '입력 내용을 한 번 확인해 주세요!'
                : hasReadyInput
                  ? '준비 완료! 핵심만 정리해 드릴게요.'
                  : '오늘도 필요한 공고를 찾아볼까요?';
            const heroDesc = hasReadyInput
              ? '아래 [공고 핵심 정리하기]를 누르면 일정·자격·서류를 바로 정리해 드려요.'
              : '긴 공고에서 일정·지원 자격·내 스펙 매칭·서류·자소서까지 깔끔하게 정리해 드려요.';

            return (
              <section className="brand-card rounded-3xl p-4 sm:p-5 space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex flex-col gap-2 min-w-0 flex-1">
                    <div className="bg-secondary-fixed/70 rounded-2xl rounded-br-sm px-3.5 py-2.5">
                      <div className="flex items-center justify-between gap-2 mb-0.5">
                        <p className="text-label-sm font-label-sm text-secondary truncate">
                          공식 안내 도우미 공정이
                        </p>
                        {onOpenGuide && (
                          <button
                            type="button"
                            onClick={onOpenGuide}
                            className="text-[11px] font-semibold text-secondary hover:underline shrink-0 whitespace-nowrap"
                          >
                            사용법
                          </button>
                        )}
                      </div>
                      <h1 className="text-headline-md font-headline-md text-primary tracking-tight leading-snug">
                        {heroTitle}
                      </h1>
                    </div>
                    <p className="text-body-sm font-body-sm text-on-surface-variant leading-relaxed px-0.5">
                      {heroDesc}
                    </p>
                  </div>
                  {onOpenGuide ? (
                    <button
                      type="button"
                      onClick={onOpenGuide}
                      aria-label="공정이 사용법 안내 열기"
                      title="눌러서 공정이 사용법 보기"
                      className="shrink-0 rounded-2xl p-0.5 hover:scale-105 active:scale-95 transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary/40"
                    >
                      <Mascot variant={heroVariant} size="2xl" animation={heroAnimation} />
                    </button>
                  ) : (
                    <Mascot variant={heroVariant} size="2xl" animation={heroAnimation} />
                  )}
                </div>

                {/* 빠른 체험 예시 (Hero 하단 통합) */}
                <div className="pt-3 border-t border-[#edf2f9] space-y-2">
                  <span className="text-label-sm font-label-sm text-on-surface-variant block">
                    예시 공고로 바로 체험해 보기
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      id="sample-fill-btn"
                      type="button"
                      onClick={() => handleSampleFill('공기업')}
                      disabled={isLoading || isFetchingUrl}
                      className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-surface-container-low/80 hover:bg-secondary-fixed/60 transition-colors active:scale-[0.99] text-left disabled:opacity-60"
                    >
                      <span className="w-7 h-7 rounded-lg bg-secondary-fixed text-secondary flex items-center justify-center shrink-0">
                        <span className="material-symbols-outlined text-[16px]">
                          account_balance
                        </span>
                      </span>
                      <div className="min-w-0 flex-1">
                        <span className="text-label-sm font-label-sm text-primary block truncate">
                          공기업 예시
                        </span>
                        <span className="text-[11px] text-on-surface-variant block truncate">
                          한국전력거래소
                        </span>
                      </div>
                    </button>

                    <button
                      id="sample-private-btn"
                      type="button"
                      onClick={() => handleSampleFill('사기업')}
                      disabled={isLoading || isFetchingUrl}
                      className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-surface-container-low/80 hover:bg-tertiary-fixed/50 transition-colors active:scale-[0.99] text-left disabled:opacity-60"
                    >
                      <span className="w-7 h-7 rounded-lg bg-tertiary-fixed text-on-tertiary-fixed flex items-center justify-center shrink-0">
                        <span className="material-symbols-outlined text-[16px]">terminal</span>
                      </span>
                      <div className="min-w-0 flex-1">
                        <span className="text-label-sm font-label-sm text-primary block truncate">
                          사기업 예시
                        </span>
                        <span className="text-[11px] text-on-surface-variant block truncate">
                          IT 데이터 직무
                        </span>
                      </div>
                    </button>
                  </div>
                </div>
              </section>
            );
          })()}

          {/* D-3 마감 임박 알림 배너 (공정이 노란 종 포인트) */}
          {!dismissedUrgent && urgentNotices.length > 0 && (
            <div className="rounded-2xl bg-[var(--color-bell-soft)] border border-[var(--color-bell-border)] text-[var(--color-bell-ink)] px-3.5 py-3 flex items-center justify-between gap-2 shadow-2xs">
              <button
                type="button"
                onClick={() => onOpenUrgentAnnouncement?.(urgentNotices[0].id)}
                className="flex items-center gap-2.5 min-w-0 flex-1 text-left min-h-[28px]"
              >
                <span className="w-8 h-8 rounded-xl bg-amber-200/70 text-amber-800 flex items-center justify-center shrink-0">
                  <span
                    className="material-symbols-outlined text-[18px]"
                    style={{ fontVariationSettings: "'FILL' 1" }}
                  >
                    notifications_active
                  </span>
                </span>
                <span className="font-label-sm text-label-sm truncate tabular-nums">
                  {urgentNotices[0].diffDays === 0
                    ? 'D-Day'
                    : `D-${urgentNotices[0].diffDays}`}{' '}
                  · {urgentNotices[0].organization}
                  {urgentNotices.length > 1 ? ` 외 ${urgentNotices.length - 1}건` : ''} 마감 임박
                </span>
                <span className="font-label-sm text-label-sm underline shrink-0 whitespace-nowrap">
                  보기
                </span>
              </button>
              <button
                type="button"
                aria-label="마감 알림 닫기"
                onClick={() => setDismissedUrgent(true)}
                className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-amber-900/10 shrink-0"
              >
                <span className="material-symbols-outlined text-[16px]">close</span>
              </button>
            </div>
          )}
        </div>

        {/* Right Column: Unified Input Composer & Primary CTA */}
        <div className="lg:col-span-7 flex flex-col gap-3.5">
          <div className="brand-card rounded-3xl p-4 sm:p-5 space-y-4">
            {/* 기업 유형 선택 세그먼트 */}
            <div className="grid grid-cols-3 gap-1 p-1 bg-surface-container rounded-xl">
              {hintOptions.map((opt) => {
                const active = companyTypeHint === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    disabled={isLoading}
                    onClick={() => onChangeCompanyTypeHint(opt.id)}
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

            {/* 공고 본문 입력 */}
            <div>
              <div className="flex items-center justify-between gap-2 mb-2">
                <label
                  className="text-label-md font-label-md text-primary flex items-center gap-1.5"
                  htmlFor="notice-textarea"
                >
                  <span className="material-symbols-outlined text-secondary text-[18px]">
                    subject
                  </span>
                  공고 내용 입력
                </label>
                <div className="flex items-center gap-1.5 shrink-0">
                  {charCount > 0 && (
                    <button
                      type="button"
                      onClick={handleClearText}
                      disabled={isLoading}
                      className="inline-flex items-center gap-1 text-label-sm font-label-sm text-on-surface-variant hover:text-error transition-colors bg-surface-container-low px-2.5 py-1 rounded-lg disabled:opacity-60 whitespace-nowrap"
                    >
                      <span className="material-symbols-outlined text-[14px]">delete_sweep</span>
                      지우기
                    </button>
                  )}
                  <button
                    id="paste-clipboard-btn"
                    type="button"
                    onClick={handlePasteClipboard}
                    disabled={isLoading}
                    className="inline-flex items-center gap-1 text-label-sm font-label-sm text-secondary hover:text-on-secondary-fixed-variant transition-colors active:opacity-70 bg-secondary-fixed/70 px-2.5 py-1 rounded-lg disabled:opacity-60 whitespace-nowrap"
                  >
                    <span className="material-symbols-outlined text-[14px]">content_paste</span>
                    붙여넣기
                  </button>
                </div>
              </div>

              <textarea
                ref={textareaRef}
                id="notice-textarea"
                rows={7}
                maxLength={30000}
                value={text}
                disabled={isLoading}
                onChange={(e) => {
                  onChangeText(e.target.value);
                  if (errorMessage) onClearError();
                }}
                placeholder={
                  '공기업·사기업 채용공고 내용을 붙여넣으세요\n\n예: 자격요건, 우대사항, 기술스택, 일정, 자소서 문항 등'
                }
                className={`w-full bg-surface-container-low/75 rounded-xl p-3.5 text-body-md font-body-md text-on-surface placeholder:text-outline/75 focus:outline-none focus:bg-surface-container-lowest focus:ring-2 focus:ring-secondary/20 transition-colors resize-y leading-relaxed ${
                  hasValidationError ? 'ring-2 ring-error' : ''
                }`}
              />

              <div className="flex items-center justify-between mt-2 text-label-sm font-label-sm text-on-surface-variant gap-2">
                <span className="text-outline truncate" id="field-hint">
                  우대사항·기술스택·자소서 포함 시 더 정확해요
                </span>
                <span
                  id="char-counter"
                  className={`font-medium tracking-tight tabular-nums shrink-0 ${
                    charCount > 0 ? 'text-secondary' : 'text-on-surface-variant'
                  }`}
                >
                  {charCount.toLocaleString()} / 30,000자
                </span>
              </div>
            </div>

            {/* 링크(URL) 불러오기 + PDF·이미지 첨부 통합 영역 */}
            <div className="pt-3 border-t border-[#edf2f9] space-y-2.5">
              <div className="flex items-center gap-1.5 bg-surface-container-low rounded-xl p-1.5 focus-within:ring-2 focus-within:ring-secondary/20">
                <span className="material-symbols-outlined text-secondary text-[18px] pl-1.5 shrink-0">
                  link
                </span>
                <input
                  id="notice-url-input"
                  type="url"
                  value={urlInput}
                  disabled={isLoading || isFetchingUrl}
                  onChange={(e) => {
                    const val = e.target.value;
                    setUrlInput(val);
                    if (!val.trim()) onChangeSourceUrl?.(null);
                    if (urlNotice) setUrlNotice(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleFetchUrl();
                    }
                  }}
                  placeholder="채용공고 링크(URL) 붙여넣기"
                  className="flex-1 min-w-0 px-1.5 py-1.5 bg-transparent text-body-sm font-body-sm text-on-surface placeholder:text-outline/75 focus:outline-none"
                />
                <button
                  type="button"
                  disabled={isLoading || isFetchingUrl}
                  onClick={handleFetchUrl}
                  className="px-3 py-1.5 rounded-lg bg-secondary-fixed hover:bg-secondary-fixed-dim/55 text-on-secondary-fixed font-label-sm text-label-sm shrink-0 whitespace-nowrap active:opacity-80 disabled:opacity-60 transition-colors"
                >
                  {isFetchingUrl ? '읽는 중...' : '불러오기'}
                </button>
              </div>

              {urlNotice && (
                <p
                  className={`text-label-sm font-label-sm font-normal leading-snug px-0.5 ${
                    urlNotice.type === 'err' ? 'text-error' : 'text-on-tertiary-fixed-variant'
                  }`}
                >
                  {urlNotice.text}
                </p>
              )}

              {sourceUrl && (
                <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-secondary-fixed/50 text-on-secondary-fixed text-label-sm font-label-sm">
                  <span className="truncate">연결된 원문: {sourceUrl}</span>
                  <button
                    type="button"
                    onClick={() => {
                      onChangeSourceUrl?.(null);
                      setUrlInput('');
                      setUrlNotice(null);
                    }}
                    aria-label="연결된 원문 링크 해제"
                    className="shrink-0 w-5 h-5 rounded-full hover:bg-black/10 flex items-center justify-center"
                  >
                    <span className="material-symbols-outlined text-[14px]">close</span>
                  </button>
                </div>
              )}

              <label
                htmlFor="file-input"
                className="flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl border border-dashed border-[#c7d6ed] bg-surface-container-low/50 hover:bg-secondary-fixed/35 hover:border-secondary/40 cursor-pointer transition-colors group"
              >
                <input
                  ref={fileInputRef}
                  id="file-input"
                  type="file"
                  accept=".pdf,image/*"
                  multiple
                  disabled={isLoading}
                  className="hidden"
                  onChange={handleFileChange}
                />
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="w-8 h-8 rounded-lg bg-secondary-fixed text-secondary flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-[19px]">attach_file_add</span>
                  </span>
                  <div className="min-w-0">
                    <span className="text-label-md font-label-md text-primary block truncate">
                      PDF·캡처 이미지 첨부
                    </span>
                    <span className="text-[11.5px] text-on-surface-variant block truncate">
                      최대 5개 · 합계 30MB 이하
                    </span>
                  </div>
                </div>
                <span className="text-label-sm font-label-sm text-secondary shrink-0 whitespace-nowrap">
                  {selectedFiles.length > 0
                    ? `${selectedFiles.length}/5개 (${(totalBytes / 1024 / 1024).toFixed(1)}MB)`
                    : '파일 선택'}
                </span>
              </label>

              {selectedFiles.length > 0 && (
                <div className="flex flex-wrap gap-1.5 w-full">
                  {selectedFiles.map((file, idx) => (
                    <div
                      key={`${file.name}-${file.size}-${idx}`}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-tertiary-fixed text-on-tertiary-fixed text-label-sm font-label-sm"
                    >
                      <span
                        className="material-symbols-outlined text-[14px]"
                        style={{ fontVariationSettings: "'FILL' 1" }}
                      >
                        check_circle
                      </span>
                      <span className="max-w-[180px] truncate">
                        {file.name} ({(file.size / 1024 / 1024).toFixed(1)}MB)
                      </span>
                      <button
                        type="button"
                        aria-label={`${file.name} 삭제`}
                        onClick={() => handleRemoveFile(idx)}
                        className="ml-0.5 rounded-full p-0.5 hover:bg-black/10"
                      >
                        <span className="material-symbols-outlined text-[14px]">close</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {fileNotice && (
                <p className="text-label-sm font-label-sm text-error">{fileNotice}</p>
              )}
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
          </div>

          {/* Primary CTA Container */}
          <div className="sticky bottom-[68px] lg:static pt-2 pb-1 lg:pt-0 lg:pb-0 bg-gradient-to-t from-surface via-surface to-transparent lg:bg-none">
            <button
              id="submit-analyze-btn"
              type="button"
              disabled={isLoading || isFetchingUrl}
              onClick={onAnalyze}
              className="w-full h-14 rounded-2xl bg-secondary hover:bg-on-secondary-fixed-variant text-on-secondary flex items-center justify-center gap-2 shadow-[0_8px_20px_rgba(30,100,232,0.22)] transition-all active:scale-[0.98] disabled:opacity-80 disabled:cursor-not-allowed whitespace-nowrap"
            >
              {isLoading ? (
                <>
                  <span className="material-symbols-outlined text-[20px] animate-spin text-white">
                    progress_activity
                  </span>
                  <span className="text-label-md font-label-md text-white text-[15px]">
                    정리 중...
                  </span>
                </>
              ) : (
                <>
                  <span
                    className="material-symbols-outlined text-[21px] text-amber-300"
                    style={{ fontVariationSettings: "'FILL' 1" }}
                  >
                    bolt
                  </span>
                  <span className="text-label-md font-label-md text-white text-[15px]">
                    공고 핵심 정리하기
                  </span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* AI 분석 진행 중 집중하는 공정이 오버레이 */}
      {isLoading && (
        <div
          role="status"
          aria-live="polite"
          className="fixed inset-0 z-50 bg-primary/25 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="w-full max-w-[340px] rounded-3xl brand-card p-7 text-center shadow-2xl space-y-3.5 mascot-pop">
            <Mascot
              variant="analyzing"
              size="2xl"
              animation="analyzing"
              className="mx-auto"
            />
            <div className="space-y-1">
              <p className="font-headline-sm text-headline-sm text-primary">
                공고의 핵심 내용을 분석하고 있어요.
              </p>
              <p className="font-body-sm text-body-sm text-on-surface-variant leading-snug">
                일정 · 지원 자격 · 가산점 · 자소서 문항을 정리 중입니다
              </p>
            </div>
            <div className="w-32 h-1.5 mx-auto rounded-full bg-surface-container-low overflow-hidden">
              <div className="h-full w-2/3 rounded-full bg-secondary animate-pulse" />
            </div>
            {onCancelAnalyze && (
              <button
                type="button"
                onClick={onCancelAnalyze}
                className="inline-flex items-center justify-center px-4 py-1.5 rounded-xl bg-surface-container hover:bg-surface-container-high text-on-surface-variant font-label-sm text-label-sm transition-colors"
              >
                분석 취소
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
