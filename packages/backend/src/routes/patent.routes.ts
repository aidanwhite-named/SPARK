import { FastifyInstance } from 'fastify';
import multipart from '@fastify/multipart';
import { extractTextFromPdf } from '../modules/patent/pdf.extractor.js';
import { buildClaimTrees, extractClaimsFromText } from '../modules/patent/claim.parser.js';
import { analyzeClaimWithLLM, buildMultiTurnPrompt, formatClaimStructure, SEARCH_INSTRUCTIONS } from '../modules/patent/llm.analyzer.js';
import { compareClaims } from '../modules/patent/claim.comparator.js';
import { fetchUrlContent } from '../modules/patent/url.fetcher.js';
import { adapterFactory } from '../adapters/adapter.factory.js';
import { LLMType, LLMRequest } from '../adapters/base.adapter.js';
import { PatentParseResult, ClaimPart } from '../modules/patent/patent.types.js';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export async function patentRoutes(app: FastifyInstance) {
  await app.register(multipart, {
    limits: { fileSize: 50 * 1024 * 1024 },
  });

  // ── PDF 파싱 ─────────────────────────────────────────────────
  // parse 결과와 함께 pdfText도 반환 (미니 채팅 컨텍스트용)
  app.post('/api/patent/parse', async (req, reply) => {
    const data = await req.file();
    if (!data) return reply.status(400).send({ error: 'PDF 파일이 필요합니다' });

    const chunks: Buffer[] = [];
    for await (const chunk of data.file) chunks.push(chunk);
    const buffer = Buffer.concat(chunks);

    const pdfText = await extractTextFromPdf(buffer);
    const claimTexts = extractClaimsFromText(pdfText);

    if (claimTexts.length === 0) {
      return reply.status(422).send({
        error: '청구항을 찾을 수 없습니다. 한국어 특허 PDF인지 확인해주세요.',
      });
    }

    const result = buildClaimTrees(claimTexts);
    // pdfText를 함께 반환 (프론트에서 채팅 컨텍스트로 보관)
    return reply.send({ ...result, pdfText });
  });

  // ── 텍스트 직접 입력 파싱 ─────────────────────────────────────
  // 청구항을 직접 입력할 때 사용. 보조 참고 자료(PDF 또는 URL)를 선택적으로 첨부 가능.
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

    // 참고 자료 추출
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

    // 청구항 파싱 — 헤더가 있으면 다중 항 파싱, 없으면 전체를 1항으로 처리
    const claimTexts = extractClaimsFromText(claimText);
    const result = buildClaimTrees(
      claimTexts.length > 0 ? claimTexts : [{ number: 1, text: claimText.trim() }]
    );

    if (result.trees.length === 0) {
      return reply.status(422).send({ error: '청구항 구조를 파악할 수 없습니다. 독립항 텍스트를 확인해주세요.' });
    }

    return reply.send({ ...result, pdfText: '', contextText, contextSource });
  });

  // ── 특정 청구항 LLM 구성 분석 ────────────────────────────────
  app.post<{ Body: { claimNumber: number; rawText: string } }>(
    '/api/patent/analyze-claim',
    async (req, reply) => {
      const { rawText } = req.body;
      if (!rawText) return reply.status(400).send({ error: 'rawText가 필요합니다' });
      const parts = await analyzeClaimWithLLM(rawText);
      return reply.send({ parts });
    }
  );

  // ── 선행발명 검색 — 멀티턴 SSE ───────────────────────────────
  // 매 요청마다 전체 대화 이력 + pdfText를 받아 단일 프롬프트로 조합
  app.post<{
    Body: {
      claimNumber: number;
      parts: ClaimPart[];
      llmType: string;
      pdfText?: string;
      promptContent?: string;  // 사용자 선택 프롬프트
      messages: ChatMessage[]; // 전체 대화 이력 (마지막이 현재 사용자 메시지)
      contextText?: string;    // 직접 입력 시 참고 자료 텍스트 (PDF 또는 URL)
      contextSource?: 'pdf' | 'url';
    };
  }>('/api/patent/search', async (req, reply) => {
    const { claimNumber, parts, llmType, pdfText, promptContent, messages, contextText, contextSource } = req.body;

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    const send = (data: object) => reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);

    // 청구항 구조 텍스트
    const claimStructure = formatClaimStructure(parts, claimNumber);

    // 첫 번째 사용자 메시지(검색 시작)는 지시문으로 교체
    // — 화면에는 "검색 시작" 표시지만 LLM에는 실제 지시문 전달
    const resolvedMessages = messages.map((m, i) => {
      if (i === 0 && m.role === 'user') {
        // 사용자 커스텀 프롬프트 or 기본 지시문
        let content = promptContent
          ? (promptContent.includes('{{claim}}')
              ? promptContent.replace(/\{\{claim\}\}/g, claimStructure)
              : `${promptContent}\n\n${claimStructure}`)
          : SEARCH_INSTRUCTIONS;
        return { role: 'user' as const, content };
      }
      return m;
    });

    const fullPrompt = buildMultiTurnPrompt(
      pdfText ?? '',
      claimStructure,
      resolvedMessages,
      { contextText, contextSource }
    );
    const adapter = adapterFactory.get((llmType as LLMType) ?? 'claude');

    try {
      await adapter.stream(
        { prompt: '', userInput: fullPrompt, stream: true } as LLMRequest,
        (chunk) => send(chunk)
      );
    } catch (err) {
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
