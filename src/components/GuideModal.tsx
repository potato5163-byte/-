import React, { useEffect, useState } from 'react';
import { Mascot, type MascotVariant } from './Mascot';

interface GuideModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface GuideSlide {
  variant: MascotVariant;
  badge: string;
  title: string;
  description: string;
  tips: string[];
}

const GUIDE_SLIDES: GuideSlide[] = [
  {
    variant: 'hello',
    badge: 'STEP 01 · 공고 자동 정리',
    title: '복잡한 공고도 핵심만 쏙!',
    description:
      '공고 링크(URL), PDF·캡처 이미지, 또는 붙여넣은 본문을 올리면 공정이가 일정·자격·서류·자소서 문항만 깔끔하게 추출해요.',
    tips: [
      '공기업과 사기업(IT·대기업) 양식을 모두 구분해 정리합니다.',
      '긴 원문에서 서류 마감일과 전형 단계를 자동으로 찾아줍니다.',
    ],
  },
  {
    variant: 'explaining',
    badge: 'STEP 02 · 내 스펙 실시간 매칭',
    title: '내 스펙으로 지원 가능한지 바로 확인!',
    description:
      '우측 상단 [내 스펙]에 학력·경력·자격증·어학(2년 만료 체크)·기술스택을 입력해 두면 공고마다 충족 여부와 예상 가산점을 즉시 계산해 드려요.',
    tips: [
      '어학 성적 취득일을 넣으면 서류 마감일 기준 만료 여부를 알려줘요.',
      '우대·가산점 항목은 중복 제한에 맞춰 직접 켜고 끌 수 있습니다.',
    ],
  },
  {
    variant: 'saved',
    badge: 'STEP 03 · 일정·자소서·비교 관리',
    title: '마감일 놓치지 않게 한곳에서 관리!',
    description:
      '저장한 공고들은 마감순 정렬, 2개 공고 비교(일정 겹침 체크), 통합 일정 캘린더(.ics) 저장, 자소서 초안 작성과 CSV·JSON 백업까지 모두 지원해요.',
    tips: [
      'D-3 이내로 다가온 지원 예정 공고는 상단 알림으로 챙겨드려요.',
      '요약 복사 버튼으로 스터디나 노션에 공고 핵심만 바로 공유하세요.',
    ],
  },
];

export const GuideModal: React.FC<GuideModalProps> = ({ isOpen, onClose }) => {
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!isOpen) {
      setStep(0);
      return;
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const current = GUIDE_SLIDES[step];
  const isLast = step === GUIDE_SLIDES.length - 1;

  return (
    <div
      className="fixed inset-0 z-50 bg-primary/35 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="공고정리 사용법 안내"
        className="w-full max-w-[480px] sm:max-w-[460px] bg-surface-container-lowest rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl border border-[#e6edf7] space-y-5 mascot-pop"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <span className="font-label-sm text-label-sm text-secondary">
            {current.badge}
          </span>
          <button
            type="button"
            aria-label="안내 닫기"
            onClick={onClose}
            className="w-9 h-9 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-container-low"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        <div className="text-center space-y-3">
          <Mascot
            variant={current.variant}
            size="2xl"
            animation={step === 0 ? 'float' : 'pop'}
            className="mx-auto"
          />
          <div className="space-y-1.5">
            <h2 className="font-headline-md text-headline-md text-primary">
              {current.title}
            </h2>
            <p className="font-body-sm text-body-sm text-on-surface-variant leading-relaxed">
              {current.description}
            </p>
          </div>
        </div>

        <div className="rounded-2xl bg-surface-container-low p-3.5 space-y-2">
          {current.tips.map((tip, idx) => (
            <div key={idx} className="flex items-start gap-2 text-left">
              <span
                className="material-symbols-outlined text-[16px] text-secondary shrink-0 mt-0.5"
                style={{ fontVariationSettings: "'FILL' 1" }}
              >
                check_circle
              </span>
              <p className="font-body-sm text-body-sm text-on-surface leading-snug">
                {tip}
              </p>
            </div>
          ))}
        </div>

        {/* Pagination Dots */}
        <div className="flex items-center justify-center gap-2">
          {GUIDE_SLIDES.map((_, idx) => (
            <button
              key={idx}
              type="button"
              aria-label={`${idx + 1}단계로 이동`}
              onClick={() => setStep(idx)}
              className={`h-2 rounded-full transition-all ${
                idx === step
                  ? 'w-6 bg-secondary'
                  : 'w-2 bg-surface-container-highest hover:bg-outline-variant'
              }`}
            />
          ))}
        </div>

        <div className="flex items-center gap-2">
          {step > 0 && (
            <button
              type="button"
              onClick={() => setStep((prev) => Math.max(0, prev - 1))}
              className="h-12 px-4 rounded-xl bg-surface-container hover:bg-surface-container-high text-on-surface font-label-md text-label-md transition-colors whitespace-nowrap"
            >
              이전
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              if (isLast) {
                onClose();
              } else {
                setStep((prev) => prev + 1);
              }
            }}
            className="flex-1 h-12 rounded-xl bg-secondary hover:bg-on-secondary-fixed-variant text-on-secondary font-label-md text-label-md transition-colors whitespace-nowrap shadow-xs"
          >
            {isLast ? '공고 정리 시작하기' : '다음'}
          </button>
        </div>
      </div>
    </div>
  );
};
