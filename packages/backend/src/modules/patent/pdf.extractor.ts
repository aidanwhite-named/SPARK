import { createRequire } from 'module';

const require = createRequire(import.meta.url);

interface PdfData {
  text: string;
  numpages: number;
  info: Record<string, unknown>;
}

// CommonJS 모듈을 ESM에서 로드
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const pdfParse: (buf: Buffer, options?: Record<string, unknown>) => Promise<PdfData> = require('pdf-parse');

export async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  const data = await pdfParse(buffer, { max: 0 }); // max:0 = 모든 페이지
  return normalizeKoreanPatentText(data.text);
}

// 한국 특허 PDF 텍스트 정규화
function normalizeKoreanPatentText(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    // 페이지 번호 행 제거 (숫자만 있는 줄)
    .replace(/^\s*\d+\s*$/gm, '')
    // 불필요한 공백 정리
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim();
}
