export function stripHtml(text: string): string {
  return text
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

export function formatOutlineBody(text: string): string {
  // 목차 마커 앞에 줄바꿈 삽입.
  // (?<!\d) : 직전 문자가 숫자인 경우(날짜: 2016. 5. 1.) 제외
  // [1-9]\d{0,2} : 1~3자리 숫자만 (4자리 연도 2016 등 제외)
  return text
    .replace(/(?<!\d)(\S[ \t]+)([1-9]\d{0,2}\. )/g, (_m, pre, marker) => pre.trimEnd() + "\n" + marker)
    .replace(/(\S[ \t]+)([가나다라마바사아자차카타파하]\. )/g, (_m, pre, marker) => pre.trimEnd() + "\n" + marker)
    .replace(/(\S[ \t]+)(\(\d+\) )/g, (_m, pre, marker) => pre.trimEnd() + "\n" + marker)
    .replace(/(?<!\d)(\S[ \t]+)([1-9]\d?\) )/g, (_m, pre, marker) => pre.trimEnd() + "\n" + marker)
    .replace(/(\S[ \t]+)([가나다라마바사아자차카타파하]\) )/g, (_m, pre, marker) => pre.trimEnd() + "\n" + marker);
}

export interface LegalSection {
  heading: string;
  body: string;
}

export function parseLegalSections(text: string): LegalSection[] {
  // 헌재 결정문: [주 문] 등 마커 바로 뒤에 내용이 붙는 경우 줄바꿈 삽입
  const preprocessed = text.replace(/\[([가-힣][가-힣\s]{0,13})\]/g, (m) => "\n" + m);

  const sections: LegalSection[] = [];
  // 【주문】형식(대법원) 및 [주 문] 형식(헌재, 한글+공백만) 모두 지원
  const markerRe = /【([^】]+)】|\[([가-힣][가-힣\s]{0,13})\]/g;
  let lastIndex = 0;
  let lastHeading = "";
  let m: RegExpExecArray | null;
  while ((m = markerRe.exec(preprocessed)) !== null) {
    const body = preprocessed.slice(lastIndex, m.index).trim();
    if (lastIndex > 0 || body) sections.push({ heading: lastHeading, body });
    lastHeading = (m[1] ?? m[2]).trim();
    lastIndex = m.index + m[0].length;
  }
  const remaining = preprocessed.slice(lastIndex).trim();
  if (remaining || lastHeading) sections.push({ heading: lastHeading, body: remaining });
  return sections.filter(s => s.heading || s.body);
}
