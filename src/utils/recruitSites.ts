// 주요 기업·공공기관의 채용 사이트. 목록에 없으면 구글 검색으로 대체한다.
const RECRUIT_SITES: Record<string, string> = {
  // 공기업·공공기관
  한국토지주택공사: 'https://apply.lh.or.kr',
  LH: 'https://apply.lh.or.kr',
  국민연금공단: 'https://nps.recruiter.co.kr/career/home',
  KDB산업은행: 'https://recruit.kdb.co.kr',
  한국산업은행: 'https://recruit.kdb.co.kr',
  한국마사회: 'https://recruit.kra.co.kr',

  // 삼성
  삼성: 'https://www.samsungcareers.com',
  삼성전자: 'https://www.samsungcareers.com',
  삼성SDS: 'https://www.samsungcareers.com',
  삼성SDI: 'https://www.samsungcareers.com',
  삼성물산: 'https://www.samsungcareers.com',
  삼성바이오로직스: 'https://www.samsungcareers.com',
  삼성디스플레이: 'https://www.samsungcareers.com',

  // 현대·기아
  현대자동차: 'https://talent.hyundai.com',
  현대모비스: 'https://talent.hyundai.com',
  현대건설: 'https://talent.hyundai.com',
  현대제철: 'https://recruit.hyundai-steel.com',
  기아: 'https://career.kia.com',

  // LG
  LG: 'https://careers.lg.com',
  LG전자: 'https://careers.lg.com',
  LG화학: 'https://careers.lg.com',
  LG에너지솔루션: 'https://careers.lg.com',
  LG유플러스: 'https://careers.lg.com',
  LG디스플레이: 'https://careers.lg.com',

  // SK
  SK: 'https://www.skcareers.com',
  SK하이닉스: 'https://www.skcareers.com',
  SK텔레콤: 'https://www.skcareers.com',
  SK이노베이션: 'https://www.skcareers.com',

  // 롯데·CJ·KT
  롯데: 'https://recruit.lotte.co.kr',
  롯데케미칼: 'https://recruit.lotte.co.kr',
  롯데웰푸드: 'https://recruit.lotte.co.kr',
  롯데쇼핑: 'https://recruit.lotte.co.kr',
  CJ: 'https://recruit.cj.net',
  CJ제일제당: 'https://recruit.cj.net',
  KT: 'https://recruit.kt.com',

  // IT·플랫폼·게임
  네이버: 'https://recruit.navercorp.com',
  카카오: 'https://careers.kakao.com',
  카카오뱅크: 'https://recruit.kakaobank.com',
  라인: 'https://careers.linecorp.com',
  LINE: 'https://careers.linecorp.com',
  쿠팡: 'https://www.coupang.jobs/kr',
  토스: 'https://toss.im/career',
  우아한형제들: 'https://career.woowahan.com',
  배달의민족: 'https://career.woowahan.com',
  당근: 'https://careers.daangn.com/jobs/',
  당근마켓: 'https://careers.daangn.com/jobs/',
  엔씨소프트: 'https://careers.ncsoft.com',
  NC: 'https://careers.ncsoft.com',
  크래프톤: 'https://www.krafton.com/careers',
};

const normalize = (s: string) =>
  s
    .replace(/\(주\)|\(유\)|㈜|주식회사/g, '')
    .replace(/[\s()（）]/g, '')
    .toLowerCase();

const NORMALIZED = Object.entries(RECRUIT_SITES).map(
  ([name, url]) => [normalize(name), url] as const
);

export function getRecruitUrl(organization: string): string {
  const org = normalize(organization);
  // 정확히 일치하거나, 긴 기관명이 포함된 경우(예: "한국전력공사(KEPCO)")
  const hit =
    NORMALIZED.find(([name]) => name === org) ??
    NORMALIZED.find(([name]) => name.length >= 5 && org.includes(name));
  if (hit) return hit[1];
  // (AI가 준 주소는 틀려서 안 열리는 경우가 많아 사용하지 않는다)
  // 목록에 없으면 구글 검색창으로 이동
  const q = encodeURIComponent(`${organization.replace(/\(주\)|㈜|주식회사/g, '').trim()} 채용`);
  return `https://www.google.com/search?q=${q}`;
}
