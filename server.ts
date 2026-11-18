import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json({ limit: '45mb' }));

const SYSTEM_INSTRUCTION = `너는 한국 공기업·공공기관 및 사기업(대기업·중견·IT·스타트업) 채용공고 분석가야. 공고에서 정보를 뽑아 아래 JSON 형식으로만 답해.
- 공고에 없는 내용은 추측하지 말고 null로 둬.
- company_type은 공기업/공공기관/준정부기관/공사/공단이면 "공기업", 일반 기업/IT/금융/제조 등 민간 기업이면 "사기업"으로 판단해.
- deadline_type은 날짜 마감이 명시되면 "fixed", 상시채용이면 "rolling", "채용 시 마감"/"충원 시 마감"이면 "until_hired"로 넣어.
- 날짜는 YYYY-MM-DD, 시간은 HH:MM으로 써.
- 사기업의 일반 우대사항(예: 유관 경력 우대, 기술 활용 가능자)은 bonus_points에 item과 source를 넣고 points는 null로 둬.
- tech_skills에는 공고에 명시된 기술스택/툴/직무역량 키워드(예: Python, SQL, React, Excel, CAD)를 배열로 넣어.
- keywords에는 지원자가 자기소개서나 면접에서 강조하면 좋을 핵심 역량·가치 키워드 3~5개를 짧은 구문으로 넣어.
- interview_questions에는 공고의 직무·자격요건·우대사항을 바탕으로 실제 면접에서 나올 만한 예상 질문 3개를 넣어.
- 항목마다 근거가 된 공고 원문 문장을 source에 그대로 넣어.
- available_tracks에는 공고의 '모집전형(지원 유형)'을 전부 배열로 넣어(예: 일반, 장애인, 보훈, 지역인재). 전형이 하나뿐이거나 나뉘어 있지 않으면 빈 배열로 둬.
- track_info에는 모집전형마다 지원자가 이해하기 쉬운 한 줄 설명을 [{"track": "전형명", "description": "설명"}] 형태로 넣어. 공고에 그 전형의 대상·조건 설명이 있으면 그 내용을 쉬운 말로 요약하고(예: '누구나 지원 가능', '지정 자격증 보유자만 지원'), 공고에 없으면 일반적으로 알려진 뜻만 간단히 써. 40자 안팎으로 쓰고, 확실하지 않으면 description을 null로 둬. 지어내지 마.
- track_series에는 모집전형별로 지원 가능한 모집분야를 [{"track": "전형명", "series": ["분야"]}] 형태로 넣어. 공고에 전형별 모집분야 표가 있으면 그대로 반영하고(전형마다 분야가 다를 수 있음), 전형 구분이 없으면 빈 배열로 둬.
- available_series에는 공고의 '모집분야(직렬/직군/직무)'를 전부 배열로 넣어(예: 교통안전, 사고조사, 교통교육, 전기, 토목). 하나뿐이거나 나뉘어 있지 않으면 빈 배열로 둬. 모집전형과 모집분야는 서로 다른 축이니 섞지 마.
- '선택 전형'이나 '선택 직렬(모집분야)'이 주어지면 그 조건 기준으로만 정리해. position에는 '분야명 (전형명)' 형식으로 넣고(둘 중 하나만 있으면 그것만), headcount(해당 전형·분야 인원)·eligibility·bonus_points·tech_skills는 공통 항목 + 해당 전형·분야 전용 항목만 넣고 다른 전형·분야 전용 항목은 빼. 공고의 직렬별 표(응시자격, 자격증·면허, 전공, 가산점·우대 자격증)에서 선택 전형·분야에 해당하는 행을 반드시 찾아 eligibility(자격·면허 요건)와 bonus_points(자격증 가산점은 points에 점수)에 넣어. available_tracks와 available_series는 공고 전체 목록을 그대로 유지해.
{
  "available_tracks": [""],
  "track_info": [{"track": "", "description": ""}],
  "track_series": [{"track": "", "series": [""]}],
  "available_series": [""],
  "company_type": "공기업" | "사기업" | null,
  "organization": "", "position": "",
  "employment_type": "", "experience_level": "", "location": "", "headcount": "", "compensation": "",
  "deadline_type": "fixed" | "rolling" | "until_hired" | null,
  "tech_skills": [""],
  "keywords": [""],
  "interview_questions": [""],
  "schedule": [{"step": "", "date": "", "time": "", "source": ""}],
  "eligibility": [{"item": "", "condition": "", "source": ""}],
  "bonus_points": [{"item": "", "points": 0, "source": ""}],
  "documents": [""],
  "stages": [""],
  "essay_questions": [{"question": "", "max_chars": ""}]
}`;

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    available_tracks: { type: Type.ARRAY, nullable: true, items: { type: Type.STRING, nullable: true } },
    track_info: {
      type: Type.ARRAY,
      nullable: true,
      items: {
        type: Type.OBJECT,
        properties: {
          track: { type: Type.STRING, nullable: true },
          description: { type: Type.STRING, nullable: true },
        },
        required: ['track', 'description'],
      },
    },
    track_series: {
      type: Type.ARRAY,
      nullable: true,
      items: {
        type: Type.OBJECT,
        properties: {
          track: { type: Type.STRING, nullable: true },
          series: { type: Type.ARRAY, nullable: true, items: { type: Type.STRING, nullable: true } },
        },
        required: ['track', 'series'],
      },
    },
    available_series: { type: Type.ARRAY, nullable: true, items: { type: Type.STRING, nullable: true } },
    company_type: { type: Type.STRING, nullable: true },
    organization: { type: Type.STRING, nullable: true },
    position: { type: Type.STRING, nullable: true },
    employment_type: { type: Type.STRING, nullable: true },
    experience_level: { type: Type.STRING, nullable: true },
    location: { type: Type.STRING, nullable: true },
    headcount: { type: Type.STRING, nullable: true },
    compensation: { type: Type.STRING, nullable: true },
    deadline_type: { type: Type.STRING, nullable: true },
    tech_skills: {
      type: Type.ARRAY,
      nullable: true,
      items: { type: Type.STRING, nullable: true },
    },
    keywords: {
      type: Type.ARRAY,
      nullable: true,
      items: { type: Type.STRING, nullable: true },
    },
    interview_questions: {
      type: Type.ARRAY,
      nullable: true,
      items: { type: Type.STRING, nullable: true },
    },
    schedule: {
      type: Type.ARRAY,
      nullable: true,
      items: {
        type: Type.OBJECT,
        properties: {
          step: { type: Type.STRING, nullable: true },
          date: { type: Type.STRING, nullable: true },
          time: { type: Type.STRING, nullable: true },
          source: { type: Type.STRING, nullable: true },
        },
        required: ['step', 'date', 'time', 'source'],
      },
    },
    eligibility: {
      type: Type.ARRAY,
      nullable: true,
      items: {
        type: Type.OBJECT,
        properties: {
          item: { type: Type.STRING, nullable: true },
          condition: { type: Type.STRING, nullable: true },
          source: { type: Type.STRING, nullable: true },
        },
        required: ['item', 'condition', 'source'],
      },
    },
    bonus_points: {
      type: Type.ARRAY,
      nullable: true,
      items: {
        type: Type.OBJECT,
        properties: {
          item: { type: Type.STRING, nullable: true },
          points: { type: Type.NUMBER, nullable: true },
          source: { type: Type.STRING, nullable: true },
        },
        required: ['item', 'points', 'source'],
      },
    },
    documents: {
      type: Type.ARRAY,
      nullable: true,
      items: { type: Type.STRING, nullable: true },
    },
    stages: {
      type: Type.ARRAY,
      nullable: true,
      items: { type: Type.STRING, nullable: true },
    },
    essay_questions: {
      type: Type.ARRAY,
      nullable: true,
      items: {
        type: Type.OBJECT,
        properties: {
          question: { type: Type.STRING, nullable: true },
          max_chars: { type: Type.STRING, nullable: true },
        },
        required: ['question', 'max_chars'],
      },
    },
  },
  required: [
    'available_tracks',
    'track_info',
    'track_series',
    'available_series',
    'company_type',
    'organization',
    'position',
    'employment_type',
    'experience_level',
    'location',
    'headcount',
    'compensation',
    'deadline_type',
    'tech_skills',
    'keywords',
    'interview_questions',
    'schedule',
    'eligibility',
    'bonus_points',
    'documents',
    'stages',
    'essay_questions',
  ],
};

interface UploadedInlineFile {
  mimeType: string;
  data: string;
}

function isAllowedMimeType(mimeType: string): boolean {
  const lower = mimeType.trim().toLowerCase();
  return lower === 'application/pdf' || lower.startsWith('image/');
}

function isValidInlineFile(candidate: unknown): candidate is UploadedInlineFile {
  if (!candidate || typeof candidate !== 'object') return false;
  const f = candidate as Record<string, unknown>;
  return (
    typeof f.mimeType === 'string' &&
    isAllowedMimeType(f.mimeType) &&
    typeof f.data === 'string' &&
    f.data.length > 0
  );
}

function isBlockedHostname(hostname: string): boolean {
  const h = hostname.trim().toLowerCase().replace(/^\[|\]$/g, '');
  if (
    h === 'localhost' ||
    h === '127.0.0.1' ||
    h === '::1' ||
    h === '::' ||
    h === '0.0.0.0' ||
    h.endsWith('.local') ||
    h.endsWith('.internal') ||
    h.endsWith('.localhost')
  ) {
    return true;
  }
  // IPv6 ULA / link-local / IPv4-mapped loopback or private
  if (
    h.startsWith('fc') ||
    h.startsWith('fd') ||
    h.startsWith('fe80:') ||
    h.startsWith('::ffff:')
  ) {
    return true;
  }
  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
  if (ipv4) {
    const a = Number(ipv4[1]);
    const b = Number(ipv4[2]);
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
  }
  return false;
}

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, num) => {
      const code = Number(num);
      return Number.isFinite(code) ? String.fromCharCode(code) : '';
    });
}

function decodeHtmlBuffer(bytes: Uint8Array, contentType: string): string {
  const ctLower = contentType.toLowerCase();
  if (ctLower.includes('euc-kr') || ctLower.includes('ks_c_5601')) {
    try {
      return new TextDecoder('euc-kr').decode(bytes);
    } catch {
      // fallback below
    }
  }
  const utf8Text = new TextDecoder('utf-8').decode(bytes);
  const metaCharset = /<meta[^>]+charset=["']?\s*([a-z0-9\-_]+)/i.exec(utf8Text.slice(0, 4096));
  if (metaCharset && /euc-kr|ks_c_5601|cp949/i.test(metaCharset[1])) {
    try {
      return new TextDecoder('euc-kr').decode(bytes);
    } catch {
      // ignore
    }
  }
  return utf8Text;
}

function extractReadableTextFromHtml(html: string): { title: string; text: string } {
  const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  const title = titleMatch ? decodeHtmlEntities(titleMatch[1].replace(/\s+/g, ' ').trim()) : '';

  const stripped = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<(br|\/p|\/div|\/li|\/tr|\/h[1-6]|\/section)[^>]*>/gi, '\n')
    .replace(/<li[^>]*>/gi, '- ')
    .replace(/<[^>]+>/g, ' ');

  const decoded = decodeHtmlEntities(stripped)
    .replace(/[ \t\r]+/g, ' ')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return { title, text: decoded };
}

app.post('/api/fetch-url', async (req, res) => {
  try {
    const rawUrl = typeof req.body?.url === 'string' ? req.body.url.trim() : '';
    if (!rawUrl) {
      res.status(400).json({ error: '채용공고 링크(URL)를 입력해 주세요' });
      return;
    }

    let currentUrl: URL;
    try {
      currentUrl = new URL(rawUrl);
    } catch {
      res.status(400).json({ error: '올바른 http 또는 https 링크를 입력해 주세요' });
      return;
    }

    if (currentUrl.protocol !== 'http:' && currentUrl.protocol !== 'https:') {
      res.status(400).json({ error: '올바른 http 또는 https 링크를 입력해 주세요' });
      return;
    }

    if (isBlockedHostname(currentUrl.hostname)) {
      res.status(400).json({ error: '접근할 수 없는 주소입니다' });
      return;
    }

    let upstream: Response | null = null;
    for (let hop = 0; hop < 4; hop++) {
      const resp = await fetch(currentUrl.toString(), {
        method: 'GET',
        redirect: 'manual',
        signal: AbortSignal.timeout(10000),
        headers: {
          'User-Agent':
            'Mozilla/5.0 (compatible; GonggoJeongri/1.0; +https://gonggojeongri.local)',
          Accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8',
          'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
        },
      });

      if (resp.status >= 300 && resp.status < 400) {
        const loc = resp.headers.get('location');
        if (!loc) {
          upstream = resp;
          break;
        }
        const nextUrl = new URL(loc, currentUrl);
        if (
          (nextUrl.protocol !== 'http:' && nextUrl.protocol !== 'https:') ||
          isBlockedHostname(nextUrl.hostname)
        ) {
          res.status(400).json({ error: '접근할 수 없는 주소로 리다이렉트되었습니다' });
          return;
        }
        currentUrl = nextUrl;
        continue;
      }

      upstream = resp;
      break;
    }

    if (!upstream || !upstream.ok) {
      res.status(422).json({
        error:
          '해당 페이지는 보안 설정 또는 접근 제한으로 바로 읽어올 수 없어요. 공고 텍스트를 복사해 붙여넣거나 화면 캡처 이미지를 첨부해 주세요.',
      });
      return;
    }

    const contentType = upstream.headers.get('content-type') || '';
    if (!contentType.includes('text/html') && !contentType.includes('text/plain')) {
      res.status(422).json({
        error:
          '웹페이지 본문 형식이 아닙니다. PDF나 이미지 파일이라면 아래 첨부 기능으로 올려주세요.',
      });
      return;
    }

    const buf = new Uint8Array(await upstream.arrayBuffer());
    const capped = buf.slice(0, 1_500_000);
    const html = decodeHtmlBuffer(capped, contentType);
    const { title, text } = extractReadableTextFromHtml(html);

    if (text.length < 80) {
      res.status(422).json({
        error:
          '동적 렌더링(로그인·스크립트 전용) 페이지라 본문을 가져오지 못했어요. 공고 내용을 복사해 붙여넣거나 캡처 이미지를 올려주세요.',
      });
      return;
    }

    const combined = title ? `[${title}]\n${text}` : text;
    res.json({
      title,
      finalUrl: currentUrl.toString(),
      text: combined.slice(0, 30000),
    });
  } catch {
    res.status(422).json({
      error:
        '링크를 불러오지 못했어요. 사이트 차단 또는 시간 초과일 수 있으니 본문을 복사해 붙여넣어 주세요.',
    });
  }
});

// AI가 날짜를 "2026.12.01" 이나 "2026-12-01 ~ 2026-12-15" 처럼 주면 앱이 읽지 못하므로
// YYYY-MM-DD 한 개씩으로 정리한다. (범위는 시작/마감 두 항목으로 분리)
function toIsoDate(raw: string): string | null {
  const m = /(\d{4})\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})/.exec(raw);
  if (!m) return null;
  return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
}

function normalizeSchedule(schedule: unknown): unknown {
  if (!Array.isArray(schedule)) return schedule;
  const out: unknown[] = [];
  for (const item of schedule) {
    if (!item || typeof item !== 'object' || typeof (item as any).date !== 'string') {
      out.push(item);
      continue;
    }
    const it = item as { step: string | null; date: string; time: string | null; source: string | null };
    const parts = it.date.split(/\s*(?:~|〜|–|—|부터)\s*/);
    const dates = parts.map(toIsoDate);
    if (parts.length === 2 && dates[0] && dates[1]) {
      const base = (it.step ?? '일정').replace(/\s*(기간|시작|마감)$/, '');
      out.push({ ...it, step: `${base} 시작`, date: dates[0], time: null });
      out.push({ ...it, step: `${base} 마감`, date: dates[1] });
    } else if (dates[0] && parts.length === 1) {
      out.push({ ...it, date: dates[0] });
    } else {
      out.push(item);
    }
  }
  return out;
}

app.post('/api/analyze', async (req, res) => {
  try {
    const { text, file, files, companyTypeHint, series, track } = req.body ?? {};
    const selectedTrack = typeof track === 'string' ? track.trim().slice(0, 60) : '';
    const selectedSeries = typeof series === 'string' ? series.trim().slice(0, 60) : '';
    const trimmedText = typeof text === 'string' ? text.trim() : '';

    const rawFileList = Array.isArray(files) ? files : file ? [file] : [];
    if (rawFileList.length > 5) {
      res.status(400).json({ error: '첨부 파일은 최대 5개까지 지원합니다' });
      return;
    }

    const validFiles: UploadedInlineFile[] = [];
    for (const item of rawFileList) {
      if (!isValidInlineFile(item)) {
        res.status(400).json({ error: 'PDF 또는 이미지 파일만 첨부할 수 있습니다' });
        return;
      }
      validFiles.push(item);
    }

    if (!trimmedText && validFiles.length === 0) {
      res.status(400).json({ error: '공고 내용을 붙여넣거나 파일을 첨부해 주세요' });
      return;
    }

    if (!process.env.GEMINI_API_KEY) {
      res.status(500).json({ error: '공고를 읽지 못했어요. 다시 시도해 주세요' });
      return;
    }

    const ai = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    const parts: Array<
      { inlineData: { mimeType: string; data: string } } | { text: string }
    > = [];

    for (const uploaded of validFiles) {
      parts.push({
        inlineData: {
          mimeType: uploaded.mimeType,
          data: uploaded.data,
        },
      });
    }

    const hintInstruction =
      (companyTypeHint === '공기업' || companyTypeHint === '사기업'
        ? `참고: 사용자는 이 공고를 '${companyTypeHint}' 공고로 선택했습니다. `
        : '') +
      (selectedTrack ? `선택 전형: ${JSON.stringify(selectedTrack)}. ` : '') +
      (selectedSeries
        ? `선택 직렬(모집분야): ${JSON.stringify(selectedSeries)}. `
        : '');

    if (trimmedText) {
      parts.push({
        text: `${hintInstruction}다음 채용공고를 분석해서 지정된 JSON 형식으로만 답해줘.\n\n[채용공고 원문]\n${trimmedText}`,
      });
    } else {
      parts.push({
        text: `${hintInstruction}첨부된 채용공고 파일(PDF 또는 이미지)의 내용을 모두 읽고 분석해서 지정된 JSON 형식으로만 답해줘.`,
      });
    }

    const modelsToTry: Array<{ model: string; thinkingLevel: ThinkingLevel }> = [
      { model: 'gemini-4-hydrogen', thinkingLevel: ThinkingLevel.LOW },
      { model: 'gemini-3.1-flash-lite', thinkingLevel: ThinkingLevel.MINIMAL },
    ];

    let lastError: unknown = null;
    let rawText = '';

    const startedAt = Date.now();
    // 구글 AI가 일시 과부하(503)면 잠깐 기다렸다가 한 번 더 시도한다.
    // (브라우저가 55초에 포기하므로 첫 시도가 빨리 실패했을 때만 재시도)
    for (let attempt = 0; attempt < 2 && !rawText; attempt++) {
      if (attempt === 1) {
        const prev = String((lastError as Error)?.message ?? lastError ?? "");
        const overloaded = prev.includes("503") || prev.includes("UNAVAILABLE");
        if (!overloaded || Date.now() - startedAt > 15000) break;
        await new Promise((r) => setTimeout(r, 2500));
      }
    for (const { model, thinkingLevel } of modelsToTry) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents: { parts },
          config: {
            systemInstruction: SYSTEM_INSTRUCTION,
            responseMimeType: 'application/json',
            responseSchema: RESPONSE_SCHEMA,
            thinkingConfig: { thinkingLevel },
            abortSignal: AbortSignal.timeout(25000),
          },
        });
        rawText = (response.text ?? '').trim();
        if (rawText) {
          break;
        }
      } catch (err) {
        lastError = err;
        const msg = String((err as Error)?.message ?? err);
        const canFallback =
          msg.includes('503') ||
          msg.includes('UNAVAILABLE') ||
          msg.includes('429') ||
          msg.includes('RESOURCE_EXHAUSTED') ||
          msg.includes('TimeoutError') ||
          msg.includes('aborted');
        if (!canFallback) {
          throw err;
        }
      }
    }
    }

    if (!rawText) {
      if (lastError) throw lastError;
      res.status(502).json({ error: '공고를 읽지 못했어요. 다시 시도해 주세요' });
      return;
    }

    const cleanedJson = rawText
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```$/i, '')
      .trim();

    const parsed = JSON.parse(cleanedJson);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      res.status(502).json({ error: '공고를 읽지 못했어요. 다시 시도해 주세요' });
      return;
    }

    parsed.schedule = normalizeSchedule(parsed.schedule);
    res.json(parsed);
  } catch (error) {
    console.error('Gemini analyze error:', error);
    const msg = String((error as Error)?.message ?? error);
    const isQuotaExceeded = msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED');
    res.status(isQuotaExceeded ? 429 : 500).json({
      error: '공고를 읽지 못했어요. 다시 시도해 주세요',
      quotaExceeded: isQuotaExceeded,
    });
  }
});

const RECOMMEND_SYSTEM_INSTRUCTION = `너는 한국 공기업·공공기관 및 사기업(대기업·IT·금융·중견·스타트업) 채용 커리어 컨설턴트야.
사용자의 보유 스펙(학력, 경력, 자격증, 공인어학성적, 직무역량/기술스택)과 희망 직무·선호 기업군을 분석해서 실제로 지원 적합도가 높거나 가산점·우대 혜택을 받을 수 있는 한국 기업/기관 6곳을 추천해 줘.

규칙:
- sector가 "공기업"이면 공기업·공공기관(공사·공단·준정부기관·출연연 등) 6곳만 추천해.
- sector가 "사기업"이면 민간 사기업(대기업·IT 플랫폼·금융·중견·유망 스타트업 등) 6곳만 추천해.
- sector가 "all"이면 공기업 3곳, 사기업 3곳을 균형 있게 추천해.
- company_type은 반드시 "공기업" 또는 "사기업" 중 하나여야 해.
- fit_level은 반드시 "높음", "적합", "도전" 중 하나여야 해.
- typical_hiring_period에는 확인되지 않은 특정 연도·날짜(예: 2026-12-01)를 지어내지 말고, "상·하반기 공채", "수시 채용", "상반기 신입/인턴"처럼 일반적인 채용 형태·시기만 적어.
- matched_specs에는 사용자의 스펙 중 해당 기업/직무에서 실제로 유리하거나 서류·필기 가산점으로 작용할 수 있는 포인트 2~3개를 짧은 구문으로 넣어.
- fit_summary는 왜 이 기업·직무가 사용자 스펙에 맞는지 1~2문장으로 구체적이고 현실적으로 설명해.
- preparation_tip은 합격을 위해 추가로 준비하거나 보완하면 좋은 핵심 포인트 1문장을 적어.
- overall_advice는 공정이 캐릭터가 사용자에게 건네는 친근하고 실질적인 전체 전략 조언 1~2문장으로 적어.`;

const RECOMMEND_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    overall_advice: { type: Type.STRING },
    recommendations: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          company_type: { type: Type.STRING },
          organization: { type: Type.STRING },
          recommended_position: { type: Type.STRING },
          fit_level: { type: Type.STRING },
          fit_summary: { type: Type.STRING },
          matched_specs: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
          preparation_tip: { type: Type.STRING },
          typical_hiring_period: { type: Type.STRING },
        },
        required: [
          'company_type',
          'organization',
          'recommended_position',
          'fit_level',
          'fit_summary',
          'matched_specs',
          'preparation_tip',
          'typical_hiring_period',
        ],
      },
    },
  },
  required: ['overall_advice', 'recommendations'],
};

app.post('/api/recommend', async (req, res) => {
  try {
    const body = req.body ?? {};
    const sector =
      body.sector === '공기업' || body.sector === '사기업' ? body.sector : 'all';
    const targetRole =
      typeof body.targetRole === 'string' ? body.targetRole.trim().slice(0, 120) : '';
    const certificates = Array.isArray(body.certificates)
      ? body.certificates.filter((x: unknown): x is string => typeof x === 'string' && x.trim().length > 0).slice(0, 30)
      : [];
    const skills = Array.isArray(body.skills)
      ? body.skills.filter((x: unknown): x is string => typeof x === 'string' && x.trim().length > 0).slice(0, 30)
      : [];
    const languageSpecs: Array<{ exam: string; value: string }> = Array.isArray(body.languageSpecs)
      ? body.languageSpecs
          .filter(
            (x: unknown): x is { exam: string; value: string } =>
              Boolean(
                x &&
                  typeof x === 'object' &&
                  typeof (x as { exam?: unknown }).exam === 'string' &&
                  typeof (x as { value?: unknown }).value === 'string'
              )
          )
          .slice(0, 10)
      : [];
    const profileMeta =
      body.profileMeta && typeof body.profileMeta === 'object'
        ? (body.profileMeta as { education?: string; careerYears?: number | null })
        : {};
    const excludeOrganizations = Array.isArray(body.excludeOrganizations)
      ? body.excludeOrganizations
          .filter((x: unknown): x is string => typeof x === 'string' && x.trim().length > 0)
          .slice(0, 20)
      : [];

    const hasAnySpec =
      certificates.length > 0 ||
      skills.length > 0 ||
      languageSpecs.length > 0 ||
      Boolean(profileMeta.education) ||
      (profileMeta.careerYears !== null && profileMeta.careerYears !== undefined) ||
      Boolean(targetRole);

    if (!hasAnySpec) {
      res.status(400).json({
        error: '추천을 받으려면 내 스펙을 1개 이상 입력하거나 희망 직무를 적어 주세요',
      });
      return;
    }

    if (!process.env.GEMINI_API_KEY) {
      res.status(500).json({ error: '맞춤 기업을 추천하지 못했어요. 다시 시도해 주세요' });
      return;
    }

    const ai = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    const eduLabel = profileMeta.education ? profileMeta.education : '미입력';
    const careerLabel =
      profileMeta.careerYears === 0
        ? '신입 (경력 없음)'
        : typeof profileMeta.careerYears === 'number'
          ? `${profileMeta.careerYears}년 이상`
          : '미입력';
    const langText =
      languageSpecs.length > 0
        ? languageSpecs.map((l) => `${l.exam} ${l.value}`).join(', ')
        : '없음';
    const certText = certificates.length > 0 ? certificates.join(', ') : '없음';
    const skillText = skills.length > 0 ? skills.join(', ') : '없음';

    const userPrompt = [
      `선호 기업 구분(sector): ${sector === 'all' ? 'all (공기업 3곳 + 사기업 3곳)' : sector}`,
      `희망 직무/키워드: ${targetRole || '스펙에 가장 잘 맞는 직무로 자동 제안'}`,
      `최종학력: ${eduLabel}`,
      `경력: ${careerLabel}`,
      `보유 자격증: ${certText}`,
      `공인 어학성적: ${langText}`,
      `직무 역량/기술스택: ${skillText}`,
      excludeOrganizations.length > 0
        ? `참고(이미 저장한 기업은 가능하면 제외하고 다른 기업 위주 추천): ${excludeOrganizations.join(', ')}`
        : '',
    ]
      .filter(Boolean)
      .join('\n');

    const modelsToTry: Array<{ model: string; thinkingLevel: ThinkingLevel }> = [
      { model: 'gemini-4-hydrogen', thinkingLevel: ThinkingLevel.LOW },
      { model: 'gemini-3.1-flash-lite', thinkingLevel: ThinkingLevel.MINIMAL },
    ];

    let lastError: unknown = null;
    let rawText = '';

    for (const { model, thinkingLevel } of modelsToTry) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents: userPrompt,
          config: {
            systemInstruction: RECOMMEND_SYSTEM_INSTRUCTION,
            responseMimeType: 'application/json',
            responseSchema: RECOMMEND_RESPONSE_SCHEMA,
            thinkingConfig: { thinkingLevel },
            abortSignal: AbortSignal.timeout(25000),
          },
        });
        rawText = (response.text ?? '').trim();
        if (rawText) {
          break;
        }
      } catch (err) {
        lastError = err;
        const msg = String((err as Error)?.message ?? err);
        const canFallback =
          msg.includes('503') ||
          msg.includes('UNAVAILABLE') ||
          msg.includes('429') ||
          msg.includes('RESOURCE_EXHAUSTED') ||
          msg.includes('TimeoutError') ||
          msg.includes('aborted');
        if (!canFallback) {
          throw err;
        }
      }
    }

    if (!rawText) {
      if (lastError) throw lastError;
      res.status(502).json({ error: '맞춤 기업을 추천하지 못했어요. 다시 시도해 주세요' });
      return;
    }

    const cleanedJson = rawText
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```$/i, '')
      .trim();

    const parsed = JSON.parse(cleanedJson);
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.recommendations)) {
      res.status(502).json({ error: '추천 결과를 읽지 못했어요. 다시 시도해 주세요' });
      return;
    }

    res.json(parsed);
  } catch (error) {
    console.error('Gemini recommend error:', error);
    const msg = String((error as Error)?.message ?? error);
    const isQuotaExceeded = msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED');
    res.status(isQuotaExceeded ? 429 : 500).json({
      error: '맞춤 기업을 추천하지 못했어요. 다시 시도해 주세요',
      quotaExceeded: isQuotaExceeded,
    });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
