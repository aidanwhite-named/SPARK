# ⚡ SPARK

> **S**mart **P**rompt **A**gent **R**esearch **K**it  
> Claude · Gemini를 하나의 인터페이스에서 — 특허 선행발명 검색 특화 AI 워크스페이스

![version](https://img.shields.io/badge/version-1.0.0-violet)
![TypeScript](https://img.shields.io/badge/TypeScript-5.4-blue)
![React](https://img.shields.io/badge/React-18-61DAFB)
![Fastify](https://img.shields.io/badge/Fastify-4-green)
![Vite](https://img.shields.io/badge/Vite-6-646CFF)

---

## 주요 기능

### AI 채팅
- Claude / Gemini 멀티 LLM 지원
- SSE 스트리밍 응답 (실시간 출력)
- 프롬프트 템플릿 CRUD 및 `{{변수}}` 치환
- 대화 히스토리 유지 (멀티턴)
- Markdown + 코드 하이라이트 렌더링

### 선행발명 검색
- **PDF 업로드** — 한국어 특허 PDF에서 청구항 자동 추출
- **직접 입력** — 청구항 텍스트를 직접 타이핑하여 분석
- **참고 자료 연동** — 청구항이 모호할 때 PDF 또는 URL로 해석 기준 제공
- 독립항·종속항 트리 시각화
- 청구항 구성요소(어두 / 구성 A·B·C / 어미) 자동 분해
- LLM 기반 선행발명 단계적 검색 (가중치 부여 → 웹 검색 → 유사도 비교)
- 멀티턴 대화로 검색 범위 조정
- 청구항 동일성·유사성 비교 분석 (여러 독립항 간)

### 보고서 생성
- LLM 응답을 구조화된 보고서로 자동 변환
- Markdown / HTML 두 가지 출력 형식 지원
- 뉴스 분석·리서치·시장 분석 등 기본 보고서 템플릿 제공
- 생성된 보고서 DB 저장 및 파일 내보내기

### 웹 검색 통합
- Gemini CLI 내장 웹 검색 기능 활용
- 검색 결과를 LLM 컨텍스트로 자동 변환
- 검색 → 수집 → 요약 → LLM 전달 파이프라인
- SerpAPI / Brave Search / Tavily 등 외부 검색 API로 교체 가능한 추상화 구조

---

## 요구사항

### Node.js / pnpm

- **Node.js 20 이상** (v24 권장)
- **pnpm 8 이상** (필수)

> [!WARNING]
> 본 프로젝트는 **pnpm 모노레포**입니다. 의존성 충돌 및 네이티브 모듈 에러를 방지하기 위해 `npm install` 대신 반드시 `pnpm install`을 사용하세요. 하위 폴더에 `package-lock.json`이 생성되지 않도록 주의해야 합니다.

```bash
npm install -g pnpm
```

### LLM CLI (사용할 LLM 선택)

```bash
# Claude CLI (필수 권장)
npm install -g @anthropic-ai/claude-code

# Gemini CLI
npm install -g @google/gemini-cli
```

> [!TIP]
> Gemini CLI 연동 시 내부적으로 충돌하는 구형 패키지(`gemini` 시각 테스트 도구)가 다운로드되지 않도록 백엔드 어댑터가 `--no-install` 옵션으로 자체 보호되어 있습니다. 따라서 `@google/gemini-cli`가 제대로 전역 또는 로컬 설치되어 있어야 정상 동작합니다.

---

## 빠른 시작

```bash
# 1. 저장소 클론
git clone <repo-url>
cd spark

# 2. 의존성 설치
pnpm install

# 3. 백엔드 실행 (터미널 1)
pnpm --filter backend dev

# 4. 프론트엔드 실행 (터미널 2)
pnpm --filter frontend dev
```

브라우저에서 `http://localhost:3000` 접속

---

## 프로젝트 구조

```
spark/
├── packages/
│   ├── frontend/                  # React 18 + Vite 6 + Tailwind CSS
│   │   └── src/
│   │       ├── components/
│   │       │   ├── layout/        # Sidebar, 공통 레이아웃
│   │       │   ├── llm/           # LLM 선택, 모델 선택
│   │       │   ├── chat/          # 채팅 UI
│   │       │   └── patent/        # 선행발명 검색 UI
│   │       │       ├── PatentPanel.tsx       # 메인 패널
│   │       │       ├── PatentUpload.tsx      # PDF 업로드 / 직접 입력
│   │       │       ├── ClaimTreePanel.tsx    # 청구항 트리 시각화
│   │       │       └── ClaimDetail.tsx       # 청구항 상세 분석
│   │       ├── store/             # Zustand 상태관리
│   │       ├── types/             # TypeScript 타입
│   │       └── lib/               # API 클라이언트
│   │
│   └── backend/                   # Node.js + Fastify
│       └── src/
│           ├── adapters/          # LLM 어댑터 (Claude / Gemini)
│           ├── executor/          # CLI 실행 엔진
│           ├── routes/            # API 라우트
│           ├── db/                # SQLite + Drizzle ORM
│           └── modules/
│               └── patent/        # 선행발명 검색 모듈
│                   ├── pdf.extractor.ts       # PDF 텍스트 추출
│                   ├── url.fetcher.ts         # URL 내용 가져오기
│                   ├── claim.parser.ts        # 청구항 파싱
│                   ├── claim.validator.ts     # 청구항 정적 검증 (rules/)
│                   ├── date.extractor.ts      # 출원·우선일 추출
│                   ├── llm.analyzer.ts        # LLM 분석 프롬프트
│                   └── claim.comparator.ts    # 청구항 비교 분석
│
└── pnpm-workspace.yaml
```

---

## 선행발명 검색 사용법

### PDF 업로드 방식
1. 사이드바에서 **선행발명 검색** 선택
2. 한국어 특허 PDF 업로드 (드래그&드롭 또는 클릭)
3. 추출된 독립항 중 분석할 항 선택
4. **검색 시작** 클릭 → LLM이 단계별로 선행발명 탐색

### 직접 입력 방식
1. **직접 입력** 탭 선택
2. 청구항 텍스트 입력
   - 헤더(`청구항 1`, `제1항` 등) 포함 시 다수 항 분석 가능
3. (선택) **참고 자료 추가** — 청구항 내용이 모호할 때
   - **PDF 파일**: 발명의 설명 등 관련 문서 업로드
   - **URL**: 특허 데이터베이스·논문 URL 입력 (내용 자동 추출)
4. **청구항 분석 시작** 클릭

> 참고 자료는 LLM이 청구항의 모호한 용어나 기술 개념을 해석하는 데 활용됩니다.

---

## 아키텍처

```
React Frontend (Vite 6 + Zustand)
    │
    ├── /api/chat               → SSE 스트리밍 채팅
    ├── /api/patent/parse       → PDF → 청구항 트리
    ├── /api/patent/parse-text  → 텍스트 + 참고자료(PDF/URL) → 청구항 트리
    └── /api/patent/search      → SSE 스트리밍 선행발명 검색
         │
    Fastify Backend
         │
    LLM 어댑터 → CLI spawn (claude / gemini)
         │
    ├── 보고서 모듈 (Markdown / HTML 생성 + SQLite 저장)
    └── 웹 검색 모듈 (Gemini CLI 검색 → LLM 컨텍스트 변환)
```

### 지원 모델

| LLM | 모델 |
|-----|------|
| Claude | claude-haiku-4-5, claude-sonnet-4-6, claude-opus-4-7 |
| Gemini | gemini-3.1-pro-preview, gemini-3.5-flash, gemini-3.1-flash-lite |

### LLM 어댑터 추가

1. `packages/backend/src/adapters/` 에 새 파일 생성
2. `BaseLLMAdapter` 상속 및 `complete()`, `stream()`, `isAvailable()` 구현
3. `adapter.factory.ts` 에 등록

```typescript
export class OllamaAdapter extends BaseLLMAdapter {
  readonly llmType = 'ollama' as const;
  // ...
}
```

---

## 환경 변수

`packages/backend/.env` (선택):

```env
PORT=3001
```

---

## 데이터베이스 스키마

SQLite + Drizzle ORM 사용. `packages/backend/src/db/schema.ts` 참고.

| 테이블 | 용도 |
|--------|------|
| `prompts` | 프롬프트 템플릿 CRUD |

---

## 로드맵

### Phase 1 — MVP
- [x] 멀티 LLM 선택 (Claude / Gemini)
- [x] SSE 스트리밍 응답
- [x] 프롬프트 템플릿 CRUD
- [x] Markdown + 코드 하이라이트

### Phase 2 — 선행발명 검색
- [x] 한국어 특허 PDF 청구항 자동 추출
- [x] 독립항·종속항 트리 시각화
- [x] LLM 기반 단계적 선행발명 검색
- [x] 청구항 동일성·유사성 비교
- [x] 직접 입력 모드
- [x] PDF / URL 참고 자료로 청구항 해석 보조

### Phase 3 — 보고서 & 검색 통합
- [x] LLM 응답 → 구조화된 보고서 자동 생성 (Markdown / HTML)
- [x] 보고서 템플릿 (뉴스 분석 / 리서치 / 시장 분석)
- [x] 웹 검색 파이프라인 (Gemini CLI 검색 → LLM 컨텍스트)
- [x] 검색 공급자 추상화 인터페이스

### Phase 4 — 고도화
- [ ] 영문 특허 (USPTO, EPO) 지원
- [ ] 선행발명 결과 내보내기 (PDF / Excel)
- [ ] 커스텀 검색 데이터베이스 연동
- [ ] 의견서·보정서 초안 자동 생성
- [ ] SerpAPI / Brave Search / Tavily 외부 검색 API 연동

---

## 보안

- CLI는 샌드박스 환경에서 실행 권장
- 사용자 입력 Zod 스키마 검증
- 운영 환경에서 CORS 도메인 제한 필수
