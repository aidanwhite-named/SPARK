import { PDFParse } from 'pdf-parse';

export async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  const parser = new PDFParse({ data: buffer });
  const result = await parser.getText();
  await parser.destroy();
  return normalizeKoreanPatentText(result.text);
}

// 특허 원문에서 "목적 및 효과" 섹션을 추출
export function extractPurposeAndEffect(pdfText: string): string | undefined {
  // 합쳐진 섹션 먼저 시도: 【발명의 목적 및 효과】
  const combined = pdfText.match(
    /【\s*(?:발명의\s*)?목적\s*및\s*효과\s*】([\s\S]*?)(?=【|$)/
  );
  if (combined?.[1]?.trim()) return combined[1].trim().slice(0, 3000);

  // 별도 섹션 시도
  const parts: string[] = [];

  const purpose = pdfText.match(/【\s*(?:발명의\s*)?목적\s*】([\s\S]*?)(?=【|$)/);
  if (purpose?.[1]?.trim()) parts.push(purpose[1].trim().slice(0, 1500));

  const effect = pdfText.match(/【\s*(?:발명의\s*)?효과\s*】([\s\S]*?)(?=【|$)/);
  if (effect?.[1]?.trim()) parts.push(effect[1].trim().slice(0, 1500));

  return parts.length > 0 ? parts.join('\n\n') : undefined;
}

function normalizeKoreanPatentText(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/^\s*\d+\s*$/gm, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim();
}
