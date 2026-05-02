import type { LawArea } from "./classifyLawArea";

// ── 변시 빈출 쟁점 키워드 사전 ─────────────────────────────────────────────
// bar_sample/ 의 14·15회 변시 + 23·25년 모의시험 채기표 분석을 통해 추출.
// 가중치 기준:
//   3 = 양년 모두 출제된 핵심 쟁점 / 매년 반복 출제
//   2 = 1회 이상 출제 또는 핵심 기본 개념
//   1 = 세부 논점 또는 보조 쟁점
// 텍스트 매칭 대상: 사건명 + 판시사항 + 판결요지

export interface TopicEntry {
  keyword: string;
  weight: 1 | 2 | 3;
}

export const BAR_EXAM_TOPICS: Record<LawArea, TopicEntry[]> = {
  민사법: [
    // === 핵심 (3) ===
    { keyword: "위험부담", weight: 3 },
    { keyword: "이행불능", weight: 3 },
    { keyword: "점유취득시효", weight: 3 },
    { keyword: "소멸시효", weight: 3 },
    { keyword: "공동상속", weight: 3 },
    { keyword: "명의신탁", weight: 3 },
    { keyword: "채권자대위", weight: 3 },
    { keyword: "동시이행", weight: 3 },
    // === 주요 (2) ===
    { keyword: "부당이득", weight: 2 },
    { keyword: "시효중단", weight: 2 },
    { keyword: "상속회복", weight: 2 },
    { keyword: "상속포기", weight: 2 },
    { keyword: "대습상속", weight: 2 },
    { keyword: "대물변제", weight: 2 },
    { keyword: "임대차보증금", weight: 2 },
    { keyword: "합의해제", weight: 2 },
    { keyword: "손해배상", weight: 2 },
    { keyword: "근저당", weight: 2 },
    { keyword: "이행지체", weight: 2 },
    { keyword: "채무불이행", weight: 2 },
    { keyword: "유치권", weight: 2 },
    { keyword: "보증채무", weight: 2 },
    { keyword: "연대채무", weight: 2 },
    { keyword: "표현대리", weight: 2 },
    { keyword: "사해행위", weight: 2 },
    { keyword: "전세권", weight: 2 },
    { keyword: "양도담보", weight: 2 },
    { keyword: "법정지상권", weight: 2 },
    { keyword: "진정명의회복", weight: 2 },
    // === 보충 (1) ===
    { keyword: "혼동", weight: 1 },
    { keyword: "간접점유", weight: 1 },
    { keyword: "압류", weight: 1 },
    { keyword: "전부명령", weight: 1 },
    { keyword: "상계", weight: 1 },
    { keyword: "공제", weight: 1 },
    { keyword: "가등기", weight: 1 },
    { keyword: "유익비", weight: 1 },
    { keyword: "필요비", weight: 1 },
    { keyword: "선순위", weight: 1 },
    { keyword: "불가분채권", weight: 1 },
    { keyword: "지명채권", weight: 1 },
    { keyword: "주채무", weight: 1 },
    { keyword: "물상보증", weight: 1 },
    { keyword: "유언", weight: 1 },
    { keyword: "유류분", weight: 1 },
    { keyword: "기여분", weight: 1 },
  ],
  공법: [
    // === 핵심 (3) ===
    { keyword: "처분성", weight: 3 },
    { keyword: "원고적격", weight: 3 },
    { keyword: "과잉금지", weight: 3 },
    { keyword: "기본권", weight: 3 },
    { keyword: "재량", weight: 3 },
    // === 주요 (2) ===
    { keyword: "행정계획", weight: 2 },
    { keyword: "거부처분", weight: 2 },
    { keyword: "부관", weight: 2 },
    { keyword: "신뢰보호", weight: 2 },
    { keyword: "평등원칙", weight: 2 },
    { keyword: "법률유보", weight: 2 },
    { keyword: "법률우위", weight: 2 },
    { keyword: "비례원칙", weight: 2 },
    { keyword: "헌법소원", weight: 2 },
    { keyword: "직업의 자유", weight: 2 },
    { keyword: "행정심판", weight: 2 },
    { keyword: "취소소송", weight: 2 },
    { keyword: "무효등확인소송", weight: 2 },
    { keyword: "당사자소송", weight: 2 },
    { keyword: "수용재결", weight: 2 },
    { keyword: "보상금", weight: 2 },
    { keyword: "공정력", weight: 2 },
    { keyword: "선결문제", weight: 2 },
    { keyword: "사전통지", weight: 2 },
    { keyword: "행정대집행", weight: 2 },
    { keyword: "정보공개", weight: 2 },
    // === 보충 (1) ===
    { keyword: "면책특권", weight: 1 },
    { keyword: "소급입법", weight: 1 },
    { keyword: "초과조례", weight: 1 },
    { keyword: "예외적 승인", weight: 1 },
    { keyword: "잔여지", weight: 1 },
    { keyword: "예방적 금지", weight: 1 },
    { keyword: "환경영향평가", weight: 1 },
    { keyword: "위헌법률심판", weight: 1 },
    { keyword: "권한쟁의", weight: 1 },
    { keyword: "포괄위임금지", weight: 1 },
    { keyword: "명확성", weight: 1 },
    { keyword: "신분보장", weight: 1 },
  ],
  형사법: [
    // === 핵심 (3) ===
    { keyword: "공범", weight: 3 },
    { keyword: "공동정범", weight: 3 },
    { keyword: "교사범", weight: 3 },
    { keyword: "방조범", weight: 3 },
    { keyword: "미수", weight: 3 },
    { keyword: "친고죄", weight: 3 },
    { keyword: "압수수색", weight: 3 },
    { keyword: "전문증거", weight: 3 },
    { keyword: "위법수집증거", weight: 3 },
    // === 주요 (2) ===
    { keyword: "권리행사방해", weight: 2 },
    { keyword: "뇌물", weight: 2 },
    { keyword: "횡령", weight: 2 },
    { keyword: "사기", weight: 2 },
    { keyword: "배임", weight: 2 },
    { keyword: "인과관계", weight: 2 },
    { keyword: "정당방위", weight: 2 },
    { keyword: "영장주의", weight: 2 },
    { keyword: "강도", weight: 2 },
    { keyword: "절도", weight: 2 },
    { keyword: "상해", weight: 2 },
    { keyword: "폭행", weight: 2 },
    { keyword: "명예훼손", weight: 2 },
    { keyword: "공무집행방해", weight: 2 },
    { keyword: "자백", weight: 2 },
    { keyword: "증거능력", weight: 2 },
    { keyword: "공소시효", weight: 2 },
    { keyword: "재심", weight: 2 },
    { keyword: "긴급체포", weight: 2 },
    { keyword: "현행범", weight: 2 },
    // === 보충 (1) ===
    { keyword: "친족상도례", weight: 1 },
    { keyword: "부진정신분범", weight: 1 },
    { keyword: "상상적 경합", weight: 1 },
    { keyword: "실체적 경합", weight: 1 },
    { keyword: "특신상태", weight: 1 },
    { keyword: "고소추완", weight: 1 },
    { keyword: "불이익변경금지", weight: 1 },
    { keyword: "객관적 귀속", weight: 1 },
    { keyword: "장애미수", weight: 1 },
    { keyword: "중지미수", weight: 1 },
    { keyword: "위법성조각", weight: 1 },
    { keyword: "책임능력", weight: 1 },
    { keyword: "공모공동정범", weight: 1 },
    { keyword: "기소독점", weight: 1 },
  ],
};

export interface ScoreResult {
  score: number;
  matchedTopics: string[];
}

// 사건명 + 판시사항 + 판결요지 텍스트에서 키워드 매칭으로 점수 산출.
// 같은 키워드가 여러 번 등장해도 1회만 가산.
export function scoreCase(area: LawArea, text: string): ScoreResult {
  const topics = BAR_EXAM_TOPICS[area];
  let score = 0;
  const matched: string[] = [];
  for (const t of topics) {
    if (text.includes(t.keyword)) {
      score += t.weight;
      matched.push(t.keyword);
    }
  }
  return { score, matchedTopics: matched };
}
