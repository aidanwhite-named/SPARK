import { adapterFactory } from '../../adapters/adapter.factory.js';
import { LLMType } from '../../adapters/base.adapter.js';
import { PatentParseResult } from './patent.types.js';

// {{input}} 위치에 PDF/청구항 텍스트가 삽입됨 (buildFinalPrompt 동작 방식)
const PARSE_PROMPT = `당신은 특허청구범위 분석 전문가입니다.
아래 텍스트에서 청구항을 추출하고, 반드시 순수 JSON만 반환하세요.
마크다운 코드블록, 설명, 주석 없이 JSON 객체 하나만 출력합니다.

[분석 규칙]
1. 청구범위/특허청구범위 섹션을 찾아 번호가 있는 모든 청구항을 추출합니다.
   (번호가 없으면 전체를 제1항 독립항 1개로 처리)
2. 독립항: 다른 청구항을 인용하지 않는 항
3. 종속항: "제N항에 있어서", "제N항을 인용" 등으로 다른 항을 참조하는 항
4. 독립항 parts 분해 (rawText를 분해):
   · preamble(어두): "~에 있어서" 이전 부분 — 있을 때만 포함
   · component(구성요소): 세미콜론 또는 줄바꿈으로 구분되는 각 기술 구성
       isSimple=true → 명사 1~2개 수준 단순구성 (프로세서, 메모리, 센서 등) → label 없음
       isSimple=false → 동작/기능 포함 복합 구성 → label을 A, B, C … 순서로 부여
   · tail(어미): "포함하는 장치", "수행하는 방법" 등 종결구 — 있을 때만 포함
5. trees: 독립항을 root로, 해당 독립항을 직·간접 인용하는 종속항 전체를 dependents에 포함

[출력 JSON 스키마]
{
  "totalClaims": <전체 청구항 수>,
  "trees": [
    {
      "root": {
        "number": <독립항 번호>,
        "type": "independent",
        "rawText": "<청구항 원문 전체>",
        "parts": [
          { "kind": "preamble", "text": "<어두>", "isSimple": false },
          { "kind": "component", "label": "A", "text": "<구성요소>", "isSimple": false },
          { "kind": "component", "text": "<단순명사>", "isSimple": true },
          { "kind": "tail", "text": "<어미>", "isSimple": false }
        ],
        "needsLLM": false
      },
      "dependents": [
        {
          "number": <종속항 번호>,
          "type": "dependent",
          "rawText": "<청구항 원문 전체>",
          "refersTo": [<직접 인용 번호들>]
        }
      ]
    }
  ]
}

[텍스트]
{{input}}`;

function extractJSON(raw: string): PatentParseResult {
  const stripped = raw.replace(/```(?:json)?\s*/g, '').replace(/\s*```/g, '').trim();
  const match = stripped.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('응답에서 JSON을 찾을 수 없습니다');
  return JSON.parse(match[0]) as PatentParseResult;
}

export async function parseClaimsWithLLM(
  text: string,
  llmType: LLMType = 'claude',
): Promise<PatentParseResult> {
  const adapter = adapterFactory.get(llmType);

  const response = await adapter.complete({
    prompt: PARSE_PROMPT,
    userInput: text,
    temperature: 0,
    maxTokens: 8000,
  });

  const result = extractJSON(response.content);

  if (!Array.isArray(result.trees) || result.trees.length === 0) {
    throw new Error('청구항 구조를 인식하지 못했습니다. PDF에 청구범위가 포함되어 있는지 확인해주세요.');
  }

  return result;
}
