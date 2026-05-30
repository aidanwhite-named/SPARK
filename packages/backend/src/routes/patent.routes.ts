import { FastifyInstance } from 'fastify';
import multipart from '@fastify/multipart';
import { extractTextFromPdf } from '../modules/patent/pdf.extractor.js';
import { buildClaimTrees, extractClaimsFromText } from '../modules/patent/claim.parser.js';
import { extractPatentDate } from '../modules/patent/date.extractor.js';
import { validateClaims } from '../modules/patent/claim.validator.js';
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
    return reply.send({
      ...result,
      pdfText,
      validation,
      priorityDate: patentDate?.date,
      priorityDateLabel: patentDate?.label,
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
  app.post<{
    Body: {
      claimNumber: number;
      parts: ClaimPart[];
      llmType: string;
      pdfText?: string;
      promptContent?: string;
      messages: ChatMessage[];
      contextText?: string;
      contextSource?: 'pdf' | 'url';
      priorityDate?: string;
      priorityDateLabel?: string;
    };
  }>('/api/patent/search', async (req, reply) => {
    const { claimNumber, parts, llmType, pdfText, promptContent, messages, contextText, contextSource, priorityDate, priorityDateLabel } = req.body;

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });

    // 클라이언트가 연결을 끊어도 서버가 죽지 않도록 소켓 에러를 조용히 처리
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

    const claimStructure = formatClaimStructure(parts, claimNumber);

    const resolvedMessages = messages.map((m, i) => {
      if (i === 0 && m.role === 'user') {
        const content = promptContent
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
      { contextText, contextSource, priorityDate, priorityDateLabel }
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
