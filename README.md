# ⚡ SPARK

> **S**mart **P**rompt **A**gent **R**esearch **K**it  
> Claude · Gemini · GPT를 하나의 인터페이스에서 — 프롬프트 기반 AI 워크스페이스

![AI Workspace](https://img.shields.io/badge/version-1.0.0-violet)
![TypeScript](https://img.shields.io/badge/TypeScript-5.4-blue)
![React](https://img.shields.io/badge/React-18-61DAFB)
![Fastify](https://img.shields.io/badge/Fastify-4-green)

## 📋 요구사항

### CLI 설치 (사용할 LLM 선택)

```bash
# Claude CLI (필수 권장)
npm install -g @anthropic-ai/claude-code

# Gemini CLI
npm install -g @google/gemini-cli

# OpenAI CLI (optional)
pip install openai
```

### Node.js

- Node.js 20 이상
- pnpm 8 이상

```bash
npm install -g pnpm
```

---

## 🚀 빠른 시작

```bash
# 1. 저장소 클론
git clone <repo-url>
cd ai-workspace

# 2. 의존성 설치
pnpm install

# 3. 백엔드 실행 (터미널 1)
pnpm --filter backend dev

# 4. 프론트엔드 실행 (터미널 2)
pnpm --filter frontend dev

# 또는 동시 실행
pnpm dev
```

브라우저에서 `http://localhost:3000` 접속

---

## 📁 프로젝트 구조

```
ai-workspace/
├── packages/
│   ├── frontend/          # React + Vite + Tailwind
│   │   └── src/
│   │       ├── components/   # UI 컴포넌트
│   │       ├── store/        # Zustand 상태관리
│   │       ├── lib/          # API 클라이언트 등
│   │       └── types/        # TypeScript 타입
│   │
│   └── backend/           # Node.js + Fastify
│       └── src/
│           ├── adapters/     # LLM 어댑터 (Claude/Gemini/GPT)
│           ├── executor/     # CLI 실행 엔진
│           ├── prompt/       # 프롬프트 관리
│           ├── routes/       # API 라우트
│           ├── db/           # SQLite + Drizzle ORM
│           └── modules/      # 확장 모듈 (웹검색, 보고서)
│
└── pnpm-workspace.yaml
```

---

## 🔧 환경 변수

`packages/backend/.env` 파일 생성:

```env
PORT=3001
NODE_ENV=development
LOG_LEVEL=info
DB_PATH=./data/workspace.db
```

---

## 🏗️ 아키텍처

```
React Frontend
    ↓ SSE Streaming
Fastify Backend
    ↓ spawn()
CLI (claude / gemini / openai)
    ↓
결과 수집 → DB 저장 → 화면 출력
```

### LLM 어댑터 추가 방법

1. `packages/backend/src/adapters/` 에 새 어댑터 파일 생성
2. `BaseLLMAdapter` 클래스 상속 및 `complete()`, `stream()`, `isAvailable()` 구현
3. `adapter.factory.ts` 에 등록

```typescript
// 예: Ollama (로컬 LLM) 어댑터 추가
export class OllamaAdapter extends BaseLLMAdapter {
  readonly llmType = 'ollama' as const;
  // ...
}
```

---

## 🗺️ 로드맵

### Phase 1 — MVP (현재)
- [x] 멀티 LLM 선택 (Claude / Gemini / GPT)
- [x] CLI 기반 실행
- [x] SSE 스트리밍 응답
- [x] 프롬프트 CRUD
- [x] 대화 히스토리 저장
- [x] Markdown 렌더링 + 코드 하이라이트

### Phase 2 — 웹 검색 통합
- [ ] SerpAPI / Brave Search 연동
- [ ] 검색 결과 → LLM 컨텍스트 주입
- [ ] 리서치 파이프라인

### Phase 3 — 에이전트 시스템
- [ ] 프롬프트 체인 (Chain of Thought)
- [ ] 멀티 스텝 태스크
- [ ] 자동 보고서 생성
- [ ] 파일 업로드 & 분석

### Phase 4 — 서비스화
- [ ] 사용자 인증 (Clerk / NextAuth)
- [ ] API 키 직접 연결 모드
- [ ] Electron 앱 래퍼
- [ ] 팀 공유 기능

---

## 🔒 보안

- CLI는 샌드박스 환경에서 실행 권장
- 사용자 입력 Zod 스키마 검증
- 운영 환경에서 CORS 도메인 제한 필수
- `DB_PATH` 환경변수로 DB 위치 관리
