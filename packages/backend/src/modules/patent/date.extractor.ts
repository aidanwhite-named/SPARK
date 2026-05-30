// 한국 특허 PDF에서 우선권주장일 또는 심사청구일을 추출

export interface ExtractedPatentDate {
  date: string;        // YYYY-MM-DD
  label: string;       // 화면 표시용 레이블
  source: 'priority' | 'examination' | 'filing';
}

// 날짜 패턴: 2023. 01. 15. / 2023.01.15 / 2023년 01월 15일
const DATE_RE = /(\d{4})[.\s년]\s*(\d{1,2})[.\s월]\s*(\d{1,2})/;

function toIso(year: string, month: string, day: string): string {
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

function findDate(text: string, keyword: string): string | null {
  // keyword 뒤 100자 내에서 날짜 검색
  const idx = text.indexOf(keyword);
  if (idx === -1) return null;
  const snippet = text.slice(idx, idx + 100);
  const m = DATE_RE.exec(snippet);
  if (!m) return null;
  return toIso(m[1], m[2], m[3]);
}

export function extractPatentDate(pdfText: string): ExtractedPatentDate | null {
  // 우선순위: 우선권주장 > 심사청구일 > 출원일
  const priorityKeywords = ['우선권주장', '우선일', '우선권 주장'];
  for (const kw of priorityKeywords) {
    const date = findDate(pdfText, kw);
    if (date) return { date, label: '우선권주장일', source: 'priority' };
  }

  const examKeywords = ['심사청구일', '심사청구일자'];
  for (const kw of examKeywords) {
    const date = findDate(pdfText, kw);
    if (date) return { date, label: '심사청구일', source: 'examination' };
  }

  const filingKeywords = ['출원일자', '출원일'];
  for (const kw of filingKeywords) {
    const date = findDate(pdfText, kw);
    if (date) return { date, label: '출원일', source: 'filing' };
  }

  return null;
}
