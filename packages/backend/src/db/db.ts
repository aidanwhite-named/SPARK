import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { join } from 'path';
import { mkdirSync } from 'fs';
import * as schema from './schema.js';

const dataDir = join(process.cwd(), 'data');
mkdirSync(dataDir, { recursive: true });

const DB_PATH = process.env.DB_PATH ?? `file:${join(dataDir, 'workspace.db')}`;

const client = createClient({ url: DB_PATH });
export const db = drizzle(client, { schema });

// ── 테이블 초기화 ─────────────────────────────────────────────
export async function initializeDB() {
  await client.executeMultiple(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      name TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS prompts (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      category TEXT NOT NULL DEFAULT 'general',
      content TEXT NOT NULL,
      variables TEXT DEFAULT '[]',
      is_system INTEGER DEFAULT 0,
      sort_order INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL DEFAULT '새 대화',
      llm_type TEXT NOT NULL,
      prompt_id TEXT REFERENCES prompts(id),
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      llm_type TEXT,
      prompt_id TEXT,
      token_count INTEGER,
      duration_ms INTEGER,
      metadata TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS reports (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      session_id TEXT REFERENCES sessions(id),
      content TEXT NOT NULL,
      format TEXT NOT NULL DEFAULT 'markdown',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS llm_configs (
      id TEXT PRIMARY KEY,
      llm_type TEXT NOT NULL UNIQUE,
      cli_path TEXT,
      default_model TEXT,
      options TEXT,
      is_enabled INTEGER DEFAULT 1,
      updated_at TEXT DEFAULT (datetime('now'))
    );
  `);

  await seedDefaultPrompts();
}

async function seedDefaultPrompts() {
  const result = await client.execute(
    'SELECT COUNT(*) as c FROM prompts WHERE is_system = 1'
  );
  const count = Number((result.rows[0] as any).c);
  if (count > 0) return;

  const defaultPrompts = [
    {
      id: 'sys-general',
      name: '일반 대화',
      description: '기본 대화 모드',
      category: 'general',
      content: '당신은 유능하고 친절한 AI 어시스턴트입니다. 명확하고 간결하게 답변해 주세요.',
      order: 0,
    },
    {
      id: 'sys-news-analysis',
      name: '뉴스 분석',
      description: '뉴스 기사를 분석하고 인사이트를 제공합니다',
      category: 'analysis',
      content: `당신은 전문 뉴스 분석가입니다. 다음 지침에 따라 분석해 주세요:

1. **핵심 요약**: 3줄 이내로 핵심 내용 요약
2. **주요 이슈**: 핵심 쟁점 3가지 추출
3. **배경 분석**: 해당 사건의 맥락과 배경
4. **영향 분석**: 단기/중기/장기 영향 예측
5. **시사점**: 독자가 알아야 할 핵심 인사이트

분석할 내용: {{input}}`,
      order: 1,
    },
    {
      id: 'sys-research',
      name: '리서치 프롬프트',
      description: '주제에 대한 심층 리서치를 수행합니다',
      category: 'research',
      content: `당신은 전문 리서처입니다. 다음 주제에 대해 체계적으로 조사해 주세요:

**주제**: {{input}}

다음 항목을 포함하여 리서치하세요:
1. 개요 및 정의
2. 현황 및 최신 동향
3. 주요 플레이어/관련 기관
4. 핵심 데이터 및 통계
5. 장단점/기회와 위협
6. 전문가 의견 및 예측
7. 참고할 만한 자료 추천`,
      order: 2,
    },
    {
      id: 'sys-report',
      name: '보고서 작성',
      description: '전문적인 보고서 형식으로 작성합니다',
      category: 'report',
      content: `당신은 전문 보고서 작성 전문가입니다. 다음 내용을 바탕으로 전문적인 보고서를 작성해 주세요:

**주제/내용**: {{input}}

보고서 형식:
# [보고서 제목]

## 1. 개요
## 2. 현황 분석
## 3. 주요 발견사항
## 4. 시사점 및 제언
## 5. 결론`,
      order: 3,
    },
    {
      id: 'sys-summary',
      name: '요약',
      description: '긴 텍스트를 핵심 내용으로 요약합니다',
      category: 'utility',
      content: `다음 내용을 핵심만 간결하게 요약해 주세요.

**요약 규칙**:
- 3단계 요약: 1줄 요약 → 3줄 요약 → 핵심 키워드
- 원본의 핵심 정보를 반드시 포함
- 불필요한 수식어 제거

**원문**: {{input}}`,
      order: 4,
    },
  ];

  for (const p of defaultPrompts) {
    await client.execute({
      sql: `INSERT OR IGNORE INTO prompts (id, name, description, category, content, variables, is_system, sort_order)
            VALUES (?, ?, ?, ?, ?, '[]', 1, ?)`,
      args: [p.id, p.name, p.description, p.category, p.content, p.order],
    });
  }
}
