# [STEP 2] 구성요소 대비

청구항 1을 구성요소별로 분해하고, 제공된 주 인용발명 원문과 1:1로 대비하십시오.

원칙:
- 주 인용발명은 STEP 1에서 확정된 문헌이며, 표시명은 항상 "인용발명 1"입니다.
- 판정은 "동일", "실질적 동일", "일부 차이", "일부 유사", "차이·대응 없음" 중 하나만 사용하십시오.
- 원문에 명시된 내용만 근거로 사용하십시오.
- 출력은 JSON만 작성하십시오. Markdown, 설명문, code fence를 쓰지 마십시오.

JSON 형식:
{
  "elements": [
    {
      "label": "(A)",
      "claim_element": "청구항 원문 기준 구성요소",
      "element_type": "전제부/특징부/기타",
      "decision": "동일/실질적 동일/일부 차이/일부 유사/차이·대응 없음",
      "similarity": 0,
      "citation_summary_korean": "한국어 요약 또는 번역",
      "quote": "필요한 최소 원문 발췌 또는 없음",
      "location": "문단/페이지/도면/섹션 또는 위치 불명",
      "reasoning": "판단 근거",
      "difference": "차이 내용 또는 없음"
    }
  ],
  "all_elements_disclosed": false,
  "novelty_differences": ["(A)"],
  "inventive_step_targets": [
    {
      "label": "(A)",
      "difference": "진보성에서 검토할 차이 내용"
    }
  ]
}
