// ─────────────────────────────────────────────────────────────
// Report Generation Module
// LLM 응답 → 구조화된 보고서 생성
// ─────────────────────────────────────────────────────────────

import { db } from '../../db/db.js';
import { reports } from '../../db/schema.js';
import { randomUUID } from 'crypto';

export type ReportFormat = 'markdown' | 'html';

export interface ReportSection {
  title: string;
  content: string;
  level?: number;  // 헤딩 레벨 1-3
}

export interface ReportTemplate {
  id: string;
  name: string;
  sections: string[];  // 섹션 순서 정의
}

// 기본 보고서 템플릿들
export const REPORT_TEMPLATES: ReportTemplate[] = [
  {
    id: 'news-report',
    name: '뉴스 분석 보고서',
    sections: ['개요', '주요 사건', '배경 분석', '영향 예측', '시사점'],
  },
  {
    id: 'research-report',
    name: '리서치 보고서',
    sections: ['개요', '현황 분석', '주요 발견사항', '데이터 및 통계', '결론 및 제언'],
  },
  {
    id: 'market-report',
    name: '시장 분석 보고서',
    sections: ['시장 개요', '경쟁 현황', '기회 요인', '위협 요인', '전략적 시사점'],
  },
];

export class ReportGenerator {

  // LLM 응답을 마크다운 보고서로 변환
  async generateFromContent(
    title: string,
    content: string,
    sessionId?: string,
    format: ReportFormat = 'markdown'
  ): Promise<{ id: string; content: string }> {
    const id = randomUUID();
    const formattedContent = this.formatContent(title, content, format);

    await db.insert(reports).values({
      id,
      title,
      sessionId: sessionId ?? null,
      content: formattedContent,
      format,
    });

    return { id, content: formattedContent };
  }

  // 보고서 형식화
  private formatContent(title: string, content: string, format: ReportFormat): string {
    if (format === 'html') {
      return this.toHTML(title, content);
    }
    // 마크다운 — 헤더 추가
    const date = new Date().toLocaleDateString('ko-KR');
    return `# ${title}\n\n> 생성일: ${date} · AI Workspace\n\n---\n\n${content}`;
  }

  private toHTML(title: string, content: string): string {
    // 간단한 마크다운 → HTML 변환 (실제 프로덕션에서는 marked.js 등 사용)
    return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<title>${title}</title>
<style>
  body { font-family: -apple-system, sans-serif; max-width: 800px; margin: 0 auto; padding: 40px; line-height: 1.6; }
  h1, h2, h3 { font-weight: 700; }
  pre { background: #f5f5f5; padding: 16px; border-radius: 8px; overflow-x: auto; }
  code { font-family: 'Fira Code', monospace; }
  blockquote { border-left: 4px solid #7c3aed; padding-left: 16px; color: #6b7280; }
</style>
</head>
<body>
<h1>${title}</h1>
<p style="color:#9ca3af;">생성일: ${new Date().toLocaleDateString('ko-KR')}</p>
<hr>
<div class="content">
${content.replace(/\n/g, '<br>')}
</div>
</body>
</html>`;
  }

  // 파일로 내보내기
  exportAsFile(content: string, filename: string, format: ReportFormat): Buffer {
    return Buffer.from(content, 'utf-8');
  }
}

export const reportGenerator = new ReportGenerator();
