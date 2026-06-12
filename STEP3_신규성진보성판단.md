# [STEP 3] 신규성·진보성 판단

STEP 2의 구성요소 대비 결과를 기준으로 청구항 1의 신규성 및 진보성을 판단하십시오.

원칙:
- STEP 2에 없는 주 인용발명 대비를 새로 만들지 마십시오.
- 보조 인용발명 원문이 제공된 경우에만 차이구성 보완 여부를 검토하십시오.
- 출력은 JSON만 작성하십시오. Markdown, 설명문, code fence를 쓰지 마십시오.

JSON 형식:
{
  "novelty_items": [
    {
      "label": "(A)",
      "step2_decision": "STEP 2 판정",
      "novelty_treatment": "개시/차이 있음/미개시",
      "basis": "근거 요약"
    }
  ],
  "novelty_conclusion": "인정/부정",
  "novelty_reason": "신규성 이유",
  "differences": [
    {
      "label": "(A)",
      "difference": "차이 내용",
      "technical_significance": "기술적 의의",
      "step2_basis": "STEP 2 근거"
    }
  ],
  "auxiliary_review": [
    {
      "label": "(A)",
      "disclosure": "개시/부분 개시/미개시/검토 불가",
      "basis": "근거",
      "evaluation": "평가"
    }
  ],
  "obviousness_factors": [
    {
      "factor": "결합 동기/설계변경 또는 단순 치환 여부/결합 시 기술적 곤란성",
      "judgment": "판단",
      "basis": "근거"
    }
  ],
  "inventive_step_conclusion": "인정/부정/판단 생략",
  "inventive_step_reason": "진보성 이유",
  "final_conclusion": "유효 가능/무효 가능/추가 검토 필요",
  "final_reason": "최종 결론 핵심 이유",
  "final_opinion": ["최종 의견 bullet"]
}
