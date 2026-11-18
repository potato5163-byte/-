/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AnalyzeInputView,
  type CompanyTypeHint,
} from './components/AnalyzeInputView';
import {
  AnalyzeResultView,
  type AnalysisUpdateMeta,
} from './components/AnalyzeResultView';
import { SavedListView } from './components/SavedListView';
import { RecommendView } from './components/RecommendView';
import { SpecProfileModal } from './components/SpecProfileModal';
import { GuideModal } from './components/GuideModal';
import { Mascot } from './components/Mascot';
import type {
  ApplicationStatus,
  CompanyType,
  JobAnalysis,
  RecommendedCompany,
  RecommendSectorFilter,
  SavedAnnouncement,
  SpecRecommendationResponse,
} from './types';
import { calculateDocumentDeadlineDday } from './utils/dday';
import type { LanguageSpec, UserProfileMeta } from './utils/specMatching';
import {
  exportBackupFile,
  loadSavedAnnouncements,
  loadSpecCertificates,
  loadSpecLanguages,
  loadSpecProfileMeta,
  loadSpecRecommendationCache,
  loadSpecSkills,
  parseBackupFileContent,
  persistSavedAnnouncements,
  persistSpecCertificates,
  persistSpecLanguages,
  persistSpecProfileMeta,
  persistSpecRecommendationCache,
  persistSpecSkills,
  type GonggoBackupPayload,
} from './utils/storage';

type ActiveScreen = 'input' | 'recommend' | 'list' | 'result';
type ResultOrigin = 'input' | 'list';

function generateAnnouncementId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `ann-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function readFileAsBase64(file: File): Promise<{ mimeType: string; data: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const commaIdx = result.indexOf(',');
      if (commaIdx === -1) {
        reject(new Error('Invalid file data'));
        return;
      }
      const data = result.slice(commaIdx + 1);
      let mimeType = file.type;
      if (!mimeType) {
        const lower = file.name.toLowerCase();
        if (lower.endsWith('.pdf')) mimeType = 'application/pdf';
        else if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) mimeType = 'image/jpeg';
        else if (lower.endsWith('.webp')) mimeType = 'image/webp';
        else if (lower.endsWith('.gif')) mimeType = 'image/gif';
        else mimeType = 'image/png';
      }
      resolve({ mimeType, data });
    };
    reader.onerror = () => reject(reader.error ?? new Error('File read error'));
    reader.readAsDataURL(file);
  });
}

export default function App() {
  const [screen, setScreen] = useState<ActiveScreen>('input');
  const [resultOrigin, setResultOrigin] = useState<ResultOrigin>('input');
  const [inputText, setInputText] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [companyTypeHint, setCompanyTypeHint] = useState<CompanyTypeHint>('auto');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Active result context (either newly analyzed or opened from SavedListView)
  const [analysisResult, setAnalysisResult] = useState<JobAnalysis | null>(null);
  const [resultOriginalText, setResultOriginalText] = useState('');
  const [resultAttachedFileName, setResultAttachedFileName] = useState<string | null>(null);
  const [inputSourceUrl, setInputSourceUrl] = useState<string | null>(null);
  const [tempSourceUrl, setTempSourceUrl] = useState<string | null>(null);
  const [tempCheckedDocs, setTempCheckedDocs] = useState<Record<number, boolean>>({});
  const [tempStatus, setTempStatus] = useState<ApplicationStatus>('지원 예정');
  const [tempMemo, setTempMemo] = useState('');
  const [tempEssayDrafts, setTempEssayDrafts] = useState<Record<number, string>>({});
  const [tempInterviewNotes, setTempInterviewNotes] = useState<Record<number, string>>({});
  const [tempBonusOverrides, setTempBonusOverrides] = useState<Record<number, boolean>>({});
  const [activeSavedId, setActiveSavedId] = useState<string | null>(null);
  const [openInEditMode, setOpenInEditMode] = useState(false);

  // Global spec profile & modal state
  const [showSpecModal, setShowSpecModal] = useState(false);
  const [showGuideModal, setShowGuideModal] = useState(false);
  const [backupMessage, setBackupMessage] = useState<string | null>(null);
  const [pendingBackupPayload, setPendingBackupPayload] =
    useState<GonggoBackupPayload | null>(null);
  const [deletedUndoItem, setDeletedUndoItem] = useState<{
    item: SavedAnnouncement;
    index: number;
    restoreActive: boolean;
  } | null>(null);
  const analyzeAbortRef = useRef<AbortController | null>(null);
  const userCancelledAnalyzeRef = useRef(false);
  const undoTimerRef = useRef<number | null>(null);

  // Persisted saved announcements & spec profile
  const [savedAnnouncements, setSavedAnnouncements] = useState<SavedAnnouncement[]>(() =>
    loadSavedAnnouncements()
  );
  const [certificates, setCertificates] = useState<string[]>(() => loadSpecCertificates());
  const [languageSpecs, setLanguageSpecs] = useState<LanguageSpec[]>(() =>
    loadSpecLanguages()
  );
  const [skills, setSkills] = useState<string[]>(() => loadSpecSkills());
  const [profileMeta, setProfileMeta] = useState<UserProfileMeta>(() => loadSpecProfileMeta());
  const [recommendSector, setRecommendSector] = useState<RecommendSectorFilter>('all');
  const [recommendTargetRole, setRecommendTargetRole] = useState('');
  const [recommendationResult, setRecommendationResult] =
    useState<SpecRecommendationResponse | null>(() => loadSpecRecommendationCache());
  const [isRecommending, setIsRecommending] = useState(false);
  const [recommendError, setRecommendError] = useState<string | null>(null);

  useEffect(() => {
    persistSavedAnnouncements(savedAnnouncements);
  }, [savedAnnouncements]);

  useEffect(() => {
    persistSpecCertificates(certificates);
  }, [certificates]);

  useEffect(() => {
    persistSpecLanguages(languageSpecs);
  }, [languageSpecs]);

  useEffect(() => {
    persistSpecSkills(skills);
  }, [skills]);

  useEffect(() => {
    persistSpecProfileMeta(profileMeta);
  }, [profileMeta]);

  useEffect(() => {
    persistSpecRecommendationCache(recommendationResult);
  }, [recommendationResult]);

  const activeSavedItem = useMemo(
    () =>
      activeSavedId
        ? savedAnnouncements.find((item) => item.id === activeSavedId) ?? null
        : null,
    [savedAnnouncements, activeSavedId]
  );

  const displayedAnalysis = activeSavedItem ? activeSavedItem.analysis : analysisResult;
  const displayedOriginalText = activeSavedItem
    ? activeSavedItem.originalText
    : resultOriginalText;
  const displayedAttachedFileName = activeSavedItem
    ? activeSavedItem.attachedFileName
    : resultAttachedFileName;
  const displayedSourceUrl = activeSavedItem
    ? activeSavedItem.sourceUrl ?? null
    : tempSourceUrl;
  const displayedCheckedDocs = activeSavedItem
    ? activeSavedItem.checkedDocs
    : tempCheckedDocs;
  const displayedStatus = activeSavedItem ? activeSavedItem.applicationStatus : tempStatus;
  const displayedMemo = activeSavedItem ? activeSavedItem.memo : tempMemo;
  const displayedEssayDrafts = activeSavedItem
    ? activeSavedItem.essayDrafts ?? {}
    : tempEssayDrafts;
  const displayedInterviewNotes = activeSavedItem
    ? activeSavedItem.interviewNotes ?? {}
    : tempInterviewNotes;
  const displayedBonusOverrides = activeSavedItem
    ? activeSavedItem.bonusOverrides ?? {}
    : tempBonusOverrides;
  const isSaved = activeSavedItem !== null;

  const reusableEssays = useMemo(() => {
    const list: Array<{
      announcementId: string;
      organization: string;
      position: string;
      question: string;
      draft: string;
    }> = [];
    for (const item of savedAnnouncements) {
      if (activeSavedId && item.id === activeSavedId) continue;
      const questions = Array.isArray(item.analysis.essay_questions)
        ? item.analysis.essay_questions
        : [];
      const drafts = item.essayDrafts ?? {};
      questions.forEach((eq, idx) => {
        const draftBody = (drafts[idx] ?? '').trim();
        if (!draftBody) return;
        list.push({
          announcementId: item.id,
          organization: item.analysis.organization?.trim() || '기관명 미입력',
          position: item.analysis.position?.trim() || '',
          question: eq.question?.trim() || `문항 ${idx + 1}`,
          draft: draftBody,
        });
      });
    }
    return list;
  }, [savedAnnouncements, activeSavedId]);

  const similarSavedItem = useMemo(() => {
    if (isSaved || !displayedAnalysis) return null;
    const normalizeUrl = (u?: string | null) =>
      (u ?? '').trim().replace(/\/+$/, '').toLowerCase();
    const normalizeTxt = (s?: string | null) =>
      (s ?? '').trim().replace(/\s+/g, '').toLowerCase();

    const targetUrl = normalizeUrl(displayedSourceUrl);
    const targetOrg = normalizeTxt(displayedAnalysis.organization);
    const targetPos = normalizeTxt(displayedAnalysis.position);

    return (
      savedAnnouncements.find((item) => {
        const itemUrl = normalizeUrl(item.sourceUrl);
        if (targetUrl && itemUrl && targetUrl === itemUrl) {
          return true;
        }
        const itemOrg = normalizeTxt(item.analysis.organization);
        const itemPos = normalizeTxt(item.analysis.position);
        return Boolean(
          targetOrg &&
            targetPos &&
            itemOrg === targetOrg &&
            itemPos === targetPos
        );
      }) ?? null
    );
  }, [isSaved, displayedAnalysis, displayedSourceUrl, savedAnnouncements]);

  const urgentNotices = useMemo(() => {
    return savedAnnouncements
      .filter((item) => item.applicationStatus === '지원 예정')
      .map((item) => {
        const dday = calculateDocumentDeadlineDday(
          item.analysis.schedule,
          item.analysis.deadline_type
        );
        return {
          id: item.id,
          organization: item.analysis.organization?.trim() || '기관명 미입력',
          diffDays: dday.diffDays,
          found: dday.found,
        };
      })
      .filter(
        (x): x is { id: string; organization: string; diffDays: number; found: true } =>
          x.found && x.diffDays !== null && x.diffDays >= 0 && x.diffDays <= 3
      )
      .sort((a, b) => a.diffDays - b.diffDays)
      .map(({ id, organization, diffDays }) => ({ id, organization, diffDays }));
  }, [savedAnnouncements]);

  const showTempBackupMessage = (msg: string) => {
    setBackupMessage(msg);
    window.setTimeout(() => {
      setBackupMessage((prev) => (prev === msg ? null : prev));
    }, 3200);
  };

  const triggerUndoToast = (
    item: SavedAnnouncement,
    index: number,
    restoreActive: boolean
  ) => {
    if (undoTimerRef.current !== null) {
      window.clearTimeout(undoTimerRef.current);
    }
    setDeletedUndoItem({ item, index, restoreActive });
    undoTimerRef.current = window.setTimeout(() => {
      setDeletedUndoItem(null);
      undoTimerRef.current = null;
    }, 6000);
  };

  const handleUndoDelete = () => {
    if (!deletedUndoItem) return;
    if (undoTimerRef.current !== null) {
      window.clearTimeout(undoTimerRef.current);
      undoTimerRef.current = null;
    }
    const { item, index, restoreActive } = deletedUndoItem;
    setSavedAnnouncements((prev) => {
      if (prev.some((x) => x.id === item.id)) return prev;
      const next = [...prev];
      const clampedIdx = Math.max(0, Math.min(index, next.length));
      next.splice(clampedIdx, 0, item);
      return next;
    });
    if (restoreActive) {
      setActiveSavedId(item.id);
    }
    setDeletedUndoItem(null);
  };

  const handleCancelAnalyze = () => {
    userCancelledAnalyzeRef.current = true;
    analyzeAbortRef.current?.abort();
    analyzeAbortRef.current = null;
    setIsLoading(false);
  };

  const handleAnalyze = async () => {
    const trimmed = inputText.trim();
    if (!trimmed && selectedFiles.length === 0) {
      setErrorMessage('공고 내용을 붙여넣거나 파일을 첨부해 주세요');
      return;
    }

    const totalSize = selectedFiles.reduce((acc, f) => acc + f.size, 0);
    if (totalSize > 30 * 1024 * 1024) {
      setErrorMessage('첨부 파일 합계 크기는 최대 30MB까지 지원합니다');
      return;
    }

    setErrorMessage(null);
    setIsLoading(true);
    userCancelledAnalyzeRef.current = false;

    const controller = new AbortController();
    analyzeAbortRef.current = controller;
    const timeoutId = window.setTimeout(() => controller.abort(), 55000);

    try {
      const encodedFiles = await Promise.all(selectedFiles.map(readFileAsBase64));

      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: trimmed,
          files: encodedFiles,
          companyTypeHint,
        }),
        signal: controller.signal,
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload || payload.error) {
        if (response.status === 429 || payload?.quotaExceeded) {
          setErrorMessage(
            '요청이 많아 AI 분석 한도에 도달했어요. 잠시 후 다시 시도해 주세요'
          );
        } else {
          setErrorMessage(
            payload?.error || '공고를 읽지 못했어요. 다시 시도해 주세요'
          );
        }
        return;
      }

      setAnalysisResult(payload as JobAnalysis);
      setResultOriginalText(inputText);
      setResultAttachedFileName(
        selectedFiles.length > 0 ? selectedFiles.map((f) => f.name).join(', ') : null
      );
      setTempSourceUrl(inputSourceUrl);
      setTempCheckedDocs({});
      setTempStatus('지원 예정');
      setTempMemo('');
      setTempEssayDrafts({});
      setTempInterviewNotes({});
      setTempBonusOverrides({});
      setActiveSavedId(null);
      setOpenInEditMode(false);
      setResultOrigin('input');
      setScreen('result');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      if (userCancelledAnalyzeRef.current) {
        return;
      }
      const isAbort =
        err instanceof DOMException && err.name === 'AbortError';
      setErrorMessage(
        isAbort
          ? '분석 시간이 초과되었어요. 공고 텍스트가 길다면 핵심 내용만 붙여넣어 다시 시도해 주세요'
          : '공고를 읽지 못했어요. 다시 시도해 주세요'
      );
    } finally {
      window.clearTimeout(timeoutId);
      analyzeAbortRef.current = null;
      setIsLoading(false);
    }
  };

  const handleSelectSavedAnnouncement = (id: string) => {
    const target = savedAnnouncements.find((item) => item.id === id);
    if (!target) return;
    setActiveSavedId(target.id);
    setAnalysisResult(target.analysis);
    setResultOriginalText(target.originalText);
    setResultAttachedFileName(target.attachedFileName);
    setTempSourceUrl(target.sourceUrl ?? null);
    setTempCheckedDocs(target.checkedDocs);
    setTempStatus(target.applicationStatus);
    setTempMemo(target.memo);
    setTempEssayDrafts(target.essayDrafts ?? {});
    setTempInterviewNotes(target.interviewNotes ?? {});
    setTempBonusOverrides(target.bonusOverrides ?? {});
    setOpenInEditMode(false);
    setResultOrigin('list');
    setScreen('result');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCreateManualAnnouncement = () => {
    const nowIso = new Date().toISOString();
    const newId = generateAnnouncementId();
    const blankAnalysis: JobAnalysis = {
      company_type: null,
      organization: '',
      position: '',
      employment_type: null,
      experience_level: null,
      location: null,
      headcount: null,
      compensation: null,
      deadline_type: 'fixed',
      tech_skills: null,
      keywords: null,
      interview_questions: null,
      stages: ['서류전형', '필기·코테', '면접전형'],
      schedule: [{ step: '서류 접수 마감', date: '', time: '18:00', source: null }],
      eligibility: [],
      bonus_points: [],
      documents: ['입사지원서 및 자기소개서'],
      essay_questions: [],
    };
    const newItem: SavedAnnouncement = {
      id: newId,
      analysis: blankAnalysis,
      originalText: '',
      attachedFileName: null,
      sourceUrl: null,
      isPinned: false,
      checkedDocs: {},
      categoryTag: '직접 등록 공고',
      selectedForCompare: false,
      applicationStatus: '지원 예정',
      memo: '',
      essayDrafts: {},
      interviewNotes: {},
      bonusOverrides: {},
      savedAt: nowIso,
      updatedAt: nowIso,
    };

    setSavedAnnouncements((prev) => [newItem, ...prev]);
    setActiveSavedId(newId);
    setAnalysisResult(blankAnalysis);
    setResultOriginalText('');
    setResultAttachedFileName(null);
    setTempSourceUrl(null);
    setTempCheckedDocs({});
    setTempStatus('지원 예정');
    setTempMemo('');
    setTempEssayDrafts({});
    setTempInterviewNotes({});
    setTempBonusOverrides({});
    setOpenInEditMode(true);
    setResultOrigin('list');
    setScreen('result');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDuplicateAnnouncement = (id: string) => {
    const source = savedAnnouncements.find((item) => item.id === id);
    if (!source) return;
    const nowIso = new Date().toISOString();
    const newId = generateAnnouncementId();
    const clonedAnalysis: JobAnalysis = JSON.parse(JSON.stringify(source.analysis));
    clonedAnalysis.organization = clonedAnalysis.organization?.trim()
      ? `${clonedAnalysis.organization.trim()} (복사본)`
      : '복제 공고';

    const duplicated: SavedAnnouncement = {
      ...source,
      id: newId,
      analysis: clonedAnalysis,
      isPinned: false,
      selectedForCompare: false,
      checkedDocs: {},
      applicationStatus: '지원 예정',
      essayDrafts: { ...(source.essayDrafts ?? {}) },
      interviewNotes: { ...(source.interviewNotes ?? {}) },
      bonusOverrides: { ...(source.bonusOverrides ?? {}) },
      savedAt: nowIso,
      updatedAt: nowIso,
    };

    setSavedAnnouncements((prev) => [duplicated, ...prev]);
    setActiveSavedId(newId);
    setAnalysisResult(clonedAnalysis);
    setResultOriginalText(duplicated.originalText);
    setResultAttachedFileName(duplicated.attachedFileName);
    setTempSourceUrl(duplicated.sourceUrl ?? null);
    setTempCheckedDocs({});
    setTempStatus('지원 예정');
    setTempMemo(duplicated.memo);
    setTempEssayDrafts(duplicated.essayDrafts ?? {});
    setTempInterviewNotes(duplicated.interviewNotes ?? {});
    setTempBonusOverrides(duplicated.bonusOverrides ?? {});
    setOpenInEditMode(true);
    setResultOrigin('list');
    setScreen('result');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleToggleSave = () => {
    if (!displayedAnalysis) return;

    if (activeSavedItem) {
      const removedIndex = savedAnnouncements.findIndex(
        (item) => item.id === activeSavedItem.id
      );
      setAnalysisResult(activeSavedItem.analysis);
      setResultOriginalText(activeSavedItem.originalText);
      setResultAttachedFileName(activeSavedItem.attachedFileName);
      setTempSourceUrl(activeSavedItem.sourceUrl ?? null);
      setTempCheckedDocs(activeSavedItem.checkedDocs);
      setTempStatus(activeSavedItem.applicationStatus);
      setTempMemo(activeSavedItem.memo);
      setTempEssayDrafts(activeSavedItem.essayDrafts ?? {});
      setTempInterviewNotes(activeSavedItem.interviewNotes ?? {});
      setTempBonusOverrides(activeSavedItem.bonusOverrides ?? {});
      setSavedAnnouncements((prev) =>
        prev.filter((item) => item.id !== activeSavedItem.id)
      );
      setActiveSavedId(null);
      triggerUndoToast(activeSavedItem, Math.max(0, removedIndex), true);
      return;
    }

    const nowIso = new Date().toISOString();
    const newId = generateAnnouncementId();
    const newItem: SavedAnnouncement = {
      id: newId,
      analysis: displayedAnalysis,
      originalText: displayedOriginalText,
      attachedFileName: displayedAttachedFileName,
      sourceUrl: displayedSourceUrl,
      isPinned: false,
      checkedDocs: displayedCheckedDocs,
      categoryTag: `${displayedAnalysis.company_type || '공고'} · ${
        displayedAnalysis.employment_type || '저장 공고'
      }`,
      selectedForCompare: savedAnnouncements.filter((x) => x.selectedForCompare).length < 2,
      applicationStatus: displayedStatus,
      memo: displayedMemo,
      essayDrafts: displayedEssayDrafts,
      interviewNotes: displayedInterviewNotes,
      bonusOverrides: displayedBonusOverrides,
      savedAt: nowIso,
      updatedAt: nowIso,
    };

    setSavedAnnouncements((prev) => [newItem, ...prev]);
    setActiveSavedId(newId);
  };

  const handleUpdateAnalysis = (
    updated: JobAnalysis,
    meta?: AnalysisUpdateMeta
  ) => {
    setAnalysisResult(updated);
    if (meta) {
      setTempCheckedDocs(meta.checkedDocs);
      setTempBonusOverrides(meta.bonusOverrides);
      setTempEssayDrafts(meta.essayDrafts);
      if (meta.sourceUrl !== undefined) {
        setTempSourceUrl(meta.sourceUrl);
      }
    }
    setOpenInEditMode(false);
    if (activeSavedId) {
      const nowIso = new Date().toISOString();
      setSavedAnnouncements((prev) =>
        prev.map((item) =>
          item.id === activeSavedId
            ? {
                ...item,
                analysis: updated,
                checkedDocs: meta ? meta.checkedDocs : item.checkedDocs,
                bonusOverrides: meta ? meta.bonusOverrides : item.bonusOverrides,
                essayDrafts: meta ? meta.essayDrafts : item.essayDrafts,
                sourceUrl:
                  meta && meta.sourceUrl !== undefined ? meta.sourceUrl : item.sourceUrl,
                updatedAt: nowIso,
              }
            : item
        )
      );
    }
  };

  const handleChangeSourceUrl = (url: string | null) => {
    setTempSourceUrl(url);
    if (activeSavedId) {
      const nowIso = new Date().toISOString();
      setSavedAnnouncements((prev) =>
        prev.map((item) =>
          item.id === activeSavedId
            ? { ...item, sourceUrl: url, updatedAt: nowIso }
            : item
        )
      );
    }
  };

  const handleTogglePin = (id: string) => {
    setSavedAnnouncements((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, isPinned: !item.isPinned } : item
      )
    );
  };

  const handleCancelInitialEdit = () => {
    if (activeSavedId) {
      setSavedAnnouncements((prev) => prev.filter((item) => item.id !== activeSavedId));
      setActiveSavedId(null);
    }
    setOpenInEditMode(false);
    setScreen(resultOrigin === 'list' ? 'list' : 'input');
  };

  const handleToggleDoc = (idx: number) => {
    if (activeSavedId) {
      const nowIso = new Date().toISOString();
      setSavedAnnouncements((prev) =>
        prev.map((item) => {
          if (item.id !== activeSavedId) return item;
          const nextChecked = {
            ...item.checkedDocs,
            [idx]: !item.checkedDocs[idx],
          };
          return { ...item, checkedDocs: nextChecked, updatedAt: nowIso };
        })
      );
    } else {
      setTempCheckedDocs((prev) => ({ ...prev, [idx]: !prev[idx] }));
    }
  };

  const handleChangeApplicationStatus = (status: ApplicationStatus) => {
    setTempStatus(status);
    if (activeSavedId) {
      const nowIso = new Date().toISOString();
      setSavedAnnouncements((prev) =>
        prev.map((item) =>
          item.id === activeSavedId
            ? { ...item, applicationStatus: status, updatedAt: nowIso }
            : item
        )
      );
    }
  };

  const handleChangeMemo = (memoText: string) => {
    setTempMemo(memoText);
    if (activeSavedId) {
      const nowIso = new Date().toISOString();
      setSavedAnnouncements((prev) =>
        prev.map((item) =>
          item.id === activeSavedId
            ? { ...item, memo: memoText, updatedAt: nowIso }
            : item
        )
      );
    }
  };

  const handleChangeEssayDraft = (idx: number, value: string) => {
    setTempEssayDrafts((prev) => ({ ...prev, [idx]: value }));
    if (activeSavedId) {
      const nowIso = new Date().toISOString();
      setSavedAnnouncements((prev) =>
        prev.map((item) => {
          if (item.id !== activeSavedId) return item;
          const nextDrafts = { ...(item.essayDrafts ?? {}), [idx]: value };
          return { ...item, essayDrafts: nextDrafts, updatedAt: nowIso };
        })
      );
    }
  };

  const handleChangeInterviewNote = (idx: number, value: string) => {
    setTempInterviewNotes((prev) => ({ ...prev, [idx]: value }));
    if (activeSavedId) {
      const nowIso = new Date().toISOString();
      setSavedAnnouncements((prev) =>
        prev.map((item) => {
          if (item.id !== activeSavedId) return item;
          const nextNotes = { ...(item.interviewNotes ?? {}), [idx]: value };
          return { ...item, interviewNotes: nextNotes, updatedAt: nowIso };
        })
      );
    }
  };

  const handleToggleBonusOverride = (idx: number, nextMatched: boolean) => {
    if (activeSavedId) {
      const nowIso = new Date().toISOString();
      setSavedAnnouncements((prev) =>
        prev.map((item) => {
          if (item.id !== activeSavedId) return item;
          const nextOverrides = {
            ...(item.bonusOverrides ?? {}),
            [idx]: nextMatched,
          };
          return { ...item, bonusOverrides: nextOverrides, updatedAt: nowIso };
        })
      );
    } else {
      setTempBonusOverrides((prev) => ({ ...prev, [idx]: nextMatched }));
    }
  };

  const handleResetBonusOverrides = () => {
    setTempBonusOverrides({});
    if (activeSavedId) {
      const nowIso = new Date().toISOString();
      setSavedAnnouncements((prev) =>
        prev.map((item) =>
          item.id === activeSavedId
            ? { ...item, bonusOverrides: {}, updatedAt: nowIso }
            : item
        )
      );
    }
  };

  const handleToggleCompare = (id: string) => {
    setSavedAnnouncements((prev) =>
      prev.map((item) =>
        item.id === id
          ? { ...item, selectedForCompare: !item.selectedForCompare }
          : item
      )
    );
  };

  const handleClearCompare = () => {
    setSavedAnnouncements((prev) =>
      prev.map((item) =>
        item.selectedForCompare ? { ...item, selectedForCompare: false } : item
      )
    );
  };

  const handleUpdateAnnouncementStatus = (
    id: string,
    status: ApplicationStatus
  ) => {
    const nowIso = new Date().toISOString();
    setSavedAnnouncements((prev) =>
      prev.map((item) =>
        item.id === id
          ? { ...item, applicationStatus: status, updatedAt: nowIso }
          : item
      )
    );
    if (activeSavedId === id) {
      setTempStatus(status);
    }
  };

  const handleDeleteAnnouncement = (id: string) => {
    const removedIndex = savedAnnouncements.findIndex((item) => item.id === id);
    const removedItem = removedIndex >= 0 ? savedAnnouncements[removedIndex] : null;
    setSavedAnnouncements((prev) => prev.filter((item) => item.id !== id));
    if (activeSavedId === id) {
      setActiveSavedId(null);
    }
    if (removedItem) {
      triggerUndoToast(removedItem, removedIndex, activeSavedId === id);
    }
  };

  const handleExportBackup = () => {
    exportBackupFile(savedAnnouncements, certificates, languageSpecs, skills, profileMeta);
    showTempBackupMessage('백업 파일(.json)을 내려받았습니다');
  };

  const applyBackupOverwrite = (restored: GonggoBackupPayload) => {
    setSavedAnnouncements(restored.savedAnnouncements);
    setCertificates(restored.certificates);
    setLanguageSpecs(restored.languageSpecs);
    if (restored.skills) {
      setSkills(restored.skills);
    }
    if (restored.profileMeta) {
      setProfileMeta(restored.profileMeta);
    }
    setActiveSavedId(null);
    setPendingBackupPayload(null);
    showTempBackupMessage(
      `공고 ${restored.savedAnnouncements.length}건과 내 스펙을 새로 복원했습니다`
    );
  };

  const applyBackupMerge = (restored: GonggoBackupPayload) => {
    const existingIds = new Set(savedAnnouncements.map((item) => item.id));
    const toAdd: SavedAnnouncement[] = [];
    for (const incoming of restored.savedAnnouncements) {
      if (!existingIds.has(incoming.id)) {
        existingIds.add(incoming.id);
        toAdd.push(incoming);
      }
    }
    setSavedAnnouncements((prev) => [...toAdd, ...prev]);

    setCertificates((prev) => {
      const set = new Set(prev);
      restored.certificates.forEach((c) => set.add(c));
      return Array.from(set);
    });
    setLanguageSpecs((prev) => {
      const map = new Map(prev.map((s) => [s.exam, s]));
      restored.languageSpecs.forEach((s) => {
        if (!map.has(s.exam)) map.set(s.exam, s);
      });
      return Array.from(map.values());
    });
    if (restored.skills?.length) {
      setSkills((prev) => {
        const lowerSet = new Set(prev.map((x) => x.toLowerCase()));
        const next = [...prev];
        restored.skills?.forEach((s) => {
          if (!lowerSet.has(s.toLowerCase())) {
            lowerSet.add(s.toLowerCase());
            next.push(s);
          }
        });
        return next;
      });
    }
    setPendingBackupPayload(null);
    showTempBackupMessage(
      toAdd.length > 0
        ? `새 공고 ${toAdd.length}건과 스펙을 기존 목록에 병합했습니다`
        : '새로 추가할 공고가 없어 내 스펙 항목만 병합했습니다'
    );
  };

  const handleImportBackup = async (file: File) => {
    try {
      const raw = await file.text();
      const restored = parseBackupFileContent(raw);
      if (!restored) {
        showTempBackupMessage('올바른 공고정리 백업 파일이 아닙니다');
        return;
      }
      if (savedAnnouncements.length === 0) {
        applyBackupOverwrite(restored);
      } else {
        setPendingBackupPayload(restored);
      }
    } catch {
      showTempBackupMessage('백업 파일을 읽지 못했습니다');
    }
  };

  const handleRequestRecommend = async () => {
    setRecommendError(null);
    setIsRecommending(true);

    try {
      const response = await fetch('/api/recommend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sector: recommendSector,
          targetRole: recommendTargetRole.trim(),
          certificates,
          languageSpecs: languageSpecs.map((l) => ({ exam: l.exam, value: l.value })),
          skills,
          profileMeta,
          excludeOrganizations: savedAnnouncements
            .map((s) => s.analysis.organization?.trim() || '')
            .filter(Boolean),
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload || payload.error) {
        if (response.status === 429 || payload?.quotaExceeded) {
          setRecommendError(
            '요청이 많아 추천 한도에 도달했어요. 잠시 후 다시 시도해 주세요'
          );
        } else {
          setRecommendError(
            payload?.error || '맞춤 기업을 추천하지 못했어요. 다시 시도해 주세요'
          );
        }
        return;
      }

      setRecommendationResult({
        overall_advice: String(payload.overall_advice ?? ''),
        recommendations: Array.isArray(payload.recommendations)
          ? payload.recommendations
          : [],
        generatedAt: new Date().toISOString(),
      });
    } catch {
      setRecommendError('맞춤 기업을 추천하지 못했어요. 다시 시도해 주세요');
    } finally {
      setIsRecommending(false);
    }
  };

  const handleSaveRecommendedCompany = (rec: RecommendedCompany) => {
    const nowIso = new Date().toISOString();
    const newId = generateAnnouncementId();
    const matchedBonusItems = (rec.matched_specs ?? []).map((specText) => ({
      item: specText,
      points: null,
      source: '스펙 맞춤 추천 매칭 요소',
    }));

    const analysis: JobAnalysis = {
      company_type: rec.company_type,
      organization: rec.organization,
      position: rec.recommended_position,
      employment_type: null,
      experience_level:
        profileMeta.careerYears === 0
          ? '신입'
          : typeof profileMeta.careerYears === 'number'
            ? `${profileMeta.careerYears}년+`
            : null,
      location: null,
      headcount: null,
      compensation: null,
      deadline_type: 'rolling',
      tech_skills: skills.length > 0 ? skills.slice(0, 5) : null,
      keywords: rec.matched_specs?.slice(0, 4) ?? null,
      interview_questions: null,
      stages:
        rec.company_type === '공기업'
          ? ['서류전형', '필기전형', '면접전형']
          : ['서류전형', '실무면접', '최종면접'],
      schedule: [],
      eligibility: [],
      bonus_points: matchedBonusItems,
      documents: ['입사지원서 및 자기소개서'],
      essay_questions: [],
    };

    const memoLines = [
      `[스펙 맞춤 추천 · 적합도 ${rec.fit_level}]`,
      rec.fit_summary,
      rec.preparation_tip ? `준비 팁: ${rec.preparation_tip}` : '',
      rec.typical_hiring_period ? `채용 시기: ${rec.typical_hiring_period}` : '',
    ].filter(Boolean);

    const newItem: SavedAnnouncement = {
      id: newId,
      analysis,
      originalText: '',
      attachedFileName: null,
      sourceUrl: null,
      isPinned: false,
      checkedDocs: {},
      categoryTag: `${rec.company_type} · 맞춤 추천`,
      selectedForCompare: savedAnnouncements.filter((x) => x.selectedForCompare).length < 2,
      applicationStatus: '지원 예정',
      memo: memoLines.join('\n'),
      essayDrafts: {},
      interviewNotes: {},
      bonusOverrides: {},
      savedAt: nowIso,
      updatedAt: nowIso,
    };

    setSavedAnnouncements((prev) => [newItem, ...prev]);
  };

  const handleGoAnalyzeWithHint = (companyType: CompanyType) => {
    setCompanyTypeHint(companyType);
    setScreen('input');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const isResultScreen = screen === 'result' && displayedAnalysis !== null;

  return (
    <div className="bg-surface text-on-surface font-body-md text-body-md min-h-screen flex flex-col antialiased selection:bg-secondary-fixed">
      {/* Fixed Header */}
      <header className="fixed top-0 inset-x-0 z-50 bg-surface/90 backdrop-blur-xl pt-safe border-b border-[#e6edf7]">
        <div className="max-w-[480px] lg:max-w-[1040px] mx-auto h-14 lg:h-16 px-gutter lg:px-6 flex items-center justify-between gap-4 lg:gap-8">
          {isResultScreen ? (
            <>
              <div className="flex items-center gap-1.5 min-w-0">
                <button
                  type="button"
                  aria-label="뒤로가기"
                  onClick={() => setScreen(resultOrigin === 'list' ? 'list' : 'input')}
                  className="min-w-[44px] min-h-[44px] -ml-2 flex items-center justify-center rounded-full text-on-surface hover:bg-surface-container-high transition-colors shrink-0"
                >
                  <span className="material-symbols-outlined text-[21px]">
                    arrow_back_ios_new
                  </span>
                </button>
                <div className="w-8 h-8 rounded-lg bg-surface-container-lowest border border-[#e6edf7] flex items-center justify-center overflow-hidden p-0.5 shrink-0">
                  <Mascot variant="explaining" size="xs" className="w-full h-full" />
                </div>
                <h1 className="font-headline-sm text-headline-sm text-on-surface tracking-tight truncate">
                  공고 분석 결과
                </h1>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  aria-label="내 공고에 저장"
                  onClick={handleToggleSave}
                  className={`min-w-[44px] min-h-[44px] px-2 lg:px-3 rounded-xl flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
                    isSaved
                      ? 'bg-secondary-fixed text-secondary'
                      : 'text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface'
                  }`}
                >
                  <span
                    className="material-symbols-outlined text-[21px]"
                    style={isSaved ? { fontVariationSettings: "'FILL' 1" } : undefined}
                  >
                    {isSaved ? 'bookmark_added' : 'bookmark_add'}
                  </span>
                  <span className="hidden lg:inline font-label-md text-label-md">
                    {isSaved ? '저장됨' : '공고 저장'}
                  </span>
                </button>
                <button
                  type="button"
                  aria-label="내 스펙 프로필 관리"
                  onClick={() => setShowSpecModal(true)}
                  className="min-h-[40px] px-3 rounded-xl bg-primary text-on-primary flex items-center justify-center gap-1.5 active:scale-95 transition-transform whitespace-nowrap shrink-0"
                  title="내 스펙 프로필 관리"
                >
                  <span className="material-symbols-outlined text-[18px]">person</span>
                  <span className="hidden sm:inline font-label-sm text-label-sm">내 스펙</span>
                </button>
              </div>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setScreen('input')}
                className="flex items-center gap-2.5 shrink-0 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary/40 rounded-xl"
              >
                <div className="w-10 h-10 rounded-xl bg-surface-container-lowest border border-[#e6edf7] shadow-2xs flex items-center justify-center overflow-hidden p-0.5 shrink-0">
                  <Mascot variant="hello" size="xs" className="w-full h-full" />
                </div>
                <span className="font-headline-sm text-headline-sm text-primary tracking-tight whitespace-nowrap shrink-0">
                  공고정리
                </span>
              </button>

              <nav
                aria-label="주요 화면 이동"
                className="hidden lg:flex items-center gap-7"
              >
                <button
                  type="button"
                  onClick={() => setScreen('input')}
                  aria-current={screen === 'input' ? 'page' : undefined}
                  className={`py-4 font-label-md text-label-md whitespace-nowrap shrink-0 border-b-2 transition-colors ${
                    screen === 'input'
                      ? 'border-secondary text-secondary'
                      : 'border-transparent text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  공고 분석
                </button>
                <button
                  type="button"
                  onClick={() => setScreen('recommend')}
                  aria-current={screen === 'recommend' ? 'page' : undefined}
                  className={`py-4 font-label-md text-label-md whitespace-nowrap shrink-0 border-b-2 transition-colors ${
                    screen === 'recommend'
                      ? 'border-secondary text-secondary'
                      : 'border-transparent text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  맞춤 추천
                </button>
                <button
                  type="button"
                  onClick={() => setScreen('list')}
                  aria-current={screen === 'list' ? 'page' : undefined}
                  className={`py-4 font-label-md text-label-md whitespace-nowrap shrink-0 border-b-2 transition-colors flex items-center gap-1.5 ${
                    screen === 'list'
                      ? 'border-secondary text-secondary'
                      : 'border-transparent text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  <span>내 공고함</span>
                  {savedAnnouncements.length > 0 && (
                    <span className="tabular-nums text-[12px] font-bold text-secondary">
                      {savedAnnouncements.length}
                    </span>
                  )}
                </button>
              </nav>

              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  aria-label="내 공고 목록으로 이동"
                  onClick={() => setScreen('list')}
                  className="lg:hidden min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full text-on-surface-variant hover:text-on-surface transition-colors relative"
                >
                  <span className="material-symbols-outlined text-[22px]">bookmarks</span>
                  {savedAnnouncements.length > 0 && (
                    <span className="absolute top-2 right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-secondary text-on-secondary text-[10px] font-bold flex items-center justify-center tabular-nums">
                      {savedAnnouncements.length}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  aria-label="공정이 사용법 안내"
                  title="공정이 사용법 안내"
                  onClick={() => setShowGuideModal(true)}
                  className="min-w-[40px] min-h-[40px] rounded-xl bg-surface-container-lowest border border-[#e6edf7] text-on-surface-variant hover:text-secondary hover:border-secondary/30 flex items-center justify-center active:scale-95 transition-all shrink-0"
                >
                  <span className="material-symbols-outlined text-[20px]">help</span>
                </button>
                <button
                  type="button"
                  aria-label="내 스펙 프로필 관리"
                  onClick={() => setShowSpecModal(true)}
                  className="min-h-[40px] px-3 lg:px-4 rounded-xl bg-primary hover:bg-on-primary-fixed-variant text-on-primary flex items-center justify-center gap-1.5 active:scale-95 transition-all whitespace-nowrap shrink-0 shadow-xs"
                  title="내 스펙 프로필 관리"
                >
                  <span className="material-symbols-outlined text-[18px]">person</span>
                  <span className="font-label-sm text-label-sm">내 스펙</span>
                </button>
              </div>
            </>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main
        className={`flex-1 w-full max-w-[480px] lg:max-w-[1040px] mx-auto px-gutter lg:px-6 pt-[72px] lg:pt-[84px] bg-surface flex flex-col ${
          isResultScreen ? 'pb-24 lg:pb-12' : 'pb-24 lg:pb-12'
        }`}
      >
        {isResultScreen ? (
          <AnalyzeResultView
            key={activeSavedId ?? 'draft-result'}
            data={displayedAnalysis}
            originalText={displayedOriginalText}
            attachedFileName={displayedAttachedFileName}
            sourceUrl={displayedSourceUrl}
            onChangeSourceUrl={handleChangeSourceUrl}
            isSaved={isSaved}
            onToggleSave={handleToggleSave}
            onUpdateAnalysis={handleUpdateAnalysis}
            checkedDocs={displayedCheckedDocs}
            onToggleDoc={handleToggleDoc}
            certificates={certificates}
            onChangeCertificates={setCertificates}
            languageSpecs={languageSpecs}
            onChangeLanguageSpecs={setLanguageSpecs}
            skills={skills}
            onChangeSkills={setSkills}
            profileMeta={profileMeta}
            onChangeProfileMeta={setProfileMeta}
            applicationStatus={displayedStatus}
            onChangeApplicationStatus={handleChangeApplicationStatus}
            memo={displayedMemo}
            onChangeMemo={handleChangeMemo}
            essayDrafts={displayedEssayDrafts}
            onChangeEssayDraft={handleChangeEssayDraft}
            interviewNotes={displayedInterviewNotes}
            onChangeInterviewNote={handleChangeInterviewNote}
            reusableEssays={reusableEssays}
            bonusOverrides={displayedBonusOverrides}
            onToggleBonusOverride={handleToggleBonusOverride}
            onResetBonusOverrides={handleResetBonusOverrides}
            initialEditing={openInEditMode}
            onCancelInitialEdit={handleCancelInitialEdit}
            similarSavedTitle={
              similarSavedItem
                ? `${similarSavedItem.analysis.organization?.trim() || '기관명 미입력'}${
                    similarSavedItem.analysis.position?.trim()
                      ? ` · ${similarSavedItem.analysis.position.trim()}`
                      : ''
                  }`
                : null
            }
            onOpenSimilarSaved={
              similarSavedItem
                ? () => handleSelectSavedAnnouncement(similarSavedItem.id)
                : undefined
            }
          />
        ) : screen === 'recommend' ? (
          <RecommendView
            certificates={certificates}
            languageSpecs={languageSpecs}
            skills={skills}
            profileMeta={profileMeta}
            savedAnnouncements={savedAnnouncements}
            sector={recommendSector}
            onChangeSector={setRecommendSector}
            targetRole={recommendTargetRole}
            onChangeTargetRole={setRecommendTargetRole}
            result={recommendationResult}
            isLoading={isRecommending}
            errorMessage={recommendError}
            onRequestRecommend={handleRequestRecommend}
            onOpenSpecModal={() => setShowSpecModal(true)}
            onSaveRecommendedCompany={handleSaveRecommendedCompany}
            onOpenSavedAnnouncement={handleSelectSavedAnnouncement}
            onGoAnalyzeWithHint={handleGoAnalyzeWithHint}
          />
        ) : screen === 'list' ? (
          <SavedListView
            items={savedAnnouncements}
            certificates={certificates}
            languageSpecs={languageSpecs}
            skills={skills}
            profileMeta={profileMeta}
            onSelectAnnouncement={handleSelectSavedAnnouncement}
            onChangeAnnouncementStatus={handleUpdateAnnouncementStatus}
            onToggleCompare={handleToggleCompare}
            onTogglePin={handleTogglePin}
            onDuplicateAnnouncement={handleDuplicateAnnouncement}
            onClearCompare={handleClearCompare}
            onDeleteAnnouncement={handleDeleteAnnouncement}
            onCreateManualAnnouncement={handleCreateManualAnnouncement}
            onGoAnalyze={() => setScreen('input')}
            onExportBackup={handleExportBackup}
            onImportBackup={handleImportBackup}
            backupMessage={backupMessage}
          />
        ) : (
          <AnalyzeInputView
            text={inputText}
            onChangeText={setInputText}
            selectedFiles={selectedFiles}
            onChangeFiles={setSelectedFiles}
            companyTypeHint={companyTypeHint}
            onChangeCompanyTypeHint={setCompanyTypeHint}
            sourceUrl={inputSourceUrl}
            onChangeSourceUrl={setInputSourceUrl}
            urgentNotices={urgentNotices}
            onOpenUrgentAnnouncement={handleSelectSavedAnnouncement}
            onAnalyze={handleAnalyze}
            onCancelAnalyze={handleCancelAnalyze}
            isLoading={isLoading}
            errorMessage={errorMessage}
            onClearError={() => setErrorMessage(null)}
            onOpenGuide={() => setShowGuideModal(true)}
          />
        )}
      </main>

      {/* Bottom Tab Navigation (Mobile only) */}
      {!isResultScreen && (
        <nav className="lg:hidden fixed bottom-0 inset-x-0 z-50 pb-safe bg-surface/95 backdrop-blur-xl border-t border-[#e6edf7]">
          <div className="max-w-[480px] mx-auto grid grid-cols-3 items-center h-16 px-space-md">
            <button
              type="button"
              onClick={() => setScreen('input')}
              aria-current={screen === 'input' ? 'page' : undefined}
              className={`flex flex-col items-center justify-center gap-0.5 min-h-[44px] rounded-xl transition-colors whitespace-nowrap shrink-0 ${
                screen === 'input'
                  ? 'text-secondary font-label-md'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              <span
                className="material-symbols-outlined text-[22px]"
                style={
                  screen === 'input'
                    ? { fontVariationSettings: "'FILL' 1" }
                    : { fontVariationSettings: "'FILL' 0" }
                }
              >
                edit_note
              </span>
              <span className="font-label-sm text-label-sm">정리하기</span>
            </button>

            <button
              type="button"
              onClick={() => setScreen('recommend')}
              aria-current={screen === 'recommend' ? 'page' : undefined}
              className={`flex flex-col items-center justify-center gap-0.5 min-h-[44px] rounded-xl transition-colors whitespace-nowrap shrink-0 ${
                screen === 'recommend'
                  ? 'text-secondary font-label-md'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              <span
                className="material-symbols-outlined text-[22px]"
                style={
                  screen === 'recommend'
                    ? { fontVariationSettings: "'FILL' 1" }
                    : { fontVariationSettings: "'FILL' 0" }
                }
              >
                auto_awesome
              </span>
              <span className="font-label-sm text-label-sm">맞춤 추천</span>
            </button>

            <button
              type="button"
              onClick={() => setScreen('list')}
              aria-current={screen === 'list' ? 'page' : undefined}
              className={`flex flex-col items-center justify-center gap-0.5 min-h-[44px] rounded-xl transition-colors whitespace-nowrap shrink-0 ${
                screen === 'list'
                  ? 'text-secondary font-label-md'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              <span
                className="material-symbols-outlined text-[22px]"
                style={
                  screen === 'list'
                    ? { fontVariationSettings: "'FILL' 1" }
                    : { fontVariationSettings: "'FILL' 0" }
                }
              >
                bookmarks
              </span>
              <span className="font-label-sm text-label-sm">내 공고</span>
            </button>
          </div>
        </nav>
      )}

      {/* Global Spec Profile Modal */}
      <SpecProfileModal
        isOpen={showSpecModal}
        onClose={() => setShowSpecModal(false)}
        certificates={certificates}
        onChangeCertificates={setCertificates}
        languageSpecs={languageSpecs}
        onChangeLanguageSpecs={setLanguageSpecs}
        skills={skills}
        onChangeSkills={setSkills}
        profileMeta={profileMeta}
        onChangeProfileMeta={setProfileMeta}
      />

      {/* 3-Step Onboarding & Usage Guide Modal */}
      <GuideModal
        isOpen={showGuideModal}
        onClose={() => setShowGuideModal(false)}
      />

      {/* 백업 불러오기 방식 선택 모달 (병합 vs 덮어쓰기) */}
      {pendingBackupPayload && (
        <div
          className="no-print fixed inset-0 z-50 bg-primary/35 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setPendingBackupPayload(null)}
        >
          <div
            className="w-full max-w-[440px] bg-surface-container-lowest rounded-t-3xl sm:rounded-3xl p-5 shadow-2xl border border-[#e6edf7] space-y-4 mascot-pop"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <Mascot variant="explaining" size="md" />
              <div className="min-w-0 flex-1">
                <h3 className="font-headline-sm text-headline-sm text-primary">
                  백업 파일 불러오기 방식 선택
                </h3>
                <p className="font-body-sm text-body-sm text-on-surface-variant mt-1 leading-relaxed">
                  백업 파일에 공고{' '}
                  <strong className="text-secondary">
                    {pendingBackupPayload.savedAnnouncements.length}건
                  </strong>
                  이 들어 있어요. 현재 저장된 공고 {savedAnnouncements.length}건과
                  어떻게 합칠까요?
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => applyBackupMerge(pendingBackupPayload)}
                className="w-full h-11 rounded-xl bg-secondary hover:bg-on-secondary-fixed-variant text-on-secondary font-label-md text-label-md flex items-center justify-center gap-1.5 active:scale-[0.99] transition-all"
              >
                <span className="material-symbols-outlined text-[18px]">
                  library_add
                </span>
                <span>기존 공고 유지하고 이어 붙이기 (병합)</span>
              </button>
              <button
                type="button"
                onClick={() => applyBackupOverwrite(pendingBackupPayload)}
                className="w-full h-11 rounded-xl bg-surface-container-low hover:bg-error-container hover:text-on-error-container text-on-surface font-label-md text-label-md transition-colors"
              >
                기존 목록 지우고 새로 덮어쓰기
              </button>
              <button
                type="button"
                onClick={() => setPendingBackupPayload(null)}
                className="w-full h-10 rounded-xl text-on-surface-variant hover:bg-surface-container-low font-label-sm text-label-sm transition-colors"
              >
                취소
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 삭제 · 저장 해제 실행 취소(Undo) 토스트 */}
      {deletedUndoItem && (
        <div
          role="status"
          aria-live="polite"
          className="no-print fixed bottom-20 lg:bottom-6 right-4 left-4 sm:left-auto sm:min-w-[320px] z-50 rounded-2xl bg-primary text-on-primary px-4 py-3 shadow-xl flex items-center justify-between gap-3 mascot-pop"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-8 h-8 rounded-lg bg-white p-0.5 flex items-center justify-center overflow-hidden shrink-0">
              <Mascot variant="hello" size="xs" className="w-full h-full" />
            </span>
            <span className="font-body-sm text-body-sm truncate">
              &apos;
              {deletedUndoItem.item.analysis.organization?.trim() || '저장한 공고'}
              &apos; 항목이 삭제되었습니다
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleUndoDelete}
              className="px-3 py-1 rounded-lg bg-secondary-fixed text-on-secondary-fixed font-label-sm text-label-sm hover:bg-white active:scale-95 transition-all whitespace-nowrap"
            >
              실행 취소
            </button>
            <button
              type="button"
              aria-label="알림 닫기"
              onClick={() => setDeletedUndoItem(null)}
              className="w-7 h-7 rounded-full hover:bg-white/10 flex items-center justify-center"
            >
              <span className="material-symbols-outlined text-[16px]">close</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
