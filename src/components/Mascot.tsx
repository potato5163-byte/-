import React, { useState } from 'react';

export type MascotVariant = 'hello' | 'saved' | 'analyzing' | 'explaining';
export type MascotSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';
export type MascotAnimation = 'none' | 'float' | 'analyzing' | 'pop';

interface MascotProps {
  variant: MascotVariant;
  size?: MascotSize;
  animation?: MascotAnimation;
  alt?: string;
  className?: string;
}

const MASCOT_ASSETS: Record<MascotVariant, { src: string; defaultAlt: string }> = {
  hello: {
    src: '/assets/aistudio/gongjeongi_hello_ce1a439d.png',
    defaultAlt: '공고쏙 마스코트 공정이 기본 인사 모습',
  },
  saved: {
    src: '/assets/aistudio/gongjeongi_saved_82131759.png',
    defaultAlt: '공고를 저장하고 기뻐하는 마스코트 공정이',
  },
  analyzing: {
    src: '/assets/aistudio/gongjeongi_analyzing_299baa74.png',
    defaultAlt: '공고 내용을 집중해서 분석하는 마스코트 공정이',
  },
  explaining: {
    src: '/assets/aistudio/gongjeongi_explaining_5415be84.png',
    defaultAlt: '체크리스트 핵심 내용을 설명하는 마스코트 공정이',
  },
};

const SIZE_CLASSES: Record<MascotSize, string> = {
  xs: 'w-9 h-9',
  sm: 'w-12 h-12',
  md: 'w-16 h-16',
  lg: 'w-20 h-20',
  xl: 'w-24 h-24',
  '2xl': 'w-28 h-28 sm:w-32 sm:h-32',
};

const ANIMATION_CLASSES: Record<MascotAnimation, string> = {
  none: '',
  float: 'mascot-float',
  analyzing: 'mascot-analyzing',
  pop: 'mascot-pop',
};

export const Mascot: React.FC<MascotProps> = ({
  variant,
  size = 'md',
  animation = 'none',
  alt,
  className = '',
}) => {
  const [hasError, setHasError] = useState(false);
  const asset = MASCOT_ASSETS[variant];

  if (hasError) {
    return (
      <div
        role="img"
        aria-label={alt ?? asset.defaultAlt}
        className={`${SIZE_CLASSES[size]} rounded-xl bg-secondary-fixed/60 text-secondary flex items-center justify-center shrink-0 select-none ${className}`}
      >
        <span className="material-symbols-outlined text-[24px]">folder_open</span>
      </div>
    );
  }

  return (
    <img
      src={asset.src}
      alt={alt ?? asset.defaultAlt}
      draggable={false}
      onError={() => setHasError(true)}
      className={`${SIZE_CLASSES[size]} aspect-square object-contain shrink-0 select-none ${ANIMATION_CLASSES[animation]} ${className}`}
    />
  );
};
