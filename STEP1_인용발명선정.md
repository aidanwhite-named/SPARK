# [STEP 1] 인용발명 선정

출원발명 청구항과 각 인용발명 원문을 비교하여 STEP 2에서 사용할 주 인용발명 1개와, 필요한 경우 보조 인용발명 1개를 선정하십시오.

원칙:
- 업로드 순서는 판단 기준이 아닙니다.
- 문헌에 없는 내용은 추정하지 마십시오.
- 출력은 JSON만 작성하십시오. Markdown, 설명문, code fence를 쓰지 마십시오.

JSON 형식:
{
  "rankings": [
    {
      "source_doc_name": "입력 문헌명",
      "similarity": 0,
      "reason": "핵심 근거 1문장"
    }
  ],
  "primary_doc_name": "주 인용발명 문헌명",
  "auxiliary_doc_name": "보조 인용발명 문헌명 또는 null",
  "primary_reason": "주 인용발명 선정 이유",
  "auxiliary_reason": "보조 인용발명 지정 이유 또는 null"
}
