import { FastifyInstance } from 'fastify';
import multipart from '@fastify/multipart';
import { createHash } from 'crypto';
import { extractTextFromPdf, extractPurposeAndEffect } from '../modules/patent/pdf.extractor.js';
import { buildClaimTrees, extractClaimsFromText } from '../modules/patent/claim.parser.js';
import { extractPatentDate } from '../modules/patent/date.extractor.js';
import { validateClaims } from '../modules/patent/claim.validator.js';
import {
  analyzeClaimWithLLM,
  analyzeWeights,
  buildFastSearchPrompt,
  buildMultiTurnPrompt,
  buildSearchInstructions,
  FAST_SEARCH_MODELS,
  formatClaimStructure,
  SEARCH_MODELS,
  WeightItem,
} from '../modules/patent/llm.analyzer.js';
import { compareClaims } from '../modules/patent/claim.comparator.js';
import { fetchUrlContent } from '../modules/patent/url.fetcher.js';
import { adapterFactory } from '../adapters/adapter.factory.js';
import { LLMType, LLMRequest } from '../adapters/base.adapter.js';
import { PatentParseResult, ClaimPart } from '../modules/patent/patent.types.js';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

const CACHE_TTL_MS = 30 * 60 * 1000;
const weightCache = new Map<string, { expiresAt: number; weights: WeightItem[] }>();
const weightInflight = new Map<string, Promise<WeightItem[]>>();
const searchCache = new Map<string, { expiresAt: number; content: string }>();
const searchInflight = new Map<string, Promise<string>>();
const claimAnalysisCache = new Map<string, { expiresAt: number; parts: ClaimPart[] }>();
const claimAnalysisInflight = new Map<string, Promise<ClaimPart[]>>();

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(obj[key])}`).join(',')}}`;
}

function cacheKey(prefix: string, value: unknown): string {
  return `${prefix}:${createHash('sha256').update(stableStringify(value)).digest('hex')}`;
}

function getFresh<T>(cache: Map<string, { expiresAt: number; } & T>, key: string): ({ expiresAt: number; } & T) | undefined {
  const hit = cache.get(key);
  if (!hit) return undefined;
  if (hit.expiresAt <= Date.now()) {
    cache.delete(key);
    return undefined;
  }
  return hit;
}

export async function patentRoutes(app: FastifyInstance) {
  await app.register(multipart, {
    limits: { fileSize: 50 * 1024 * 1024 },
  });

  // ── PDF 파싱 ─────────────────────────────────────────────────
  app.post('/api/patent/parse', async (req, reply) => {
    const data = await req.file();
    if (!data) return reply.status(400).send({ error: 'PDF 파일이 필요합니다' });

    const chunks: Buffer[] = [];
    for await (const chunk of data.file) chunks.push(chunk);
    const buffer = Buffer.concat(chunks);

    let pdfText: string;
    try {
      pdfText = await extractTextFromPdf(buffer);
    } catch (e) {
      return reply.status(422).send({ error: `PDF를 읽을 수 없습니다: ${String(e)}` });
    }

    const claimTexts = extractClaimsFromText(pdfText);

    if (claimTexts.length === 0) {
      return reply.status(422).send({
        error: '청구항을 찾을 수 없습니다. 한국어 특허 PDF인지 확인해주세요.',
      });
    }

    const validation = validateClaims(claimTexts, pdfText);
    const result = buildClaimTrees(claimTexts);
    const patentDate = extractPatentDate(pdfText);
    const purposeAndEffect = extractPurposeAndEffect(pdfText);
    console.log('[DEBUG] purposeAndEffect:', purposeAndEffect ? purposeAndEffect.slice(0, 100) : null);
    const headers = [...pdfText.matchAll(/[【\[〔<][^】\]〕>]{1,30}[】\]〕>]/g)].slice(0, 20).map(m => m[0]);
    console.log('[DEBUG] PDF 섹션헤더 샘플:', headers);
    return reply.send({
      ...result,
      pdfText,
      validation,
      priorityDate: patentDate?.date,
      priorityDateLabel: patentDate?.label,
      purposeAndEffect,
    });
  });

  // ── 텍스트 직접 입력 파싱 ─────────────────────────────────────
  app.post('/api/patent/parse-text', async (req, reply) => {
    let claimText = '';
    let contextUrl = '';
    let contextPdfBuffer: Buffer | null = null;

    const parts = req.parts();
    for await (const part of parts) {
      if (part.type === 'file' && part.fieldname === 'contextPdf') {
        const chunks: Buffer[] = [];
        for await (const chunk of part.file) chunks.push(chunk);
        contextPdfBuffer = Buffer.concat(chunks);
      } else if (part.type === 'field') {
        if (part.fieldname === 'claimText') claimText = String(part.value);
        if (part.fieldname === 'contextUrl') contextUrl = String(part.value);
      }
    }

    if (!claimText.trim()) {
      return reply.status(400).send({ error: '청구항 텍스트가 필요합니다' });
    }

    let contextText: string | undefined;
    let contextSource: 'pdf' | 'url' | undefined;

    if (contextPdfBuffer && contextPdfBuffer.length > 0) {
      try {
        contextText = await extractTextFromPdf(contextPdfBuffer);
        contextSource = 'pdf';
      } catch {
        return reply.status(422).send({ error: '참고 PDF를 읽을 수 없습니다' });
      }
    } else if (contextUrl.trim()) {
      try {
        contextText = await fetchUrlContent(contextUrl.trim());
        contextSource = 'url';
      } catch (e) {
        return reply.status(422).send({ error: `URL 접근 실패: ${String(e)}` });
      }
    }

    const claimTexts = extractClaimsFromText(claimText);
    const result = buildClaimTrees(
      claimTexts.length > 0 ? claimTexts : [{ number: 1, text: claimText.trim() }]
    );

    if (result.trees.length === 0) {
      return reply.status(422).send({ error: '청구항 구조를 파악할 수 없습니다. 독립항 텍스트를 확인해주세요.' });
    }

    return reply.send({ ...result, pdfText: '', contextText, contextSource });
  });

  // ── 청구항 LLM 구성 분석 ──────────────────────────────────────
  app.post<{ Body: { claimNumber: number; rawText: string } }>(
    '/api/patent/analyze-claim',
    async (req, reply) => {
      const { rawText } = req.body;
      if (!rawText) return reply.status(400).send({ error: 'rawText가 필요합니다' });
      const key = cacheKey('claim-analysis', { rawText });
      const cached = getFresh(claimAnalysisCache, key);
      if (cached) return reply.send({ parts: cached.parts, cached: true });

      let promise = claimAnalysisInflight.get(key);
      if (!promise) {
        promise = analyzeClaimWithLLM(rawText);
        claimAnalysisInflight.set(key, promise);
      }

      const parts = await promise.finally(() => claimAnalysisInflight.delete(key));
      claimAnalysisCache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, parts });
      return reply.send({ parts });
    }
  );

  // ── 구성 가중치 분석 — 경량 모델 ─────────────────────────────
  app.post<{
    Body: {
      claimNumber: number;
      parts: ClaimPart[];
      dependentClaimText?: string;
      llmType: string;
    };
  }>('/api/patent/weight', async (req, reply) => {
    const { claimNumber, parts, dependentClaimText, llmType } = req.body;
    const t0 = Date.now();
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`[WEIGHT] ▶ 시작 | claim=${claimNumber} | llm=${llmType} | parts=${parts?.length}`);
    console.log(`[WEIGHT]   dep=${!!dependentClaimText}`);
    try {
      const key = cacheKey('weight', { claimNumber, parts, dependentClaimText, llmType });
      const cached = getFresh(weightCache, key);
      if (cached) {
        console.log(`[WEIGHT] cache hit | claim=${claimNumber} | llm=${llmType}`);
        return reply.send({ weights: cached.weights, cached: true });
      }

      let promise = weightInflight.get(key);
      if (!promise) {
        promise = analyzeWeights(parts, claimNumber, llmType, dependentClaimText);
        weightInflight.set(key, promise);
      }

      const weights = await promise.finally(() => weightInflight.delete(key));
      weightCache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, weights });
      console.log(`[WEIGHT] ✅ 완료 in ${Date.now() - t0}ms | weights=${weights.length}개`);
      return reply.send({ weights });
    } catch (err) {
      console.error(`[WEIGHT] ❌ 오류 in ${Date.now() - t0}ms`, err);
      return reply.status(500).send({ error: String(err) });
    }
  });

  // ── 선행발명 검색 — 멀티턴 SSE ───────────────────────────────
  app.post<{
    Body: {
      claimNumber: number;
      parts: ClaimPart[];
      dependentClaimText?: string;
      llmType: string;
      pdfText?: string;
      promptContent?: string;
      messages: ChatMessage[];
      contextText?: string;
      contextSource?: 'pdf' | 'url';
      priorityDate?: string;
      priorityDateLabel?: string;
      weights?: WeightItem[];   // 사전 분석된 가중치 (있으면 step2 건너뜀)
      mode?: 'fast' | 'precise';
      fastResult?: string;
    };
  }>('/api/patent/search', async (req, reply) => {
    const {
      claimNumber, parts, dependentClaimText, llmType, pdfText, promptContent,
      messages, contextText, contextSource, priorityDate, priorityDateLabel, weights,
      mode = 'precise', fastResult,
    } = req.body;

    const t0 = Date.now();
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`[SEARCH] ▶ 시작 | claim=${claimNumber} | llm=${llmType} | mode=${mode}`);
    console.log(`[SEARCH]   parts=${parts?.length} | messages=${messages?.length} | weights=${weights?.length ?? 0}개 사전제공`);
    console.log(`[SEARCH]   pdfText=${pdfText?.length ?? 0} bytes | contextText=${contextText?.length ?? 0} bytes | priorityDate=${priorityDate ?? 'none'}`);

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });

    reply.raw.on('error', () => { /* ignore EPIPE / write-after-close */ });

    let closed = false;
    reply.raw.on('close', () => { closed = true; });

    const send = (data: object) => {
      if (closed || reply.raw.destroyed) return;
      try {
        reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
      } catch {
        closed = true;
      }
    };

    try {
      const claimStructure = formatClaimStructure(parts, claimNumber);
      console.log(`[SEARCH]   claimStructure preview: ${claimStructure.slice(0, 120)}`);

      // 첫 번째 user 메시지의 내용 결정
      // - 가중치 사전 제공 → buildSearchInstructions(weights)
      // - 커스텀 프롬프트 → promptContent 적용
      // - 기본 → SEARCH_INSTRUCTIONS
      const resolvedMessages = messages.map((m, i) => {
        if (i === 0 && m.role === 'user') {
          let content: string;
          if (weights && weights.length > 0) {
            content = buildSearchInstructions(weights);
          } else if (promptContent) {
            content = promptContent.includes('{{claim}}')
              ? promptContent.replace(/\{\{claim\}\}/g, claimStructure)
              : `${promptContent}\n\n${claimStructure}`;
          } else {
            content = buildSearchInstructions();
          }
          if (fastResult?.trim()) {
            content += `\n\n[빠른검색 결과 캐시]\n아래는 직전 빠른검색에서 이미 확인한 후보와 검색 방향이다. 중복 탐색은 줄이고, 누락 가능성이 큰 핵심 구성 위주로 정밀하게 재검색하라.\n${fastResult.slice(0, 12000)}`;
          }
          return { role: 'user' as const, content };
        }
        return m;
      });

      const tPrompt = Date.now();
      const fullPrompt = mode === 'fast'
        ? buildFastSearchPrompt({
            claimStructure,
            dependentClaimText,
            promptContent,
            priorityDate,
            priorityDateLabel,
          })
        : buildMultiTurnPrompt(
            pdfText ?? '',
            claimStructure,
            resolvedMessages,
            { contextText, contextSource, priorityDate, priorityDateLabel, dependentClaimText }
          );
      console.log(`[SEARCH]   fullPrompt built in ${Date.now() - tPrompt}ms | length=${fullPrompt.length} bytes`);

      // 검색에는 더 강력한 모델 사용
      const searchModel = mode === 'fast'
        ? (FAST_SEARCH_MODELS[llmType] ?? FAST_SEARCH_MODELS.claude)
        : (SEARCH_MODELS[llmType] ?? SEARCH_MODELS.claude);
      const searchKey = cacheKey('search', { mode, llmType, searchModel, fullPrompt });
      const cached = getFresh(searchCache, searchKey);
      if (cached) {
        console.log(`[SEARCH] cache hit | claim=${claimNumber} | llm=${llmType}`);
        send({ type: 'chunk', content: cached.content, cached: true });
        send({ type: 'done', cached: true });
        return;
      }

      const inflight = searchInflight.get(searchKey);
      if (inflight) {
        console.log(`[SEARCH] join in-flight request | claim=${claimNumber} | llm=${llmType}`);
        const content = await inflight;
        send({ type: 'chunk', content, cached: true });
        send({ type: 'done', cached: true });
        return;
      }

      console.log(`[SEARCH] ⚡ LLM 스트림 시작 | model=${searchModel}`);
      const adapter = adapterFactory.get((llmType as LLMType) ?? 'claude');
      let chunkCount = 0;
      let accumulated = '';
      const streamPromise = adapter.stream(
          { prompt: '', userInput: fullPrompt, stream: true, model: searchModel } as LLMRequest,
          (chunk) => {
            if (chunk.type === 'chunk') {
              chunkCount++;
              accumulated += chunk.content ?? '';
            }
            send(chunk);
          }
        )
        .then(() => {
          searchCache.set(searchKey, { expiresAt: Date.now() + CACHE_TTL_MS, content: accumulated });
          return accumulated;
        })
        .finally(() => searchInflight.delete(searchKey));
      searchInflight.set(searchKey, streamPromise);
      await streamPromise;
      console.log(`[SEARCH] ✅ 스트림 완료 in ${Date.now() - t0}ms | SSE chunks=${chunkCount}`);
    } catch (err) {
      console.error(`[SEARCH] ❌ 오류 in ${Date.now() - t0}ms`, err);
      send({ type: 'error', error: String(err) });
    } finally {
      reply.raw.end();
    }
  });

  // ── 청구항 동일성·유사성 비교 ─────────────────────────────────
  app.post<{ Body: PatentParseResult }>('/api/patent/compare', async (req, reply) => {
    const result = req.body;
    if (!result?.trees?.length) return reply.status(400).send({ error: 'trees가 필요합니다' });
    const compareResult = await compareClaims(result);
    return reply.send(compareResult);
  });
}
