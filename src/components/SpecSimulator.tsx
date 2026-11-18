import React, { useMemo, useState } from 'react';
import type { SavedAnnouncement } from '../types';
import {
  LANGUAGE_EXAMS,
  OFFICIAL_CERTIFICATIONS,
} from '../data/officialCertifications';
import { calculateDocumentDeadlineDday } from '../utils/dday';
import {
  evaluateSpecMatching,
  type LanguageSpec,
  type UserProfileMeta,
} from '../utils/specMatching';

interface SpecSimulatorProps {
  items: SavedAnnouncement[];
  certificates: string[];
  languageSpecs: LanguageSpec[];
  skills: string[];
  profileMeta: UserProfileMeta;
}

interface Snapshot {
  id: string;
  label: string;
  bonus: number;
  eligible: number; // 충족 자격 항목 수
  unmet: number;
  prefCount: number; // 점수 없는 우대 충족 수
}

type Kind = 'cert' | 'lang' | 'skill';

function snapshotAll(
  items: SavedAnnouncement[],
  certs: string[],
  langs: LanguageSpec[],
  skills: string[],
  profile: UserProfileMeta
): Snapshot[] {
  return items.map((item) => {
    const dday = calculateDocumentDeadlineDday(
      item.analysis.schedule,
      item.analysis.deadline_type
    );
    const m = evaluateSpecMatching(
      item.analysis,
      certs,
      langs,
      item.bonusOverrides,
      skills,
      profile,
      dday.matchedDate
    );
    const org = item.analysis.organization ?? '이름 없음';
    const pos = item.analysis.position ? ` · ${item.analysis.position}` : '';
    return {
      id: item.id,
      label: `${org}${pos}`,
      bonus: m.totalBonusPoints,
      eligible: m.metCount,
      unmet: m.unmetCount,
      prefCount: m.matchedPreferenceCount,
    };
  });
}

function gain(before: Snapshot[], after: Snapshot[]) {
  let points = 0;
  let unlocked = 0;
  let prefs = 0;
  const rows: { label: string; text: string }[] = [];
  after.forEach((a, i) => {
    const b = before[i];
    const dp = a.bonus - b.bonus;
    const du = a.eligible - b.eligible; // 충족으로 바뀐 자격 항목(미충족·확인필요 → 충족)
    const dpref = a.prefCount - b.prefCount;
    if (dp > 0 || du > 0 || dpref > 0) {
      points += Math.max(dp, 0);
      unlocked += Math.max(du, 0);
      prefs += Math.max(dpref, 0);
      const parts: string[] = [];
      if (dp > 0) parts.push(`가산점 +${dp}점`);
      if (du > 0) parts.push(`충족 자격 +${du}건`);
      if (dpref > 0) parts.push(`우대사항 ${dpref}건 적용`);
      rows.push({ label: a.label, text: parts.join(' · ') });
    }
  });
  return { points, unlocked, prefs, rows };
}

export const SpecSimulator: React.FC<SpecSimulatorProps> = ({
  items,
  certificates,
  languageSpecs,
  skills,
  profileMeta,
}) => {
  const [kind, setKind] = useState<Kind>('cert');
  const [certInput, setCertInput] = useState('');
  const [skillInput, setSkillInput] = useState('');
  const [langExam, setLangExam] = useState(LANGUAGE_EXAMS[0]?.name ?? '');
  const [langValue, setLangValue] = useState('');
  const [applied, setApplied] = useState<{
    certs: string[];
    langs: LanguageSpec[];
    skills: string[];
    title: string;
  } | null>(null);

  const baseline = useMemo(
    () => snapshotAll(items, certificates, languageSpecs, skills, profileMeta),
    [items, certificates, languageSpecs, skills, profileMeta]
  );

  const ranking = useMemo(() => {
    if (items.length === 0) return [];
    const owned = new Set(certificates);
    const list = OFFICIAL_CERTIFICATIONS.filter((c) => !owned.has(c.name))
      .map((c) => {
        const after = snapshotAll(
          items,
          [...certificates, c.name],
          languageSpecs,
          skills,
          profileMeta
        );
        const g = gain(baseline, after);
        return { name: c.name, ...g, count: g.rows.length };
      })
      .filter((r) => r.count > 0)
      .sort(
        (a, b) =>
          b.points + b.unlocked * 3 + b.prefs - (a.points + a.unlocked * 3 + a.prefs) ||
          b.count - a.count
      );
    return list.slice(0, 5);
  }, [items, certificates, languageSpecs, skills, profileMeta, baseline]);

  const result = useMemo(() => {
    if (!applied) return null;
    const after = snapshotAll(
      items,
      [...certificates, ...applied.certs],
      [
        ...languageSpecs.filter(
          (l) => !applied.langs.some((n) => n.exam === l.exam)
        ),
        ...applied.langs,
      ],
      [...skills, ...applied.skills],
      profileMeta
    );
    return gain(baseline, after);
  }, [applied, items, certificates, languageSpecs, skills, profileMeta, baseline]);

  const examMeta = LANGUAGE_EXAMS.find((e) => e.name === langExam);

  const runSimulation = () => {
    if (kind === 'cert') {
      const v = certInput.trim();
      if (!v) return;
      setApplied({ certs: [v], langs: [], skills: [], title: `자격증 '${v}'` });
    } else if (kind === 'skill') {
      const v = skillInput.trim();
      if (!v) return;
      setApplied({ certs: [], langs: [], skills: [v], title: `역량 '${v}'` });
    } else {
      const v = langValue.trim();
      if (!v) return;
      setApplied({
        certs: [],
        langs: [{ exam: langExam, value: v }],
        skills: [],
        title: `${langExam} ${v}${examMeta?.unit ?? ''}`,
      });
    }
  };

  if (items.length === 0) {
    return (
      <div className="brand-card rounded-2xl p-5 text-center text-on-surface-variant font-label-md text-label-md">
        저장한 공고가 있어야 시뮬레이션할 수 있어요. 공고를 먼저 분석해 저장해 보세요.
      </div>
    );
  }

  const tabBtn = (k: Kind, label: string) => (
    <button
      type="button"
      onClick={() => setKind(k)}
      className={`flex-1 min-h-[38px] rounded-lg font-label-md text-label-md transition-all ${
        kind === k
          ? 'bg-surface-container-lowest text-secondary shadow-xs'
          : 'text-on-surface-variant hover:text-on-surface'
      }`}
    >
      {label}
    </button>
  );

  const inputCls =
    'w-full min-h-[44px] px-3 rounded-xl bg-surface-container-low border border-[#e2e9f5] font-body-md text-body-md text-on-surface outline-none focus:border-secondary';

  return (
    <div className="space-y-4">
      <div className="brand-card rounded-2xl p-4 space-y-3">
        <div>
          <h2 className="font-headline-md text-headline-md text-primary font-bold">
            스펙 시뮬레이터
          </h2>
          <p className="font-label-sm text-label-sm text-on-surface-variant font-normal mt-0.5">
            "이 스펙이 생기면 저장한 공고 {items.length}건에서 뭐가 달라질까?"를 미리 계산해요.
            실제 내 스펙은 바뀌지 않아요.
          </p>
        </div>

        <div className="flex gap-1 p-1 bg-surface-container rounded-xl border border-[#e2e9f5]">
          {tabBtn('cert', '자격증')}
          {tabBtn('lang', '어학')}
          {tabBtn('skill', '직무역량')}
        </div>

        {kind === 'cert' && (
          <>
            <input
              list="sim-cert-list"
              value={certInput}
              onChange={(e) => setCertInput(e.target.value)}
              placeholder="예: 정보처리기사"
              className={inputCls}
            />
            <datalist id="sim-cert-list">
              {OFFICIAL_CERTIFICATIONS.map((c) => (
                <option key={c.name} value={c.name} />
              ))}
            </datalist>
          </>
        )}
        {kind === 'skill' && (
          <input
            value={skillInput}
            onChange={(e) => setSkillInput(e.target.value)}
            placeholder="예: SQL, Python"
            className={inputCls}
          />
        )}
        {kind === 'lang' && (
          <div className="grid grid-cols-2 gap-2">
            <select
              value={langExam}
              onChange={(e) => {
                setLangExam(e.target.value);
                setLangValue('');
              }}
              className={inputCls}
            >
              {LANGUAGE_EXAMS.map((e) => (
                <option key={e.name} value={e.name}>
                  {e.name}
                </option>
              ))}
            </select>
            {examMeta?.mode === 'grade' && examMeta.grades ? (
              <select
                value={langValue}
                onChange={(e) => setLangValue(e.target.value)}
                className={inputCls}
              >
                <option value="">등급 선택</option>
                {examMeta.grades.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            ) : (
              <input
                inputMode="numeric"
                value={langValue}
                onChange={(e) => setLangValue(e.target.value)}
                placeholder={examMeta?.placeholder ?? '점수'}
                className={inputCls}
              />
            )}
          </div>
        )}

        <button
          type="button"
          onClick={runSimulation}
          className="w-full min-h-[46px] rounded-xl bg-secondary hover:bg-on-secondary-fixed-variant text-on-secondary font-label-md text-label-md active:scale-[0.98] transition-all"
        >
          시뮬레이션 해보기
        </button>
      </div>

      {applied && result && (
        <div className="brand-card rounded-2xl p-4 space-y-3">
          <p className="font-label-md text-label-md text-on-surface">
            {applied.title}이(가) 생기면
          </p>
          {result.rows.length === 0 ? (
            <p className="font-body-md text-body-md text-on-surface-variant">
              저장한 공고에서는 달라지는 게 없어요. 이 스펙이 공고에 쓰인 표현과 달라서 인식되지 않았을 수도 있어요.
            </p>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-xl bg-surface-container-low p-2.5">
                  <p className="font-headline-md text-headline-md text-secondary font-bold tabular-nums">
                    +{result.points}
                  </p>
                  <p className="font-label-sm text-label-sm text-on-surface-variant font-normal">
                    가산점 합계
                  </p>
                </div>
                <div className="rounded-xl bg-surface-container-low p-2.5">
                  <p className="font-headline-md text-headline-md text-secondary font-bold tabular-nums">
                    {result.unlocked}
                  </p>
                  <p className="font-label-sm text-label-sm text-on-surface-variant font-normal">
                    충족된 자격
                  </p>
                </div>
                <div className="rounded-xl bg-surface-container-low p-2.5">
                  <p className="font-headline-md text-headline-md text-secondary font-bold tabular-nums">
                    {result.rows.length}
                  </p>
                  <p className="font-label-sm text-label-sm text-on-surface-variant font-normal">
                    영향받는 공고
                  </p>
                </div>
              </div>
              <ul className="space-y-1.5">
                {result.rows.map((r) => (
                  <li
                    key={r.label}
                    className="flex flex-col gap-0.5 rounded-xl border border-[#e2e9f5] px-3 py-2"
                  >
                    <span className="font-label-md text-label-md text-on-surface">
                      {r.label}
                    </span>
                    <span className="font-label-sm text-label-sm text-secondary font-normal">
                      {r.text}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      <div className="brand-card rounded-2xl p-4 space-y-2.5">
        <p className="font-label-md text-label-md text-on-surface">
          지금 따면 가장 이득인 자격증 TOP 5
        </p>
        <p className="font-label-sm text-label-sm text-on-surface-variant font-normal">
          내 공고함 기준으로 자격증 목록을 하나씩 가정해 계산한 결과예요.
        </p>
        {ranking.length === 0 ? (
          <p className="font-body-md text-body-md text-on-surface-variant">
            지금 공고함에서는 추가 자격증으로 달라지는 공고가 없어요.
          </p>
        ) : (
          <ol className="space-y-1.5">
            {ranking.map((r, i) => (
              <li
                key={r.name}
                className="flex items-center justify-between gap-2 rounded-xl border border-[#e2e9f5] px-3 py-2"
              >
                <span className="font-label-md text-label-md text-on-surface">
                  {i + 1}. {r.name}
                </span>
                <span className="font-label-sm text-label-sm text-secondary font-normal text-right">
                  {r.count}곳
                  {r.points > 0 ? ` · +${r.points}점` : ''}
                  {r.unlocked > 0 ? ` · 자격 ${r.unlocked}건 충족` : ''}
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
};
