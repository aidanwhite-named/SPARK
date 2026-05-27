// ─────────────────────────────────────────────────────────────
// Web Search Module — 향후 확장을 위한 기반 구조
// 현재는 인터페이스 정의 + 기본 구현체 제공
// 실제 사용 시 SerpAPI / Brave Search / Tavily API 연결
// ─────────────────────────────────────────────────────────────

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  publishedAt?: string;
  source?: string;
}

export interface SearchQuery {
  query: string;
  maxResults?: number;
  dateRange?: 'day' | 'week' | 'month' | 'year';
  language?: string;
}

// 검색 공급자 인터페이스 — 새 검색 엔진 추가 시 이것만 구현
export interface SearchProvider {
  readonly name: string;
  search(query: SearchQuery): Promise<SearchResult[]>;
  isAvailable(): Promise<boolean>;
}

// ── CLI 기반 검색 (현재 구현체) ─────────────────────────────
// Gemini CLI의 웹 검색 기능 또는 별도 검색 CLI 활용
import { CLIExecutor } from '../../executor/cli.executor.js';

export class CLISearchProvider implements SearchProvider {
  readonly name = 'cli-search';
  private executor = new CLIExecutor();

  async isAvailable(): Promise<boolean> {
    // gemini CLI는 웹 검색 내장 지원
    try {
      await this.executor.run('gemini', ['--version'], { timeout: 3000 });
      return true;
    } catch {
      return false;
    }
  }

  async search(query: SearchQuery): Promise<SearchResult[]> {
    // gemini CLI의 웹 검색 기능 활용 예시
    // 실제 CLI 명령어는 설치된 CLI에 따라 조정 필요
    const prompt = `다음 키워드로 웹 검색을 수행하고 결과를 JSON 배열로 반환해 주세요.
키워드: "${query.query}"
최대 결과: ${query.maxResults ?? 5}

반환 형식:
[{"title": "...", "url": "...", "snippet": "...", "publishedAt": "...", "source": "..."}]

JSON만 반환하고 다른 텍스트는 포함하지 마세요.`;

    try {
      const result = await this.executor.run('gemini', ['-p', prompt], { timeout: 30000 });
      const jsonMatch = result.stdout.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch {
      // 파싱 실패 시 빈 결과
    }
    return [];
  }
}

// ── 검색 파이프라인 ──────────────────────────────────────────
// 검색 → 수집 → 요약 → LLM 전달 흐름
export class SearchPipeline {
  constructor(private provider: SearchProvider) {}

  // 검색 후 결과를 LLM에 전달할 컨텍스트로 변환
  async buildSearchContext(query: SearchQuery): Promise<string> {
    const results = await this.provider.search(query);

    if (results.length === 0) {
      return `검색 결과 없음: "${query.query}"`;
    }

    const context = results.map((r, i) =>
      `[${i + 1}] **${r.title}**\n출처: ${r.url}\n${r.snippet}`
    ).join('\n\n');

    return `## 웹 검색 결과: "${query.query}"\n\n${context}`;
  }

  // 검색 결과 + 사용자 질문 → LLM 프롬프트 조합
  async buildResearchPrompt(query: SearchQuery, userQuestion: string): Promise<string> {
    const context = await this.buildSearchContext(query);

    return `${context}

---

위 검색 결과를 참고하여 다음 질문에 답하세요:
${userQuestion}

답변 시 출처를 [1], [2] 형식으로 인용해 주세요.`;
  }
}

export const searchPipeline = new SearchPipeline(new CLISearchProvider());
