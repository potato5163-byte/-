import React, { useState } from 'react';

export interface SeriesSelection {
  track?: string;
  series?: string;
}

export interface TrackSeriesEntry {
  track: string;
  series: string[];
}

interface SeriesPickerModalProps {
  organization: string | null;
  /** 모집전형 목록 (예: 일반, 장애인, 보훈). 2개 미만이면 전형 단계가 없다 */
  tracks: string[];
  /** 전형별 한 줄 설명 (예: '지정 자격증 보유자만 지원') */
  trackDescriptions: Record<string, string>;
  /** 전형별 모집분야 (전형마다 분야가 다를 수 있음) */
  trackSeries: TrackSeriesEntry[];
  /** 전체 모집분야 (전형별 정보가 없을 때 사용) */
  seriesList: string[];
  onConfirm: (selection: SeriesSelection) => void;
  onUseMerged: () => void;
  onClose: () => void;
}

interface ChoiceListProps {
  options: string[];
  value: string;
  onChange: (v: string) => void;
  /** 옵션별 한 줄 설명. 있으면 한 줄에 하나씩 설명과 함께 보여준다 */
  descriptions?: Record<string, string>;
}

const ChoiceList: React.FC<ChoiceListProps> = ({ options, value, onChange, descriptions }) => {
  const [custom, setCustom] = useState('');
  const hasDescriptions = options.some((o) => descriptions?.[o]);
  return (
    <div className="space-y-2">
      <div className={hasDescriptions ? 'grid grid-cols-1 gap-2' : 'grid grid-cols-2 gap-2'}>
        {options.map((o) => {
          const selected = value === o;
          const desc = descriptions?.[o];
          return (
            <button
              key={o}
              type="button"
              aria-pressed={selected}
              onClick={() => {
                setCustom('');
                onChange(o);
              }}
              className={`min-h-[46px] px-3 py-2 rounded-xl border active:scale-[0.98] transition-all ${
                hasDescriptions ? 'text-left' : ''
              } ${
                selected
                  ? 'bg-secondary text-on-secondary border-secondary'
                  : 'bg-surface-container-low text-on-surface border-[#e2e9f5] hover:border-secondary'
              }`}
            >
              <span className="block font-label-md text-label-md">{o}</span>
              {desc && (
                <span
                  className={`block mt-0.5 font-label-sm text-label-sm font-normal ${
                    selected ? 'text-on-secondary/90' : 'text-on-surface-variant'
                  }`}
                >
                  {desc}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <input
        value={custom}
        onChange={(e) => {
          setCustom(e.target.value);
          onChange(e.target.value.trim());
        }}
        placeholder="목록에 없으면 직접 입력"
        maxLength={40}
        className="w-full min-h-[42px] px-3 rounded-xl bg-surface-container-low border border-[#e2e9f5] font-body-md text-body-md text-on-surface outline-none focus:border-secondary"
      />
    </div>
  );
};

/** 1단계 모집전형 → 2단계 (그 전형의) 모집분야 순서로 고르는 창 */
export const SeriesPickerModal: React.FC<SeriesPickerModalProps> = ({
  organization,
  tracks,
  trackDescriptions,
  trackSeries,
  seriesList,
  onConfirm,
  onUseMerged,
  onClose,
}) => {
  const hasTrackStep = tracks.length >= 2;
  const [step, setStep] = useState<1 | 2>(hasTrackStep ? 1 : 2);
  const [track, setTrack] = useState('');
  const [series, setSeries] = useState('');

  // 고른 전형에 해당하는 분야만 보여준다. 전형별 정보가 없으면 전체 분야를 쓴다.
  const forTrack = trackSeries.find((t) => t.track === track)?.series ?? [];
  const seriesOptions = hasTrackStep && forTrack.length > 0 ? forTrack : seriesList;
  const needSeries = seriesOptions.length >= 2;

  const finish = (nextSeries: string) =>
    onConfirm({
      track: hasTrackStep ? track : undefined,
      series: needSeries ? nextSeries : seriesOptions[0] || undefined,
    });

  const goNext = () => {
    // 고른 전형에 분야가 0~1개뿐이면 분야 단계 없이 바로 정리한다
    if (seriesOptions.length < 2) {
      onConfirm({ track, series: seriesOptions[0] || undefined });
      return;
    }
    setSeries('');
    setStep(2);
  };

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center bg-black/40 px-3 pb-3 sm:pb-0"
      role="dialog"
      aria-modal="true"
      aria-label="모집전형·모집분야 선택"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[440px] max-h-[88vh] overflow-y-auto rounded-2xl bg-surface-container-lowest p-5 shadow-xl space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          {hasTrackStep && (
            <p className="font-label-sm text-label-sm text-secondary font-bold mb-1">
              {step} / 2 단계
            </p>
          )}
          <h2 className="font-headline-md text-headline-md text-primary font-bold">
            {step === 1 ? '모집전형을 골라주세요' : '모집분야를 골라주세요'}
          </h2>
          <p className="font-label-sm text-label-sm text-on-surface-variant font-normal mt-1">
            {step === 1
              ? `${organization ?? '이 공고'}는 지원 유형이 나뉘어 있어요.`
              : hasTrackStep
                ? `선택한 '${track}'에서 지원할 수 있는 분야예요.`
                : `${organization ?? '이 공고'}는 모집분야가 나뉘어 있어요.`}{' '}
            고른 조건의 모집인원·자격·가산점 기준으로 정리해 드려요.
          </p>
        </div>

        {step === 1 ? (
          <>
            <ChoiceList
              options={tracks}
              value={track}
              onChange={setTrack}
              descriptions={trackDescriptions}
            />
            <button
              type="button"
              disabled={!track}
              onClick={goNext}
              className="w-full min-h-[46px] rounded-xl bg-secondary text-on-secondary font-label-md text-label-md disabled:opacity-40 active:scale-[0.98] transition-all"
            >
              {track ? '다음' : '모집전형을 골라주세요'}
            </button>
          </>
        ) : (
          <>
            <ChoiceList options={seriesOptions} value={series} onChange={setSeries} />
            <div className="flex gap-2">
              {hasTrackStep && (
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="min-h-[46px] px-4 rounded-xl border border-[#e2e9f5] text-on-surface font-label-md text-label-md"
                >
                  이전
                </button>
              )}
              <button
                type="button"
                disabled={!series}
                onClick={() => finish(series)}
                className="flex-1 min-h-[46px] rounded-xl bg-secondary text-on-secondary font-label-md text-label-md disabled:opacity-40 active:scale-[0.98] transition-all"
              >
                {series ? '이 조건으로 정리하기' : '모집분야를 골라주세요'}
              </button>
            </div>
          </>
        )}

        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={onUseMerged}
            className="font-label-sm text-label-sm text-on-surface-variant underline underline-offset-2"
          >
            구분 없이 통합으로 보기
          </button>
          <button
            type="button"
            onClick={onClose}
            className="font-label-sm text-label-sm text-on-surface-variant"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
};
