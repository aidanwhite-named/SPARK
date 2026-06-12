import os
import json
import re
import shutil
import subprocess
import threading
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path

from flask import Flask, jsonify, render_template, request
from werkzeug.utils import secure_filename


BASE_DIR = Path(__file__).resolve().parent
UPLOAD_DIR = BASE_DIR / "uploads"
RESULT_DIR = BASE_DIR / "results"
LOG_DIR = BASE_DIR / "logs"
PROMPT_FILES = {
    "step1": BASE_DIR / "STEP1_인용발명선정.md",
    "step2": BASE_DIR / "STEP2_구성요소대비.md",
    "step3": BASE_DIR / "STEP3_신규성진보성판단.md",
}

UPLOAD_DIR.mkdir(exist_ok=True)
RESULT_DIR.mkdir(exist_ok=True)
LOG_DIR.mkdir(exist_ok=True)

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 80 * 1024 * 1024

STEP1_REFERENCE_CHAR_LIMIT = 8_000
STEP2_REFERENCE_CHAR_LIMIT = 28_000
STEP3_AUXILIARY_CHAR_LIMIT = 22_000
JSON_INDENT = 2

AI_PROVIDERS = {
    "gemini": {
        "label": "Gemini CLI",
        "executable": "gemini",
        "models": ["gemini-3.1-flash-lite", "gemini-2.5-flash", "gemini-3.1-pro-preview"],
    },
    "gpt": {
        "label": "GPT CLI",
        "executable": "gpt",
        "models": ["gpt-5", "gpt-5-mini", "gpt-4.1", "gpt-4.1-mini"],
    },
}

HISTORY_HIDDEN_FILE = RESULT_DIR / ".history_hidden.json"


@dataclass
class Job:
    id: str
    status: str = "queued"
    message: str = "대기 중"
    created_at: float = field(default_factory=time.time)
    results: dict = field(default_factory=dict)
    error: str | None = None
    output_file: str | None = None


jobs: dict[str, Job] = {}


def normalize_settings(settings: dict) -> dict:
    provider = settings.get("ai_provider", "gemini").strip().lower()
    if provider not in AI_PROVIDERS:
        provider = "gemini"

    normalized = dict(settings)
    normalized["ai_provider"] = provider
    if not normalized.get("cli_executable", "").strip():
        normalized["cli_executable"] = AI_PROVIDERS[provider]["executable"]

    try:
        timeout = int(normalized.get("timeout", 900))
    except (TypeError, ValueError):
        timeout = 900
    normalized["timeout"] = max(timeout, 60)
    return normalized


def read_prompt(name: str) -> str:
    return PROMPT_FILES[name].read_text(encoding="utf-8")


def write_json(path: Path, data: dict | list) -> None:
    path.write_text(
        json.dumps(data, ensure_ascii=False, indent=JSON_INDENT),
        encoding="utf-8",
    )


def read_json(path: Path) -> dict | list:
    return json.loads(path.read_text(encoding="utf-8"))


def safe_job_id(job_id: str) -> str:
    if not re.fullmatch(r"[0-9a-fA-F]{12}", job_id or ""):
        raise ValueError("Invalid job id")
    return job_id.lower()


def read_hidden_history() -> set[str]:
    if not HISTORY_HIDDEN_FILE.exists():
        return set()
    try:
        data = read_json(HISTORY_HIDDEN_FILE)
    except (OSError, json.JSONDecodeError):
        return set()
    if not isinstance(data, list):
        return set()
    return {str(item) for item in data}


def write_hidden_history(hidden: set[str]) -> None:
    write_json(HISTORY_HIDDEN_FILE, sorted(hidden))


def get_report_path(job_id: str) -> Path:
    return RESULT_DIR / f"analysis_{safe_job_id(job_id)}.md"


def get_history_item(job_id: str) -> dict | None:
    try:
        report_path = get_report_path(job_id)
    except ValueError:
        return None
    if not report_path.exists():
        return None

    job_dir = UPLOAD_DIR / job_id
    claim_preview = ""
    model = ""
    provider = ""
    references: list[str] = []

    claim_path = job_dir / "claim.json"
    if claim_path.exists():
        try:
            claim_data = read_json(claim_path)
            claim_preview = str(claim_data.get("claim", "")).strip()
        except (OSError, json.JSONDecodeError, AttributeError):
            claim_preview = ""

    settings_path = job_dir / "settings.json"
    if settings_path.exists():
        try:
            settings_data = read_json(settings_path)
            provider = str(settings_data.get("ai_provider", "")).strip()
            model = str(settings_data.get("model", "")).strip()
        except (OSError, json.JSONDecodeError, AttributeError):
            provider = ""
            model = ""

    prior_docs_path = job_dir / "prior_docs.json"
    if prior_docs_path.exists():
        try:
            prior_docs = read_json(prior_docs_path)
            if isinstance(prior_docs, list):
                references = [str(item.get("filename") or item.get("name") or "") for item in prior_docs[:4]]
        except (OSError, json.JSONDecodeError, AttributeError):
            references = []

    stat = report_path.stat()
    return {
        "id": job_id,
        "created_at": stat.st_mtime,
        "created_at_text": time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(stat.st_mtime)),
        "bytes": stat.st_size,
        "claim_preview": claim_preview[:220],
        "provider": provider,
        "model": model,
        "references": [item for item in references if item],
        "output_file": str(report_path),
    }


def list_history_items(include_hidden: bool = False) -> list[dict]:
    hidden = read_hidden_history()
    items = []
    for report_path in RESULT_DIR.glob("analysis_*.md"):
        job_id = report_path.stem.removeprefix("analysis_")
        if not include_hidden and job_id in hidden:
            continue
        item = get_history_item(job_id)
        if item:
            items.append(item)
    return sorted(items, key=lambda item: item["created_at"], reverse=True)


def delete_server_history(job_id: str) -> None:
    job_id = safe_job_id(job_id)
    report_path = get_report_path(job_id)
    if report_path.exists():
        report_path.unlink()

    job_dir = UPLOAD_DIR / job_id
    if job_dir.exists():
        shutil.rmtree(job_dir)

    for log_path in LOG_DIR.glob(f"{job_id}*"):
        if log_path.is_file():
            log_path.unlink()

    jobs.pop(job_id, None)


def extract_json_object(text: str) -> dict:
    fenced = re.search(r"```(?:json)?\s*([\s\S]*?)```", text, flags=re.IGNORECASE)
    if fenced:
        text = fenced.group(1).strip()
    else:
        start = text.find("{")
        end = text.rfind("}")
        if start >= 0 and end > start:
            text = text[start : end + 1]
    try:
        data = json.loads(text)
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"LLM 출력 JSON 파싱 실패: {exc}") from exc
    if not isinstance(data, dict):
        raise RuntimeError("LLM 출력 JSON의 최상위 값은 객체여야 합니다.")
    return data


def as_percent(value) -> str:
    if value is None or value == "":
        return ""
    if isinstance(value, str):
        stripped = value.strip()
        return stripped if stripped.endswith("%") else f"{stripped}%"
    try:
        return f"{int(round(float(value)))}%"
    except (TypeError, ValueError):
        return str(value)


def cell(value, fallback: str = "") -> str:
    text = fallback if value is None or value == "" else str(value)
    return text.replace("|", "/").replace("\n", " ").strip()


def extract_pdf_text(path: Path) -> str:
    errors: list[str] = []

    try:
        import pdfplumber

        pages: list[str] = []
        with pdfplumber.open(path) as pdf:
            for idx, page in enumerate(pdf.pages, start=1):
                text = page.extract_text() or ""
                if text.strip():
                    pages.append(f"\n\n[페이지 {idx}]\n{text}")
        if "".join(pages).strip():
            return "".join(pages).strip()
    except Exception as exc:
        errors.append(f"pdfplumber 실패: {exc}")

    try:
        from pypdf import PdfReader

        reader = PdfReader(str(path))
        pages = []
        for idx, page in enumerate(reader.pages, start=1):
            text = page.extract_text() or ""
            if text.strip():
                pages.append(f"\n\n[페이지 {idx}]\n{text}")
        if "".join(pages).strip():
            return "".join(pages).strip()
    except Exception as exc:
        errors.append(f"pypdf 실패: {exc}")

    pdftotext = shutil.which("pdftotext")
    if pdftotext:
        try:
            completed = subprocess.run(
                [pdftotext, "-layout", str(path), "-"],
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                timeout=120,
            )
            if completed.stdout.strip():
                return completed.stdout.strip()
            errors.append(completed.stderr.strip())
        except Exception as exc:
            errors.append(f"pdftotext 실패: {exc}")

    raise RuntimeError("PDF 텍스트를 추출하지 못했습니다. " + " / ".join(errors))


def safe_doc_name(filename: str, index: int) -> str:
    stem = Path(filename).stem.strip() or f"인용발명 {index}"
    return stem[:80]


def compact_text(text: str, limit: int) -> tuple[str, bool]:
    text = text.strip()
    if len(text) <= limit:
        return text, False
    head_len = int(limit * 0.68)
    tail_len = limit - head_len
    compacted = (
        text[:head_len].rstrip()
        + "\n\n[... 중간 원문 생략: STEP 1 선정용 압축 텍스트 ...]\n\n"
        + text[-tail_len:].lstrip()
    )
    return compacted, True


def compact_reference_for_stage(ref: dict, limit: int, stage_label: str) -> str:
    text, shortened = compact_text(ref["text"], limit)
    note = ""
    if shortened:
        note = (
            f"텍스트 상태: {stage_label} 분석 안정성을 위해 {limit:,}자 이내로 압축됨\n"
            "주의: 생략된 중간부가 필요하면 해당 문헌의 페이지/문단 위치를 기준으로 보수적으로 판단할 것\n\n"
        )
    return note + text


def build_reference_block(references: list[dict], compact: bool = False) -> str:
    blocks = []
    for idx, ref in enumerate(references, start=1):
        text = ref["text"]
        compact_note = ""
        if compact:
            text, shortened = compact_text(text, STEP1_REFERENCE_CHAR_LIMIT)
            if shortened:
                compact_note = (
                    f"텍스트 상태: STEP 1 선정용으로 {STEP1_REFERENCE_CHAR_LIMIT:,}자 이내 압축됨\n"
                    "주의: STEP 2에서는 선정된 주 인용발명 전문이 다시 제공됨\n"
                )
        blocks.append(
            f"[인용발명 {idx}]\n"
            f"문헌명: {ref['name']}\n"
            f"원본 파일: {ref['filename']}\n\n"
            f"{compact_note}"
            f"{text}"
        )
    return "\n\n---\n\n".join(blocks)


def reference_summary(ref: dict | None) -> dict | None:
    if not ref:
        return None
    return {
        "index": ref.get("index"),
        "name": ref.get("name"),
        "filename": ref.get("filename"),
        "char_count": len(ref.get("text", "")),
    }


def find_reference_by_name(value: str | None, references: list[dict]) -> dict | None:
    if not value:
        return None
    normalized = value.lower().strip()
    for ref in references:
        candidates = [
            ref["name"].lower(),
            ref["filename"].lower(),
            Path(ref["filename"]).stem.lower(),
        ]
        if normalized in candidates:
            return ref
    for ref in references:
        candidates = [
            ref["name"].lower(),
            ref["filename"].lower(),
            Path(ref["filename"]).stem.lower(),
        ]
        if any(candidate and (candidate in normalized or normalized in candidate) for candidate in candidates):
            return ref
    return None


def normalize_step1_data(raw_output: str, references: list[dict]) -> tuple[dict, dict, dict | None]:
    data = extract_json_object(raw_output)
    rankings = data.get("rankings") if isinstance(data.get("rankings"), list) else []

    ranking_by_ref: dict[int, dict] = {}
    for item in rankings:
        if not isinstance(item, dict):
            continue
        ref = find_reference_by_name(item.get("source_doc_name"), references)
        if ref:
            ranking_by_ref[ref["index"]] = item

    primary = find_reference_by_name(data.get("primary_doc_name"), references)
    if not primary and rankings:
        primary = find_reference_by_name(rankings[0].get("source_doc_name"), references)
    if not primary and references:
        primary = references[0]

    auxiliary = find_reference_by_name(data.get("auxiliary_doc_name"), references)
    if auxiliary and primary and auxiliary["index"] == primary["index"]:
        auxiliary = None

    def score_for(ref: dict) -> float:
        item = ranking_by_ref.get(ref["index"], {})
        try:
            return float(item.get("similarity", 0))
        except (TypeError, ValueError):
            return 0.0

    ordered_refs = []
    if primary:
        ordered_refs.append(primary)
    if auxiliary and auxiliary not in ordered_refs:
        ordered_refs.append(auxiliary)
    remaining = [ref for ref in references if ref not in ordered_refs]
    ordered_refs.extend(sorted(remaining, key=score_for, reverse=True))

    rows = []
    for display_idx, ref in enumerate(ordered_refs, start=1):
        item = ranking_by_ref.get(ref["index"], {})
        rows.append(
            {
                "label": f"인용발명 {display_idx}",
                "source_index": ref["index"],
                "doc_name": ref["name"],
                "filename": ref["filename"],
                "similarity": item.get("similarity", ""),
                "reason": item.get("reason", ""),
            }
        )

    normalized = {
        "raw": data,
        "rankings": rows,
        "primary": reference_summary(primary),
        "auxiliary": reference_summary(auxiliary),
        "primary_reason": data.get("primary_reason", ""),
        "auxiliary_reason": data.get("auxiliary_reason", ""),
    }
    return normalized, primary, auxiliary


def render_step1(data: dict) -> str:
    lines = [
        "### 인용발명별 평가",
        "",
        "| 인용발명 | 문헌명 | 전체 유사도 | 핵심 근거 |",
        "|----------|--------|--------------|-----------|",
    ]
    for row in data.get("rankings", []):
        lines.append(
            f"| {cell(row.get('label'))} | {cell(row.get('doc_name'))} | "
            f"{cell(as_percent(row.get('similarity')))} | {cell(row.get('reason'))} |"
        )

    primary = data.get("primary") or {}
    auxiliary = data.get("auxiliary")
    lines.extend(
        [
            "",
            "### 주 인용발명 선정 결과",
            "",
            f"**주 인용발명 : 인용발명 1 (문헌명 : {cell(primary.get('name'), '자동 특정 실패')})**",
            "",
            "선정 이유:",
            f"- {cell(data.get('primary_reason'), 'LLM이 선정 이유를 제공하지 않았습니다.')}",
            "",
            "### 보조 인용발명 지정",
            "",
        ]
    )
    if auxiliary:
        lines.extend(
            [
                f"**보조 인용발명 : 인용발명 2 (문헌명 : {cell(auxiliary.get('name'))})**",
                "",
                "지정 이유:",
                f"- {cell(data.get('auxiliary_reason'), '보조 인용발명 지정 이유가 제공되지 않았습니다.')}",
            ]
        )
    else:
        lines.extend(["**보조 인용발명 : 없음**", "", "지정 이유:", "- 보조 인용발명이 지정되지 않았습니다."])
    return "\n".join(lines)


def normalize_step2_data(raw_output: str, primary: dict | None) -> dict:
    data = extract_json_object(raw_output)
    elements = data.get("elements") if isinstance(data.get("elements"), list) else []
    normalized_elements = []
    for idx, item in enumerate(elements, start=1):
        if not isinstance(item, dict):
            continue
        normalized_elements.append(
            {
                "label": item.get("label") or f"({chr(64 + idx)})",
                "claim_element": item.get("claim_element", ""),
                "element_type": item.get("element_type", ""),
                "decision": item.get("decision", ""),
                "similarity": item.get("similarity", ""),
                "citation_summary_korean": item.get("citation_summary_korean", ""),
                "quote": item.get("quote", ""),
                "location": item.get("location", ""),
                "reasoning": item.get("reasoning", ""),
                "difference": item.get("difference", ""),
            }
        )
    return {
        "raw": data,
        "primary": reference_summary(primary),
        "elements": normalized_elements,
        "all_elements_disclosed": bool(data.get("all_elements_disclosed")),
        "novelty_differences": data.get("novelty_differences") or [],
        "inventive_step_targets": data.get("inventive_step_targets") or [],
    }


def render_step2(data: dict) -> str:
    primary_name = ((data.get("primary") or {}).get("name")) or "문헌명 불명"
    lines = [
        "### 청구항 1 구성요소 분해",
        "",
        "| 구성 | 출원발명 구성요소 | 구성 유형 |",
        "|------|------------------|-----------|",
    ]
    for item in data.get("elements", []):
        lines.append(
            f"| {cell(item.get('label'))} | {cell(item.get('claim_element'))} | {cell(item.get('element_type'))} |"
        )

    lines.extend(["", "### 청구항 1 구성요소 대비", ""])
    for item in data.get("elements", []):
        quote = cell(item.get("quote"), "없음")
        location = cell(item.get("location"), "위치 불명")
        difference = cell(item.get("difference"), "없음")
        lines.extend(
            [
                f"#### 구성 {cell(item.get('label'))} - 판정: {cell(item.get('decision'))} (유사도 {cell(as_percent(item.get('similarity')))})",
                "",
                "**출원발명 구성:**",
                f"- {cell(item.get('claim_element'))}",
                "",
                "**주 인용발명 대응구성:**",
                f"인용발명 1({cell(primary_name)}):",
                f"- #한국어 번역: {cell(item.get('citation_summary_korean'), '대응 구성 없음')}(#원문 발췌: \"{quote}\" / #근거 위치: {location})",
                "",
                "**판단 근거:**",
                f"- {cell(item.get('reasoning'))}",
                f"- 차이 내용: {difference}",
                "",
                "---",
                "",
            ]
        )

    lines.extend(
        [
            "### 대비 결과 요약표",
            "",
            "| 구성 | 판정 | 유사도 | 대응 근거 | 차이 내용 |",
            "|------|------|--------|-----------|-----------|",
        ]
    )
    for item in data.get("elements", []):
        lines.append(
            f"| {cell(item.get('label'))} | {cell(item.get('decision'))} | "
            f"{cell(as_percent(item.get('similarity')))} | {cell(item.get('location'), '위치 불명')} | "
            f"{cell(item.get('difference'), '없음')} |"
        )
    return "\n".join(lines)


def normalize_step3_data(raw_output: str, picked: dict) -> dict:
    data = extract_json_object(raw_output)
    data["picked"] = picked
    return data


def render_step3(data: dict) -> str:
    lines = [
        "### 1. 신규성 판단",
        "",
        "| 구성 | STEP 2 판정 | 신규성 판단상 취급 | 근거 |",
        "|------|-------------|--------------------|------|",
    ]
    for item in data.get("novelty_items") or []:
        lines.append(
            f"| {cell(item.get('label'))} | {cell(item.get('step2_decision'))} | "
            f"{cell(item.get('novelty_treatment'))} | {cell(item.get('basis'))} |"
        )
    lines.extend(
        [
            "",
            "**신규성 결론:**",
            f"- 청구항 1은 신규성이 {cell(data.get('novelty_conclusion'))}됩니다.",
            f"- 이유: {cell(data.get('novelty_reason'))}",
            "",
            "### 2. 진보성 판단",
            "",
            "#### 2-1. 차이구성 정리",
            "",
            "| 차이구성 | 차이 내용 | 기술적 의의 | STEP 2 근거 |",
            "|----------|-----------|-------------|-------------|",
        ]
    )
    for item in data.get("differences") or []:
        lines.append(
            f"| {cell(item.get('label'))} | {cell(item.get('difference'))} | "
            f"{cell(item.get('technical_significance'))} | {cell(item.get('step2_basis'))} |"
        )
    lines.extend(
        [
            "",
            "#### 2-2. 보조 인용발명 검토",
            "",
            "| 차이구성 | 보조 인용발명 개시 여부 | 근거 | 평가 |",
            "|----------|------------------------|------|------|",
        ]
    )
    for item in data.get("auxiliary_review") or []:
        lines.append(
            f"| {cell(item.get('label'))} | {cell(item.get('disclosure'))} | "
            f"{cell(item.get('basis'))} | {cell(item.get('evaluation'))} |"
        )
    lines.extend(
        [
            "",
            "#### 2-3. 결합 가능성 및 자명성 검토",
            "",
            "| 검토항목 | 판단 | 근거 |",
            "|----------|------|------|",
        ]
    )
    for item in data.get("obviousness_factors") or []:
        lines.append(f"| {cell(item.get('factor'))} | {cell(item.get('judgment'))} | {cell(item.get('basis'))} |")
    lines.extend(
        [
            "",
            "**진보성 결론:**",
            f"- 청구항 1은 진보성이 {cell(data.get('inventive_step_conclusion'))}됩니다.",
            f"- 이유: {cell(data.get('inventive_step_reason'))}",
            "",
            "### 3. 종합 결론",
            "",
            "| 청구항 | 신규성 | 진보성 | 최종 결론 | 핵심 이유 |",
            "|--------|--------|--------|-----------|-----------|",
            f"| 청구항 1 | {cell(data.get('novelty_conclusion'))} | {cell(data.get('inventive_step_conclusion'))} | {cell(data.get('final_conclusion'))} | {cell(data.get('final_reason'))} |",
            "",
            "### 최종 의견",
        ]
    )
    opinions = data.get("final_opinion") or []
    if isinstance(opinions, str):
        opinions = [opinions]
    for opinion in opinions:
        lines.append(f"- {cell(opinion)}")
    return "\n".join(lines)


def run_cli(prompt: str, settings: dict, stage_label: str, job_id: str | None = None) -> str:
    executable = settings.get("cli_executable", "gemini").strip() or "gemini"
    prompt_option = settings.get("prompt_option", "-p").strip() or "-p"
    prompt_title = settings.get("prompt_title", stage_label).strip() or stage_label
    model = settings.get("model", "").strip()
    timeout = int(settings.get("timeout", 900))

    resolved_executable = shutil.which(executable) or executable
    command = [resolved_executable]
    if model:
        command.extend(["-m", model])
    command.extend([prompt_option, prompt_title])

    log_prefix = None
    if job_id:
        safe_stage = re.sub(r"[^0-9A-Za-z가-힣_-]+", "_", stage_label).strip("_")
        log_prefix = LOG_DIR / f"{job_id}_{safe_stage}"
        (log_prefix.with_suffix(".prompt.txt")).write_text(prompt, encoding="utf-8")

    try:
        completed = subprocess.run(
            command,
            input=prompt,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=timeout,
            cwd=str(BASE_DIR),
        )
    except subprocess.TimeoutExpired as exc:
        if log_prefix:
            (log_prefix.with_suffix(".error.txt")).write_text(str(exc), encoding="utf-8")
        raise RuntimeError(f"{stage_label} CLI 실행 시간이 {timeout}초를 초과했습니다.") from exc

    if log_prefix:
        log_text = (
            f"COMMAND: {' '.join(command)}\n"
            f"RETURN CODE: {completed.returncode}\n\n"
            f"STDOUT:\n{completed.stdout}\n\n"
            f"STDERR:\n{completed.stderr}"
        )
        (log_prefix.with_suffix(".log.txt")).write_text(log_text, encoding="utf-8")

    if completed.returncode != 0:
        prompt_chars = len(prompt)
        prompt_bytes = len(prompt.encode("utf-8", errors="replace"))
        crash_hint = ""
        if completed.returncode in {3221226505, -1073740791}:
            crash_hint = (
                "\n\n가능성이 큰 원인: CLI가 비정상 종료되었습니다. "
                "대개 입력 프롬프트가 너무 길거나 CLI 런타임이 응답을 처리하지 못할 때 발생합니다."
            )
        raise RuntimeError(
            f"{stage_label} CLI 실행 실패"
            f"\n프롬프트 크기: {prompt_chars:,}자 / {prompt_bytes:,} bytes"
            f"{crash_hint}\n\nSTDOUT:\n{completed.stdout}\n\nSTDERR:\n{completed.stderr}"
        )
    return completed.stdout.strip()


def make_step1_prompt(claim: str, references: list[dict]) -> str:
    return (
        read_prompt("step1")
        + "\n\n---\n\n# 실제 입력값\n\n"
        + f"[출원발명 청구항]\n{claim.strip()}\n\n"
        + build_reference_block(references, compact=True)
    )


def make_step2_prompt(claim: str, step1_data: dict, primary: dict) -> str:
    if not primary:
        raise RuntimeError("STEP 1 결과에서 주 인용발명을 특정하지 못했습니다.")
    handoff = {
        "primary_label": "인용발명 1",
        "primary_doc_name": primary["name"],
        "primary_reason": step1_data.get("primary_reason", ""),
    }
    primary_text = compact_reference_for_stage(primary, STEP2_REFERENCE_CHAR_LIMIT, "STEP 2")
    ref_text = f"[주 인용발명 원문]\n인용발명 표시명: 인용발명 1\n문헌명: {primary['name']}\n\n{primary_text}"
    prompt = (
        read_prompt("step2")
        + "\n\n---\n\n# 실제 입력값\n\n"
        + f"[STEP 1 시스템 인계 JSON]\n{json.dumps(handoff, ensure_ascii=False)}\n\n"
        + f"[출원발명 청구항 전문]\n{claim.strip()}\n\n"
        + ref_text
    )
    return prompt


def make_step3_prompt(step2_data: dict, auxiliary: dict | None) -> str:
    aux_text = ""
    if auxiliary:
        auxiliary_text = compact_reference_for_stage(auxiliary, STEP3_AUXILIARY_CHAR_LIMIT, "STEP 3")
        aux_text = f"\n\n[보조 인용발명 원문]\n문헌명: {auxiliary['name']}\n\n{auxiliary_text}"
    handoff = {key: value for key, value in step2_data.items() if key != "raw_output"}

    prompt = (
        read_prompt("step3")
        + "\n\n---\n\n# 실제 입력값\n\n"
        + f"[STEP 2 구성요소 대비 JSON]\n{json.dumps(handoff, ensure_ascii=False)}"
        + aux_text
    )
    return prompt


def make_comparison_data(step2_data: dict, primary: dict | None) -> dict:
    return {
        "primary": reference_summary(primary),
        "elements": step2_data.get("elements", []),
        "all_elements_disclosed": step2_data.get("all_elements_disclosed", False),
        "novelty_differences": step2_data.get("novelty_differences", []),
        "inventive_step_targets": step2_data.get("inventive_step_targets", []),
    }


def make_judgment_data(step3_data: dict, picked: dict) -> dict:
    return {
        "picked": picked,
        "novelty_signal": step3_data.get("novelty_conclusion", ""),
        "inventive_step_signal": step3_data.get("inventive_step_conclusion", ""),
        "final_excerpt": step3_data.get("final_reason", ""),
        "raw": step3_data,
    }


def save_report(job: Job, claim: str, references: list[dict], picked: dict) -> None:
    path = RESULT_DIR / f"analysis_{job.id}.md"
    refs = "\n".join(
        f"- 인용발명 {idx}: {ref['name']} ({ref['filename']})"
        for idx, ref in enumerate(references, start=1)
    )
    report = (
        "# 특허 신규성·진보성 분석 결과\n\n"
        "## 입력\n\n"
        f"### 청구항\n\n{claim.strip()}\n\n"
        f"### 인용발명\n\n{refs}\n\n"
        f"### 자동 선택\n\n"
        f"- 주 인용발명: {picked.get('primary') or '출력에서 자동 특정 실패'}\n"
        f"- 보조 인용발명: {picked.get('auxiliary') or '없음 또는 출력에서 자동 특정 실패'}\n\n"
        "## STEP 1 결과\n\n"
        f"{job.results.get('step1', '')}\n\n"
        "## STEP 2 결과\n\n"
        f"{job.results.get('step2', '')}\n\n"
        "## STEP 3 최종 결과\n\n"
        f"{job.results.get('step3', '')}\n"
    )
    path.write_text(report, encoding="utf-8")
    job.output_file = str(path)


def process_job(job_id: str, claim: str, files: list[Path], settings: dict) -> None:
    job = jobs[job_id]
    job_dir = UPLOAD_DIR / job_id
    try:
        job.status = "running"
        job.message = "PDF 텍스트 추출 중"
        prior_docs_path = job_dir / "prior_docs.json"
        if prior_docs_path.exists():
            references = read_json(prior_docs_path)
            job.message = "PDF 캐시 로드 완료"
        else:
            references = []
            for idx, file_path in enumerate(files, start=1):
                text = extract_pdf_text(file_path)
                references.append(
                    {
                        "index": idx,
                        "name": safe_doc_name(file_path.name, idx),
                        "filename": file_path.name,
                        "text": text,
                        "char_count": len(text),
                    }
                )
            write_json(prior_docs_path, references)
        write_json(job_dir / "claim.json", {"claim": claim, "char_count": len(claim)})
        write_json(job_dir / "settings.json", settings)

        job.message = "STEP 1 인용발명 선정 중"
        step1_raw = run_cli(make_step1_prompt(claim, references), settings, "STEP 1 인용발명 선정", job_id)
        selection_data, primary, auxiliary = normalize_step1_data(step1_raw, references)
        selection_data["raw_output"] = step1_raw
        job.results["step1"] = render_step1(selection_data)
        write_json(job_dir / "step1_selection.json", selection_data)

        job.message = "STEP 2 구성요소 대비 중"
        step2_prompt = make_step2_prompt(claim, selection_data, primary)
        step2_raw = run_cli(step2_prompt, settings, "STEP 2 구성요소 대비", job_id)
        step2_data = normalize_step2_data(step2_raw, primary)
        step2_data["raw_output"] = step2_raw
        job.results["step2"] = render_step2(step2_data)
        comparison_data = make_comparison_data(step2_data, primary)
        write_json(job_dir / "step2_comparison.json", comparison_data)

        job.message = "STEP 3 신규성·진보성 판단 중"
        step3_prompt = make_step3_prompt(step2_data, auxiliary)
        step3_raw = run_cli(step3_prompt, settings, "STEP 3 신규성·진보성 판단", job_id)
        picked = {
            "primary": primary["name"] if primary else None,
            "auxiliary": auxiliary["name"] if auxiliary else None,
        }
        step3_data = normalize_step3_data(step3_raw, picked)
        step3_data["raw_output"] = step3_raw
        job.results["step3"] = render_step3(step3_data)

        write_json(job_dir / "step3_judgment.json", make_judgment_data(step3_data, picked))
        save_report(job, claim, references, picked)
        job.status = "done"
        job.message = "분석 완료"
    except Exception as exc:
        job.status = "error"
        job.error = str(exc)
        job.message = "오류 발생"


@app.get("/")
def index():
    provider = os.environ.get("SPARK_AI_PROVIDER", "gemini").strip().lower()
    if provider not in AI_PROVIDERS:
        provider = "gemini"
    defaults = {
        "ai_provider": provider,
        "cli_executable": os.environ.get("SPARK_CLI_EXECUTABLE", AI_PROVIDERS[provider]["executable"]),
        "prompt_option": os.environ.get("SPARK_PROMPT_OPTION", "-p"),
        "model": os.environ.get("SPARK_MODEL", ""),
        "timeout": os.environ.get("SPARK_TIMEOUT", "900"),
    }
    return render_template("index.html", defaults=defaults, ai_providers=AI_PROVIDERS)


@app.post("/analyze")
def analyze():
    claim = request.form.get("claim", "").strip()
    if not claim:
        return jsonify({"error": "청구항 1을 입력해 주세요."}), 400

    uploaded = request.files.getlist("references")
    uploaded = [file for file in uploaded if file and file.filename]
    if not uploaded:
        return jsonify({"error": "인용발명 PDF를 1개 이상 업로드해 주세요."}), 400

    job_id = uuid.uuid4().hex[:12]
    job_dir = UPLOAD_DIR / job_id
    job_dir.mkdir(parents=True, exist_ok=True)

    file_paths = []
    for idx, file in enumerate(uploaded, start=1):
        filename = secure_filename(file.filename) or f"reference_{idx}.pdf"
        if not filename.lower().endswith(".pdf"):
            return jsonify({"error": f"PDF만 업로드할 수 있습니다: {file.filename}"}), 400
        path = job_dir / filename
        file.save(path)
        file_paths.append(path)

    settings = {
        "ai_provider": request.form.get("ai_provider", "gemini"),
        "cli_executable": request.form.get("cli_executable", "gemini"),
        "prompt_option": request.form.get("prompt_option", "-p"),
        "prompt_title": request.form.get("prompt_title", ""),
        "model": request.form.get("model", ""),
        "timeout": request.form.get("timeout", "900"),
    }
    settings = normalize_settings(settings)

    jobs[job_id] = Job(id=job_id)
    thread = threading.Thread(
        target=process_job,
        args=(job_id, claim, file_paths, settings),
        daemon=True,
    )
    thread.start()
    return jsonify({"job_id": job_id})


@app.get("/jobs/<job_id>")
def job_status(job_id: str):
    job = jobs.get(job_id)
    if not job:
        return jsonify({"error": "작업을 찾을 수 없습니다."}), 404
    job_dir = UPLOAD_DIR / job_id
    artifact_names = [
        "prior_docs.json",
        "claim.json",
        "step1_selection.json",
        "step2_comparison.json",
        "step3_judgment.json",
    ]
    artifacts = []
    for name in artifact_names:
        path = job_dir / name
        if path.exists():
            artifacts.append(
                {
                    "name": name,
                    "path": str(path),
                    "bytes": path.stat().st_size,
                }
            )
    return jsonify(
        {
            "id": job.id,
            "status": job.status,
            "message": job.message,
            "results": job.results,
            "error": job.error,
            "output_file": job.output_file,
            "artifacts": artifacts,
        }
    )


@app.get("/history")
def history_list():
    return jsonify({"items": list_history_items()})


@app.get("/history/<job_id>")
def history_detail(job_id: str):
    try:
        job_id = safe_job_id(job_id)
    except ValueError:
        return jsonify({"error": "Invalid job id"}), 400

    item = get_history_item(job_id)
    if not item:
        return jsonify({"error": "Report not found"}), 404

    report_path = get_report_path(job_id)
    return jsonify({"item": item, "content": report_path.read_text(encoding="utf-8")})


@app.delete("/history/<job_id>")
def history_delete(job_id: str):
    scope = request.args.get("scope", "list").strip().lower()
    if scope not in {"list", "server"}:
        return jsonify({"error": "scope must be list or server"}), 400

    try:
        job_id = safe_job_id(job_id)
    except ValueError:
        return jsonify({"error": "Invalid job id"}), 400

    if scope == "server":
        delete_server_history(job_id)
        hidden = read_hidden_history()
        hidden.discard(job_id)
        write_hidden_history(hidden)
    else:
        hidden = read_hidden_history()
        hidden.add(job_id)
        write_hidden_history(hidden)

    return jsonify({"ok": True})


@app.delete("/history")
def history_clear():
    scope = request.args.get("scope", "list").strip().lower()
    if scope not in {"list", "server"}:
        return jsonify({"error": "scope must be list or server"}), 400

    if scope == "server":
        for item in list_history_items(include_hidden=True):
            delete_server_history(item["id"])
        write_hidden_history(set())
    else:
        hidden = read_hidden_history()
        hidden.update(item["id"] for item in list_history_items(include_hidden=True))
        write_hidden_history(hidden)

    return jsonify({"ok": True})


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5050, debug=False)
