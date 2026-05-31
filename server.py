from __future__ import annotations

import argparse
import base64
import copy
import json
import logging
import mimetypes
import re
import shutil
import subprocess
import tempfile
from collections import Counter, defaultdict
from datetime import datetime, timezone
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from logging.handlers import RotatingFileHandler
from pathlib import Path
from typing import Any
import urllib.error
import urllib.request
from urllib.parse import unquote, urlparse

WORKSPACE_DIR = Path(__file__).resolve().parent
DATASET_DIR = WORKSPACE_DIR.parent
STATIC_DIR = WORKSPACE_DIR / "static"
LEGACY_DATA_DIR = WORKSPACE_DIR / "data"
LEGACY_EXPORT_DIR = WORKSPACE_DIR / "exports"
LEGACY_GENERATED_CLIPS_DIR = WORKSPACE_DIR / "generated_clips"
LEGACY_SOURCE_VIDEO_COPIES_DIR = WORKSPACE_DIR / "source_videos_mp4"
DEFAULT_RUNTIME_DIR = DATASET_DIR / "annotation_workspace_data"

RUNTIME_DIR = DEFAULT_RUNTIME_DIR
DATA_DIR = RUNTIME_DIR / "data"
EXPORT_DIR = RUNTIME_DIR / "exports"
GENERATED_CLIPS_DIR = RUNTIME_DIR / "generated_clips"
SOURCE_VIDEO_COPIES_DIR = RUNTIME_DIR / "source_videos_mp4"
LOG_DIR = RUNTIME_DIR / "logs"
DESCRIPTION_BACKUPS_DIR = DATA_DIR / "description_backups"

ANNOTATIONS_PATH = DATASET_DIR / "annotations" / "videos.json"
NOTES_PATH = DATASET_DIR / "notes.txt"
VEHICLE_PROMPT_PATH = WORKSPACE_DIR / "vehicle_prompt.txt"
NO_VIOLATION_PROMPT_PATH = WORKSPACE_DIR / "noviolation_prompt.txt"
DESCRIPTION_REWRITE_INSTRUCTIONS_PATH = WORKSPACE_DIR / "description_rewrite_instructions.txt"
ANNOTATION_QUESTIONS_PATH = WORKSPACE_DIR / "annotation_questions.json"
PEDESTRIAN_PROMPT_CANDIDATES = [
    WORKSPACE_DIR / "pedestrian_prompt.txt",
    WORKSPACE_DIR / "pedestiran_prompt.txt",
]
SAMPLES_PATH = DATA_DIR / "samples.json"
CHANGE_LOG_PATH = DATA_DIR / "change_log.jsonl"
SOURCE_VIDEO_POSITIONS_PATH = DATA_DIR / "source_video_positions.json"
SOURCE_VIDEO_ALIASES_PATH = DATA_DIR / "source_video_aliases.json"
SOURCE_VIDEO_GRID_SETTINGS_PATH = DATA_DIR / "source_video_grid_settings.json"
SOURCE_VIDEO_FOOTAGE_START_TIMES_PATH = DATA_DIR / "source_video_footage_start_times.json"
RULES_PATH = DATA_DIR / "rules.json"
EXPORT_PATH = EXPORT_DIR / "videos.annotated.json"
SERVER_LOG_PATH = LOG_DIR / "server.log"
DEFAULT_CLIP_PADDING_SECONDS = 3.0
DESCRIPTION_DRAFT_DEFAULT_KEYFRAMES = 5
DESCRIPTION_DRAFT_MAX_KEYFRAMES = 8
DESCRIPTION_DRAFT_TIMEOUT_SECONDS = 180
DESCRIPTION_DRAFT_MAX_OUTPUT_TOKENS = 180
DESCRIPTION_DRAFT_KEYFRAME_MAX_WIDTH = 768
DESCRIPTION_BATCH_TIME_TOLERANCE_SECONDS = 4
LM_STUDIO_DESCRIPTION_CONTEXT_LENGTH = 32768

EDITABLE_FIELDS = [
    "date",
    "time",
    "violation_type",
    "violator_type",
    "entering_direction",
    "exiting_direction",
    "entering_lane",
    "exiting_lane",
    "color",
    "intersection_type",
    "weather",
    "light",
    "description",
]
WORKSPACE_ONLY_FIELDS = ["notes"]
PATCHABLE_FIELDS = EDITABLE_FIELDS + WORKSPACE_ONLY_FIELDS
RULE_TARGET_FIELDS = EDITABLE_FIELDS + ["is_for_export"]
DEFAULT_FIELD_VALUES = {
    "weather": "clear",
    "light": "daylight",
}
ALLOWED_LIGHT_VALUES = {"daylight", "night"}
DEFAULT_INTERSECTION_TYPES: dict[str, str] = {}
DEFAULT_FIELD_NOTES = {
    "violation_type": "wrong_way, uturn, jaywalking, red_light, lane_use_control, lane_discipline, no_violation",
    "violator_type": "car, motorcycle, pedestrian, bus, truck, na",
    "entering_lane": "1, 2, 3, 4, na",
    "exiting_lane": "1, 2, 3, 4, na",
    "color": "dark, light, red, green, yellow, blue, mixed, na",
    "intersection_type": "T-intersection, four-way intersection",
    "weather": "clear, rainy, cloudy",
    "light": "daylight, night",
}
TEXT_FIELDS = {"date", "time"}
TEXTAREA_FIELDS = {"description", "notes"}
DIRECTION_OPTIONS = [
    "Top-Left",
    "Top-Center",
    "Top-Right",
    "Middle-Left",
    "Middle-Center",
    "Middle-Right",
    "Bottom-Left",
    "Bottom-Center",
    "Bottom-Right",
]
DEFAULT_VIOLATION_TYPES = [
    "wrong_way",
    "uturn",
    "jaywalking",
    "red_light",
    "lane_use_control",
    "lane",
    "lane_switching",
    "lane_discipline",
    "left_turn",
    "no_violation",
]
HIDDEN_VIOLATION_TYPE_OPTIONS = {"lane", "lane_switching", "left_turn"}
HIDDEN_FIELD_OPTIONS: dict[str, set[str]] = {}
EXPORT_SCOPES = {"public", "secret", "both"}
EXPORT_QUESTION_FIELDS = [
    ("date", "date"),
    ("time", "time"),
    ("violation_type", "violation_type"),
    ("violator_type", "violator_type"),
    ("color", "color"),
    ("initial_position", "entering_direction"),
    ("final_position", "exiting_direction"),
    ("initial_lane", "entering_lane"),
    ("final_lane", "exiting_lane"),
    ("intersection_type", "intersection_type"),
    ("weather", "weather"),
    ("light", "light"),
    ("description", "description"),
]
SUPPORTED_SOURCE_VIDEO_EXTENSIONS = {".avi", ".mp4", ".mov", ".mkv", ".m4v"}
DATE_PATTERN = re.compile(r"^\d{4}-\d{2}-\d{2}$")
TIME_PATTERN = re.compile(r"^\d{2}:\d{2}:\d{2}$")
DESCRIPTION_TIME_PATTERN = re.compile(r"\b(?P<hours>\d{1,2}):(?P<minutes>\d{2}):(?P<seconds>\d{2})\b")
LOGGER = logging.getLogger("annotation_workspace")
RULE_CONDITION_FIELDS = ["video_id", "violation_type", "violator_type"]


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def is_valid_date_string(value: str) -> bool:
    if not DATE_PATTERN.fullmatch(value):
        return False
    try:
        datetime.strptime(value, "%Y-%m-%d")
        return True
    except ValueError:
        return False


def is_valid_time_string(value: str) -> bool:
    if not TIME_PATTERN.fullmatch(value):
        return False
    try:
        datetime.strptime(value, "%H:%M:%S")
        return True
    except ValueError:
        return False


def atomic_write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temp_path = path.with_suffix(f"{path.suffix}.tmp")
    text = json.dumps(payload, indent=2, ensure_ascii=False)
    temp_path.write_text(f"{text}\n", encoding="utf-8")
    temp_path.replace(path)


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def workspace_relative(path: Path) -> str:
    return path.relative_to(DATASET_DIR).as_posix()


def configure_runtime_paths(runtime_dir: Path) -> None:
    global RUNTIME_DIR, DATA_DIR, EXPORT_DIR, GENERATED_CLIPS_DIR, SOURCE_VIDEO_COPIES_DIR, LOG_DIR
    global DESCRIPTION_BACKUPS_DIR
    global SAMPLES_PATH, CHANGE_LOG_PATH, SOURCE_VIDEO_POSITIONS_PATH, SOURCE_VIDEO_ALIASES_PATH
    global SOURCE_VIDEO_GRID_SETTINGS_PATH, SOURCE_VIDEO_FOOTAGE_START_TIMES_PATH, EXPORT_PATH, SERVER_LOG_PATH

    resolved_runtime_dir = runtime_dir.resolve()
    try:
        resolved_runtime_dir.relative_to(DATASET_DIR)
    except ValueError as exc:
        raise ValueError("runtime-dir must stay inside the dataset root") from exc

    RUNTIME_DIR = resolved_runtime_dir
    DATA_DIR = RUNTIME_DIR / "data"
    EXPORT_DIR = RUNTIME_DIR / "exports"
    GENERATED_CLIPS_DIR = RUNTIME_DIR / "generated_clips"
    SOURCE_VIDEO_COPIES_DIR = RUNTIME_DIR / "source_videos_mp4"
    LOG_DIR = RUNTIME_DIR / "logs"
    DESCRIPTION_BACKUPS_DIR = DATA_DIR / "description_backups"
    SAMPLES_PATH = DATA_DIR / "samples.json"
    CHANGE_LOG_PATH = DATA_DIR / "change_log.jsonl"
    SOURCE_VIDEO_POSITIONS_PATH = DATA_DIR / "source_video_positions.json"
    SOURCE_VIDEO_ALIASES_PATH = DATA_DIR / "source_video_aliases.json"
    SOURCE_VIDEO_GRID_SETTINGS_PATH = DATA_DIR / "source_video_grid_settings.json"
    SOURCE_VIDEO_FOOTAGE_START_TIMES_PATH = DATA_DIR / "source_video_footage_start_times.json"
    EXPORT_PATH = EXPORT_DIR / "videos.annotated.json"
    SERVER_LOG_PATH = LOG_DIR / "server.log"


def setup_logging() -> None:
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    LOGGER.setLevel(logging.INFO)
    LOGGER.propagate = False

    for handler in list(LOGGER.handlers):
        LOGGER.removeHandler(handler)
        handler.close()

    formatter = logging.Formatter("%(asctime)s %(levelname)s %(message)s")

    file_handler = RotatingFileHandler(SERVER_LOG_PATH, maxBytes=1_000_000, backupCount=5, encoding="utf-8")
    file_handler.setFormatter(formatter)
    LOGGER.addHandler(file_handler)


def append_change_log(entry: dict[str, Any]) -> None:
    CHANGE_LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
    with CHANGE_LOG_PATH.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(entry, ensure_ascii=False))
        handle.write("\n")


def read_prompt_file(path: Path) -> str:
    if not path.exists():
        raise FileNotFoundError(path.as_posix())
    return path.read_text(encoding="utf-8").strip()


def load_annotation_questions() -> dict[str, str]:
    payload = load_json(ANNOTATION_QUESTIONS_PATH)
    questions = payload.get("questions", {}) if isinstance(payload, dict) else {}
    if not isinstance(questions, dict):
        raise ValueError("annotation_questions.json must contain a questions object")
    return {str(key): str(value) for key, value in questions.items()}


def load_source_video_positions() -> dict[str, float]:
    if not SOURCE_VIDEO_POSITIONS_PATH.exists():
        return {}
    raw_positions = load_json(SOURCE_VIDEO_POSITIONS_PATH)
    if not isinstance(raw_positions, dict):
        return {}
    positions: dict[str, float] = {}
    for key, value in raw_positions.items():
        try:
            positions[canonicalize_source_video_id(key)] = round(float(value), 3)
        except (TypeError, ValueError):
            continue
    return positions


def save_source_video_positions(positions: dict[str, float]) -> None:
    atomic_write_json(SOURCE_VIDEO_POSITIONS_PATH, positions)


DEFAULT_GRID_SETTINGS = {
    "fill_x_percent": 100.0,
    "fill_y_percent": 100.0,
    "offset_x_px": 0.0,
    "offset_y_px": 0.0,
}


def parse_bounded_float(value: Any, field_name: str, minimum: float, maximum: float) -> float:
    try:
        numeric = float(value)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"{field_name} must be a number") from exc
    if numeric < minimum or numeric > maximum:
        raise ValueError(f"{field_name} must be between {minimum:g} and {maximum:g}")
    return round(numeric, 3)


def normalize_grid_settings(settings: Any) -> dict[str, float]:
    source = settings if isinstance(settings, dict) else {}
    return {
        "fill_x_percent": parse_bounded_float(
            source.get("fill_x_percent", DEFAULT_GRID_SETTINGS["fill_x_percent"]),
            "fill_x_percent",
            25.0,
            200.0,
        ),
        "fill_y_percent": parse_bounded_float(
            source.get("fill_y_percent", DEFAULT_GRID_SETTINGS["fill_y_percent"]),
            "fill_y_percent",
            25.0,
            200.0,
        ),
        "offset_x_px": parse_bounded_float(
            source.get("offset_x_px", DEFAULT_GRID_SETTINGS["offset_x_px"]),
            "offset_x_px",
            -1000.0,
            1000.0,
        ),
        "offset_y_px": parse_bounded_float(
            source.get("offset_y_px", DEFAULT_GRID_SETTINGS["offset_y_px"]),
            "offset_y_px",
            -1000.0,
            1000.0,
        ),
    }


def load_source_video_grid_settings() -> dict[str, dict[str, float]]:
    if not SOURCE_VIDEO_GRID_SETTINGS_PATH.exists():
        return {}
    raw_settings = load_json(SOURCE_VIDEO_GRID_SETTINGS_PATH)
    if not isinstance(raw_settings, dict):
        return {}
    settings_by_key: dict[str, dict[str, float]] = {}
    for key, value in raw_settings.items():
        try:
            settings_by_key[canonicalize_source_video_id(key)] = normalize_grid_settings(value)
        except ValueError:
            continue
    return settings_by_key


def save_source_video_grid_settings(settings_by_key: dict[str, dict[str, float]]) -> None:
    atomic_write_json(SOURCE_VIDEO_GRID_SETTINGS_PATH, settings_by_key)


def update_source_video_grid_settings(source_video_key: str, settings: Any) -> dict[str, dict[str, float]]:
    canonical_key = canonicalize_source_video_id(source_video_key)
    resolve_source_video_record(canonical_key)
    settings_by_key = load_source_video_grid_settings()
    settings_by_key[canonical_key] = normalize_grid_settings(settings)
    save_source_video_grid_settings(settings_by_key)
    append_change_log(
        {
            "timestamp": utc_now(),
            "action": "update_source_video_grid_settings",
            "source_video_key": canonical_key,
            "settings": settings_by_key[canonical_key],
        }
    )
    return settings_by_key


def load_source_video_footage_start_times() -> dict[str, str]:
    if not SOURCE_VIDEO_FOOTAGE_START_TIMES_PATH.exists():
        return {}
    raw_times = load_json(SOURCE_VIDEO_FOOTAGE_START_TIMES_PATH)
    if not isinstance(raw_times, dict):
        return {}
    start_times: dict[str, str] = {}
    for key, value in raw_times.items():
        normalized_value = "" if value is None else str(value).strip()
        if normalized_value and is_valid_time_string(normalized_value):
            start_times[canonicalize_source_video_id(key)] = normalized_value
    return start_times


def save_source_video_footage_start_times(start_times: dict[str, str]) -> None:
    atomic_write_json(SOURCE_VIDEO_FOOTAGE_START_TIMES_PATH, start_times)


def update_source_video_footage_start_time(source_video_key: str, footage_start_time: Any) -> dict[str, str]:
    canonical_key = canonicalize_source_video_id(source_video_key)
    resolve_source_video_record(canonical_key)
    normalized_time = "" if footage_start_time is None else str(footage_start_time).strip()
    if normalized_time and not is_valid_time_string(normalized_time):
        raise ValueError("footage_start_time must use HH:MM:SS format")

    start_times = load_source_video_footage_start_times()
    if normalized_time:
        start_times[canonical_key] = normalized_time
    else:
        start_times.pop(canonical_key, None)
    save_source_video_footage_start_times(start_times)
    append_change_log(
        {
            "timestamp": utc_now(),
            "action": "update_source_video_footage_start_time",
            "source_video_key": canonical_key,
            "footage_start_time": normalized_time,
        }
    )
    return start_times


def base_source_video_id(value: Any) -> str:
    raw_value = "" if value is None else str(value).strip()
    if not raw_value:
        return ""

    video_match = re.fullmatch(r"video_(\d+)", raw_value)
    if video_match:
        return f"video_{int(video_match.group(1)):03d}"

    numeric_match = re.fullmatch(r"\d+", raw_value)
    if numeric_match:
        return f"video_{int(raw_value):03d}"

    return raw_value


def load_source_video_aliases() -> dict[str, str]:
    if not SOURCE_VIDEO_ALIASES_PATH.exists():
        return {}
    raw_aliases = load_json(SOURCE_VIDEO_ALIASES_PATH)
    if not isinstance(raw_aliases, dict):
        return {}
    aliases: dict[str, str] = {}
    for old_key, new_key in raw_aliases.items():
        old_value = str(old_key).strip()
        new_value = base_source_video_id(new_key)
        if old_value and new_value:
            aliases[old_value] = new_value
    return aliases


def canonicalize_source_video_id(value: Any) -> str:
    raw_value = "" if value is None else str(value).strip()
    if not raw_value:
        return ""

    aliases = load_source_video_aliases()
    if raw_value in aliases:
        return aliases[raw_value]
    return base_source_video_id(raw_value)


def canonicalize_source_video_path(path_value: Any) -> str:
    raw_path = "" if path_value is None else str(path_value).strip()
    match = re.fullmatch(r"videos/([^/]+)(\.[A-Za-z0-9]+)", raw_path)
    if not match:
        return raw_path
    stem, suffix = match.groups()
    canonical_stem = canonicalize_source_video_id(stem)
    return f"videos/{canonical_stem}{suffix}"


def update_source_video_position(
    source_video_key: str,
    position_seconds: float,
    allow_zero_reset: bool = False,
) -> dict[str, float]:
    positions = load_source_video_positions()
    canonical_key = canonicalize_source_video_id(source_video_key)
    rounded_position = round(position_seconds, 3)
    existing_position = round(float(positions.get(canonical_key, 0.0)), 3)
    if rounded_position <= 0 and existing_position > 0 and not allow_zero_reset:
        return positions
    positions[canonical_key] = rounded_position
    save_source_video_positions(positions)
    return positions


def load_prompt_templates() -> dict[str, str]:
    pedestrian_path = next((path for path in PEDESTRIAN_PROMPT_CANDIDATES if path.exists()), None)
    if pedestrian_path is None:
        raise FileNotFoundError("pedestrian prompt file not found")
    return {
        "vehicle": read_prompt_file(VEHICLE_PROMPT_PATH),
        "no_violation": read_prompt_file(NO_VIOLATION_PROMPT_PATH),
        "pedestrian": read_prompt_file(pedestrian_path),
    }


class LocalModelError(RuntimeError):
    pass


DESCRIPTION_DRAFT_PROMPT_FIELDS = [
    ("date", "Date"),
    ("time", "Time"),
    ("violation_type", "Violation type"),
    ("violator_type", "Violator type"),
    ("color", "Color"),
    ("entering_direction", "Initial position"),
    ("entering_lane", "Initial lane"),
    ("exiting_direction", "Final position"),
    ("exiting_lane", "Final lane"),
    ("intersection_type", "Intersection type"),
    ("weather", "Weather"),
    ("light", "Light"),
]


def description_prompt_type_for_sample(sample: dict[str, Any]) -> str:
    violation_type = normalize_violation_type(sample.get("violation_type", "")).lower()
    if violation_type == "no_violation":
        return "no_violation"
    violator_type = str(sample.get("violator_type", "")).strip().lower()
    if violator_type == "pedestrian" or violation_type == "jaywalking":
        return "pedestrian"
    return "vehicle"


def build_description_draft_prompt(sample: dict[str, Any], prompt_template: str) -> str:
    field_lines = []
    for field_name, label in DESCRIPTION_DRAFT_PROMPT_FIELDS:
        value = str(sample.get(field_name, "") or "").strip()
        field_lines.append(f"- {label}: {value or 'blank'}")

    old_description = str(sample.get("description", "") or "").strip()
    if not old_description:
        return "\n\n".join(
            [
                prompt_template,
                "Current annotation values:",
                "\n".join(field_lines),
            ]
        )

    rewrite_instructions = read_prompt_file(DESCRIPTION_REWRITE_INSTRUCTIONS_PATH)
    return "\n\n".join(
        [
            "System prompt:",
            prompt_template,
            "Current annotation values. Treat these as authoritative if they conflict with the old description:",
            "\n".join(field_lines),
            "Old description:",
            old_description or "(blank)",
            "Task:",
            rewrite_instructions,
        ]
    )


def normalize_description_draft_provider(value: Any) -> str:
    normalized = str(value or "ollama").strip().lower().replace(" ", "").replace("_", "")
    if normalized in {"ollama"}:
        return "ollama"
    if normalized in {"lmstudio", "lm"}:
        return "lmstudio"
    raise ValueError("provider must be Ollama or LM Studio")


def default_description_draft_endpoint(provider: str) -> str:
    return "http://127.0.0.1:11434" if provider == "ollama" else "http://127.0.0.1:1234"


def validate_local_model_endpoint(endpoint: str) -> str:
    parsed = urlparse(endpoint)
    if parsed.scheme not in {"http", "https"}:
        raise ValueError("endpoint must be an http:// or https:// URL")
    hostname = (parsed.hostname or "").lower()
    if hostname not in {"127.0.0.1", "localhost", "::1"}:
        raise ValueError("endpoint must point to localhost, 127.0.0.1, or ::1")
    return endpoint.rstrip("/")


def normalize_description_keyframe_count(value: Any) -> int:
    if value in (None, ""):
        return DESCRIPTION_DRAFT_DEFAULT_KEYFRAMES
    try:
        count = int(value)
    except (TypeError, ValueError) as exc:
        raise ValueError("keyframe_count must be a number") from exc
    if count < 1:
        raise ValueError("keyframe_count must be at least 1")
    return min(count, DESCRIPTION_DRAFT_MAX_KEYFRAMES)


def parse_description_generation_settings(payload: dict[str, Any]) -> dict[str, Any]:
    provider = normalize_description_draft_provider(payload.get("provider"))
    endpoint = validate_local_model_endpoint(
        str(payload.get("endpoint") or default_description_draft_endpoint(provider)).strip()
    )
    model = str(payload.get("model") or "").strip()
    if not model:
        raise ValueError("model is required")
    keyframe_count = normalize_description_keyframe_count(payload.get("keyframe_count"))
    return {
        "provider": provider,
        "endpoint": endpoint,
        "model": model,
        "keyframe_count": keyframe_count,
    }


def source_video_key_for_sample(sample: dict[str, Any]) -> str:
    video_id = str(sample.get("video_id") or "").strip()
    if video_id:
        return canonicalize_source_video_id(video_id)
    source_path = str(sample.get("source_video_path") or "").strip()
    if source_path:
        return canonicalize_source_video_id(Path(source_path).stem)
    return ""


def normalize_batch_source_video_keys(value: Any) -> set[str]:
    if not isinstance(value, list):
        raise ValueError("source_video_keys must be a list")
    keys: set[str] = set()
    for item in value:
        raw_value = str(item or "").strip()
        if not raw_value:
            continue
        if "/" in raw_value or "." in raw_value:
            raw_value = Path(raw_value).stem
        canonical_key = canonicalize_source_video_id(raw_value)
        if canonical_key:
            keys.add(canonical_key)
    if not keys:
        raise ValueError("Select at least one source video")
    return keys


def description_time_seconds(description: Any) -> tuple[str, int] | None:
    for match in DESCRIPTION_TIME_PATTERN.finditer(str(description or "")):
        hours = int(match.group("hours"))
        minutes = int(match.group("minutes"))
        seconds = int(match.group("seconds"))
        normalized_time = f"{hours:02d}:{minutes:02d}:{seconds:02d}"
        if is_valid_time_string(normalized_time):
            return normalized_time, hours * 3600 + minutes * 60 + seconds
    return None


def clock_time_difference_seconds(left_seconds: int, right_seconds: int) -> int:
    raw_difference = abs(left_seconds - right_seconds)
    return min(raw_difference, 24 * 3600 - raw_difference)


def append_sample_note(sample: dict[str, Any], note: str) -> bool:
    current_note = str(sample.get("notes") or "").rstrip()
    if note in current_note:
        return False
    sample["notes"] = f"{current_note}\n{note}" if current_note else note
    return True


def create_description_backup(samples: list[dict[str, Any]], source_video_keys: set[str]) -> Path:
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    DESCRIPTION_BACKUPS_DIR.mkdir(parents=True, exist_ok=True)
    backup_path = DESCRIPTION_BACKUPS_DIR / f"descriptions_{timestamp}.json"
    counter = 1
    while backup_path.exists():
        backup_path = DESCRIPTION_BACKUPS_DIR / f"descriptions_{timestamp}_{counter:02d}.json"
        counter += 1
    payload = {
        "timestamp": utc_now(),
        "source_video_keys": sorted(source_video_keys),
        "samples": [
            {
                "sample_id": sample.get("sample_id", ""),
                "video_id": sample.get("video_id", ""),
                "description": str(sample.get("description", "") or ""),
            }
            for sample in samples
        ],
    }
    atomic_write_json(backup_path, payload)
    return backup_path


def probe_video_duration(path: Path) -> float:
    result = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
            str(path),
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    try:
        duration = float(result.stdout.strip())
    except ValueError as exc:
        raise ValueError("Could not determine clip duration for keyframe extraction") from exc
    if duration <= 0:
        raise ValueError("Clip duration must be greater than zero for keyframe extraction")
    return duration


def extract_keyframes_as_base64(sample: dict[str, Any], keyframe_count: int) -> list[str]:
    clip_path = resolve_workspace_clip_path(sample)
    duration = probe_video_duration(clip_path)
    timestamps = [duration * (index + 1) / (keyframe_count + 1) for index in range(keyframe_count)]
    encoded_frames: list[str] = []
    with tempfile.TemporaryDirectory(prefix="annotation_qwen_keyframes_") as temp_dir:
        temp_path = Path(temp_dir)
        for index, timestamp in enumerate(timestamps):
            frame_path = temp_path / f"frame_{index:02d}.jpg"
            subprocess.run(
                [
                    "ffmpeg",
                    "-y",
                    "-loglevel",
                    "error",
                    "-ss",
                    f"{timestamp:.3f}",
                    "-i",
                    str(clip_path),
                    "-vf",
                    f"scale={DESCRIPTION_DRAFT_KEYFRAME_MAX_WIDTH}:-2:force_original_aspect_ratio=decrease",
                    "-frames:v",
                    "1",
                    "-q:v",
                    "3",
                    str(frame_path),
                ],
                check=True,
                capture_output=True,
                text=True,
            )
            if not frame_path.exists():
                raise ValueError("Keyframe extraction did not produce an image")
            encoded_frames.append(base64.b64encode(frame_path.read_bytes()).decode("ascii"))
    return encoded_frames


def post_json_to_local_model(url: str, payload: dict[str, Any]) -> dict[str, Any]:
    request = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=DESCRIPTION_DRAFT_TIMEOUT_SECONDS) as response:
            response_body = response.read().decode("utf-8")
    except urllib.error.HTTPError as exc:
        response_body = exc.read().decode("utf-8", errors="replace")
        raise LocalModelError(f"Local model server returned HTTP {exc.code}: {response_body[:500]}") from exc
    except urllib.error.URLError as exc:
        raise LocalModelError(f"Could not connect to local model server at {url}: {exc.reason}") from exc
    try:
        return json.loads(response_body)
    except json.JSONDecodeError as exc:
        raise LocalModelError("Local model server returned invalid JSON") from exc


def ollama_chat_url(endpoint: str) -> str:
    base = endpoint.rstrip("/")
    return f"{base}/chat" if base.endswith("/api") else f"{base}/api/chat"


def lm_studio_chat_url(endpoint: str) -> str:
    base = endpoint.rstrip("/")
    return f"{base}/chat/completions" if base.endswith("/v1") else f"{base}/v1/chat/completions"


def lm_studio_native_chat_url(endpoint: str) -> str:
    base = endpoint.rstrip("/")
    return f"{base}/chat" if base.endswith("/api/v1") else f"{base}/api/v1/chat"


def extract_model_response_text(response: dict[str, Any]) -> str:
    def text_from_content(value: Any) -> str:
        if isinstance(value, str):
            return value
        if isinstance(value, list):
            return "\n".join(
                part
                for part in (text_from_content(item) for item in value)
                if part.strip()
            )
        if not isinstance(value, dict):
            return ""

        for key in ("text", "content", "output_text"):
            if key in value:
                text = text_from_content(value[key])
                if text.strip():
                    return text
        if "message" in value:
            text = text_from_content(value["message"])
            if text.strip():
                return text
        return ""

    text_parts: list[str] = []
    for key in ("output", "content", "message", "response", "text", "output_text"):
        if key in response:
            text = text_from_content(response[key])
            if text.strip():
                text_parts.append(text)

    choices = response.get("choices") or []
    if isinstance(choices, list):
        for choice in choices:
            text = text_from_content(choice)
            if text.strip():
                text_parts.append(text)

    return "\n".join(part.strip() for part in text_parts if part.strip()).strip()


def call_ollama_description_model(endpoint: str, model: str, prompt: str, images: list[str]) -> str:
    payload = {
        "model": model,
        "stream": False,
        "messages": [
            {
                "role": "user",
                "content": prompt,
                "images": images,
            }
        ],
    }
    response = post_json_to_local_model(ollama_chat_url(endpoint), payload)
    return extract_model_response_text(response)


def call_lm_studio_description_model(endpoint: str, model: str, prompt: str, images: list[str]) -> str:
    input_items: list[dict[str, Any]] = [{"type": "text", "content": prompt}]
    input_items.extend(
        {
            "type": "image",
            "data_url": f"data:image/jpeg;base64,{image}",
        }
        for image in images
    )
    payload = {
        "model": model,
        "input": input_items,
        "temperature": 0.2,
        "context_length": LM_STUDIO_DESCRIPTION_CONTEXT_LENGTH,
        "max_output_tokens": DESCRIPTION_DRAFT_MAX_OUTPUT_TOKENS,
        "store": False,
    }
    try:
        response = post_json_to_local_model(lm_studio_native_chat_url(endpoint), payload)
    except LocalModelError as exc:
        if "HTTP 404" not in str(exc) and "HTTP 405" not in str(exc):
            raise
        return call_lm_studio_openai_compatible_description_model(endpoint, model, prompt, images)

    return extract_model_response_text(response)


def call_lm_studio_openai_compatible_description_model(
    endpoint: str,
    model: str,
    prompt: str,
    images: list[str],
) -> str:
    content: list[dict[str, Any]] = [{"type": "text", "text": prompt}]
    content.extend(
        {
            "type": "image_url",
            "image_url": {"url": f"data:image/jpeg;base64,{image}"},
        }
        for image in images
    )
    payload = {
        "model": model,
        "messages": [{"role": "user", "content": content}],
        "temperature": 0.2,
    }
    response = post_json_to_local_model(lm_studio_chat_url(endpoint), payload)
    return extract_model_response_text(response)


def generate_description_draft_for_sample(
    sample: dict[str, Any],
    settings: dict[str, Any],
    prompt_templates: dict[str, str],
) -> dict[str, Any]:
    prompt_type = description_prompt_type_for_sample(sample)
    prompt_template = prompt_templates[prompt_type]
    prompt = build_description_draft_prompt(sample, prompt_template)
    images = extract_keyframes_as_base64(sample, int(settings["keyframe_count"]))

    provider = settings["provider"]
    endpoint = settings["endpoint"]
    model = settings["model"]
    if provider == "ollama":
        draft = call_ollama_description_model(endpoint, model, prompt, images)
    else:
        draft = call_lm_studio_description_model(endpoint, model, prompt, images)
    if not draft:
        raise LocalModelError(
            "The model returned an empty response. Confirm the selected model supports image inputs."
        )

    clip_path = resolve_workspace_clip_path(sample)
    sample_id = str(sample.get("sample_id", ""))
    LOGGER.info(
        "Generated description draft for sample %s using %s model %s with %s keyframes",
        sample_id,
        provider,
        model,
        len(images),
    )
    return {
        "old_description": str(sample.get("description", "") or ""),
        "draft_description": draft,
        "request_summary": {
            "provider": "Ollama" if provider == "ollama" else "LM Studio",
            "endpoint": endpoint,
            "model": model,
            "prompt_type": prompt_type,
            "keyframes": len(images),
            "clip_path": workspace_relative(clip_path),
        },
    }


def generate_description_draft(sample_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    samples = load_samples()
    sample = next((item for item in samples if item.get("sample_id") == sample_id), None)
    if sample is None:
        raise ValueError("Sample not found")
    if sample.get("is_deleted"):
        raise ValueError("Restore the sample before generating a description draft")

    settings = parse_description_generation_settings(payload)
    return generate_description_draft_for_sample(sample, settings, load_prompt_templates())


def describe_batch_time_skip(sample: dict[str, Any]) -> dict[str, Any] | None:
    description_time = description_time_seconds(sample.get("description", ""))
    if description_time is None:
        return None

    description_time_text, description_seconds = description_time
    annotation_seconds = sample_annotation_time_seconds(sample)
    annotation_time_text = str(sample.get("time") or "").strip()
    if annotation_seconds is None:
        return {
            "sample_id": sample.get("sample_id", ""),
            "video_id": sample.get("video_id", ""),
            "description_time": description_time_text,
            "annotation_time": annotation_time_text,
            "difference_seconds": None,
            "reason": "annotation_time_missing_or_invalid",
            "note": (
                "Batch description generation skipped: old description time "
                f"{description_time_text} could not be compared because the annotation time is missing or invalid."
            ),
        }

    difference_seconds = clock_time_difference_seconds(description_seconds, annotation_seconds)
    if difference_seconds <= DESCRIPTION_BATCH_TIME_TOLERANCE_SECONDS:
        return None

    return {
        "sample_id": sample.get("sample_id", ""),
        "video_id": sample.get("video_id", ""),
        "description_time": description_time_text,
        "annotation_time": annotation_time_text,
        "difference_seconds": difference_seconds,
        "reason": "time_discrepancy",
        "note": (
            "Batch description generation skipped: old description time "
            f"{description_time_text} differs from annotation time {annotation_time_text} "
            f"by {difference_seconds} seconds."
        ),
    }


def generate_description_batch(payload: dict[str, Any]) -> dict[str, Any]:
    source_video_keys = normalize_batch_source_video_keys(payload.get("source_video_keys"))
    settings = parse_description_generation_settings(payload)
    prompt_templates = load_prompt_templates()
    samples = load_samples()
    selected_samples = [
        sample
        for sample in samples
        if not sample.get("is_deleted") and source_video_key_for_sample(sample) in source_video_keys
    ]
    if not selected_samples:
        raise ValueError("No active samples found for the selected source videos")

    backup_path = create_description_backup(selected_samples, source_video_keys)
    time_skips: list[dict[str, Any]] = []
    no_violation_skips: list[dict[str, Any]] = []
    generated: list[dict[str, Any]] = []
    failures: list[dict[str, Any]] = []
    eligible_samples: list[dict[str, Any]] = []
    changed = False

    for sample in selected_samples:
        time_skip = describe_batch_time_skip(sample)
        if time_skip is not None:
            if append_sample_note(sample, time_skip["note"]):
                changed = True
            time_skips.append({key: value for key, value in time_skip.items() if key != "note"})
            continue
        if normalize_violation_type(sample.get("violation_type", "")) == "no_violation":
            no_violation_skips.append(
                {
                    "sample_id": sample.get("sample_id", ""),
                    "video_id": sample.get("video_id", ""),
                    "reason": "no_violation",
                }
            )
            continue
        eligible_samples.append(sample)

    for sample in eligible_samples:
        sample_id = str(sample.get("sample_id", ""))
        try:
            draft_result = generate_description_draft_for_sample(sample, settings, prompt_templates)
        except subprocess.CalledProcessError as exc:
            failures.append(
                {
                    "sample_id": sample_id,
                    "video_id": sample.get("video_id", ""),
                    "error": exc.stderr.strip() or "Keyframe extraction failed",
                }
            )
            continue
        except (LocalModelError, ValueError) as exc:
            failures.append(
                {
                    "sample_id": sample_id,
                    "video_id": sample.get("video_id", ""),
                    "error": str(exc),
                }
            )
            continue

        sample["description"] = draft_result["draft_description"]
        changed = True
        generated.append(
            {
                "sample_id": sample_id,
                "video_id": sample.get("video_id", ""),
                "request_summary": draft_result["request_summary"],
            }
        )

    if changed:
        save_samples(samples)

    append_change_log(
        {
            "timestamp": utc_now(),
            "action": "batch_description_generation",
            "source_video_keys": sorted(source_video_keys),
            "backup_path": workspace_relative(backup_path),
            "selected_count": len(selected_samples),
            "eligible_count": len(eligible_samples),
            "generated_count": len(generated),
            "time_discrepancy_count": len(time_skips),
            "no_violation_count": len(no_violation_skips),
            "failed_count": len(failures),
            "generated_sample_ids": [item["sample_id"] for item in generated],
        }
    )

    return {
        "samples": samples,
        "summary": build_summary(samples),
        "backup_path": workspace_relative(backup_path),
        "selected_count": len(selected_samples),
        "eligible_count": len(eligible_samples),
        "generated_count": len(generated),
        "time_discrepancy_count": len(time_skips),
        "no_violation_count": len(no_violation_skips),
        "failed_count": len(failures),
        "generated": generated,
        "time_discrepancies": time_skips,
        "no_violation_skips": no_violation_skips,
        "failures": failures,
    }


def default_rules() -> list[dict[str, Any]]:
    timestamp = utc_now()
    rules: list[dict[str, Any]] = [
        {
            "id": "default-weather",
            "label": "Global default weather",
            "field_name": "weather",
            "value": "clear",
            "conditions": {},
            "created_at": timestamp,
            "updated_at": timestamp,
        },
        {
            "id": "default-light",
            "label": "Global default light",
            "field_name": "light",
            "value": "daylight",
            "conditions": {},
            "created_at": timestamp,
            "updated_at": timestamp,
        },
    ]

    for video_id, intersection_type in DEFAULT_INTERSECTION_TYPES.items():
        rules.append(
            {
                "id": f"default-intersection-{video_id}",
                "label": f"{video_id} default intersection type",
                "field_name": "intersection_type",
                "value": intersection_type,
                "conditions": {"video_id": video_id},
                "created_at": timestamp,
                "updated_at": timestamp,
            }
        )

    for field_name in ("entering_lane", "exiting_lane"):
        rules.append(
            {
                "id": f"default-jaywalking-{field_name}",
                "label": f"Jaywalking {field_label(field_name)} is na",
                "field_name": field_name,
                "value": "na",
                "conditions": {"violation_type": "jaywalking"},
                "created_at": timestamp,
                "updated_at": timestamp,
            }
        )

    for field_name, value in (
        ("violator_type", "na"),
        ("color", "na"),
        ("entering_direction", "na"),
        ("entering_lane", "na"),
        ("exiting_direction", "na"),
        ("exiting_lane", "na"),
        ("time", ""),
        ("description", ""),
    ):
        rules.append(
            {
                "id": f"default-no-violation-{field_name}",
                "label": f"No violation default {field_label(field_name)}",
                "field_name": field_name,
                "value": value,
                "conditions": {"violation_type": "no_violation"},
                "created_at": timestamp,
                "updated_at": timestamp,
            }
        )
    return rules


def normalize_visibility_rule_value(value: Any) -> str:
    normalized = "" if value is None else str(value).strip().lower()
    if normalized in {"public", "true", "yes", "1"}:
        return "public"
    if normalized in {"secret", "false", "no", "0"}:
        return "secret"
    raise ValueError("visibility rules must use 'public' or 'secret'")


def normalize_rule(rule: dict[str, Any], index: int) -> dict[str, Any]:
    timestamp = utc_now()
    rule_id = str(rule.get("id") or f"rule_{index + 1}")
    field_name = str(rule.get("field_name") or "").strip()
    if field_name not in RULE_TARGET_FIELDS:
        raise ValueError(f"Unsupported rule field: {field_name}")

    conditions_input = rule.get("conditions") if isinstance(rule.get("conditions"), dict) else {}
    conditions: dict[str, str] = {}
    for field_name_key in RULE_CONDITION_FIELDS:
        raw_value = conditions_input.get(field_name_key, "")
        normalized_value = "" if raw_value is None else str(raw_value).strip()
        if field_name_key == "video_id":
            normalized_value = canonicalize_source_video_id(normalized_value)
        if field_name_key == "violation_type":
            normalized_value = normalize_violation_type(normalized_value)
        if normalized_value:
            conditions[field_name_key] = normalized_value

    value = "" if rule.get("value") is None else str(rule.get("value"))
    if field_name == "violation_type":
        value = normalize_violation_type(value.strip())
    if field_name == "is_for_export":
        value = normalize_visibility_rule_value(value)

    legacy_labels = {
        "Jaywalking entering_lane is na": "Jaywalking Initial Lane is na",
        "Jaywalking exiting_lane is na": "Jaywalking Final Lane is na",
        "No violation default entering_lane": "No violation default Initial Lane",
        "No violation default exiting_lane": "No violation default Final Lane",
    }
    raw_label = str(rule.get("label") or "").strip()

    return {
        "id": rule_id,
        "label": legacy_labels.get(raw_label, raw_label) or f"Rule {index + 1}",
        "field_name": field_name,
        "value": value,
        "conditions": conditions,
        "created_at": str(rule.get("created_at") or timestamp),
        "updated_at": str(rule.get("updated_at") or timestamp),
    }


def load_rules() -> list[dict[str, Any]]:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if not RULES_PATH.exists():
        rules = default_rules()
        atomic_write_json(RULES_PATH, rules)
        return rules

    raw_rules = load_json(RULES_PATH)
    if not isinstance(raw_rules, list):
        rules = default_rules()
        atomic_write_json(RULES_PATH, rules)
        return rules

    normalized_rules = [normalize_rule(rule, index) for index, rule in enumerate(raw_rules)]
    if normalized_rules != raw_rules:
        atomic_write_json(RULES_PATH, normalized_rules)
    return normalized_rules


def save_rules(rules: list[dict[str, Any]]) -> None:
    atomic_write_json(RULES_PATH, [normalize_rule(rule, index) for index, rule in enumerate(rules)])


def make_rule_record(payload: dict[str, Any], existing_rule: dict[str, Any] | None = None) -> dict[str, Any]:
    if not isinstance(payload, dict):
        raise ValueError("Rule payload must be an object")

    timestamp = utc_now()
    conditions_input = payload.get("conditions") if isinstance(payload.get("conditions"), dict) else {}
    conditions = {
        field_name: ("" if conditions_input.get(field_name) is None else str(conditions_input.get(field_name)).strip())
        for field_name in RULE_CONDITION_FIELDS
    }
    if conditions["video_id"]:
        conditions["video_id"] = canonicalize_source_video_id(conditions["video_id"])
    if conditions["violation_type"]:
        conditions["violation_type"] = normalize_violation_type(conditions["violation_type"])
    normalized_conditions = {key: value for key, value in conditions.items() if value}

    field_name = str(payload.get("field_name") or "").strip()
    if field_name not in RULE_TARGET_FIELDS:
        raise ValueError("field_name must be one of the editable fields or visibility")

    value = "" if payload.get("value") is None else str(payload.get("value"))
    if field_name == "violation_type":
        value = normalize_violation_type(value.strip())
    if field_name == "is_for_export":
        value = normalize_visibility_rule_value(value)
    if field_name == "light" and value and value not in ALLOWED_LIGHT_VALUES:
        raise ValueError("light rules may only use 'daylight' or 'night'")

    return {
        "id": existing_rule["id"] if existing_rule else f"rule_{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%f')}",
        "label": str(payload.get("label") or "").strip() or (existing_rule.get("label") if existing_rule else "Untitled rule"),
        "field_name": field_name,
        "value": value,
        "conditions": normalized_conditions,
        "created_at": existing_rule.get("created_at") if existing_rule else timestamp,
        "updated_at": timestamp,
    }


def recompute_sample_fields_from_rules(
    samples: list[dict[str, Any]],
    rules: list[dict[str, Any]],
    field_names: set[str],
) -> int:
    updated_count = 0
    for sample in samples:
        sample_changed = False
        record = {
            "video_id": sample.get("video_id") or "",
            "clip_folder": sample.get("clip_folder") or "",
            "violation_type": sample.get("violation_type") or "",
            "violator_type": sample.get("violator_type") or "",
        }
        for field_name in field_names:
            next_value = default_value_for_field(field_name, record, rules)
            if field_name == "is_for_export":
                next_bool = True if not next_value else normalize_visibility_rule_value(next_value) == "public"
                current_bool = bool(sample.get("is_for_export", True))
                if current_bool == next_bool:
                    continue
                sample["is_for_export"] = next_bool
                sample_changed = True
                continue
            current_value = "" if sample.get(field_name) is None else str(sample.get(field_name))
            if current_value == next_value:
                continue
            sample[field_name] = next_value
            if field_name in {"violation_type", "violator_type"}:
                record[field_name] = next_value
            sample_changed = True
        if sample_changed:
            normalize_sample_metadata(sample)
            updated_count += 1
    return updated_count


def create_rule(schema: dict[str, Any], payload: dict[str, Any], apply_retroactive: bool) -> dict[str, Any]:
    rules = load_rules()
    new_rule = make_rule_record(payload)
    rules.append(new_rule)
    save_rules(rules)

    updated_samples = 0
    summary = build_summary(load_samples())
    if apply_retroactive:
        samples = load_samples()
        updated_samples = recompute_sample_fields_from_rules(samples, rules, {new_rule["field_name"]})
        if updated_samples:
            save_samples(samples)
        summary = build_summary(samples)

    append_change_log(
        {
            "timestamp": utc_now(),
            "action": "create_rule",
            "rule_id": new_rule["id"],
            "apply_retroactive": apply_retroactive,
            "updated_sample_count": updated_samples,
        }
    )
    return {
        "rule": new_rule,
        "rules": rules,
        "summary": summary,
        "rules_payload": build_rules_payload(schema, rules),
        "updated_sample_count": updated_samples,
    }


def update_rule(schema: dict[str, Any], rule_id: str, payload: dict[str, Any], apply_retroactive: bool) -> dict[str, Any]:
    rules = load_rules()
    index = next((idx for idx, rule in enumerate(rules) if rule["id"] == rule_id), -1)
    if index == -1:
        raise ValueError("Rule not found")

    old_rule = rules[index]
    rules[index] = make_rule_record(payload, existing_rule=old_rule)
    save_rules(rules)

    affected_fields = {old_rule["field_name"], rules[index]["field_name"]}
    updated_samples = 0
    summary = build_summary(load_samples())
    if apply_retroactive:
        samples = load_samples()
        updated_samples = recompute_sample_fields_from_rules(samples, rules, affected_fields)
        if updated_samples:
            save_samples(samples)
        summary = build_summary(samples)

    append_change_log(
        {
            "timestamp": utc_now(),
            "action": "update_rule",
            "rule_id": rule_id,
            "apply_retroactive": apply_retroactive,
            "updated_sample_count": updated_samples,
        }
    )
    return {
        "rule": rules[index],
        "rules": rules,
        "summary": summary,
        "rules_payload": build_rules_payload(schema, rules),
        "updated_sample_count": updated_samples,
    }


def delete_rule(schema: dict[str, Any], rule_id: str, apply_retroactive: bool) -> dict[str, Any]:
    rules = load_rules()
    index = next((idx for idx, rule in enumerate(rules) if rule["id"] == rule_id), -1)
    if index == -1:
        raise ValueError("Rule not found")

    removed_rule = rules.pop(index)
    save_rules(rules)

    updated_samples = 0
    summary = build_summary(load_samples())
    if apply_retroactive:
        samples = load_samples()
        updated_samples = recompute_sample_fields_from_rules(samples, rules, {removed_rule["field_name"]})
        if updated_samples:
            save_samples(samples)
        summary = build_summary(samples)

    append_change_log(
        {
            "timestamp": utc_now(),
            "action": "delete_rule",
            "rule_id": rule_id,
            "apply_retroactive": apply_retroactive,
            "updated_sample_count": updated_samples,
        }
    )
    return {
        "deleted_rule_id": rule_id,
        "rules": rules,
        "summary": summary,
        "rules_payload": build_rules_payload(schema, rules),
        "updated_sample_count": updated_samples,
    }


def build_rules_payload(schema: dict[str, Any], rules: list[dict[str, Any]]) -> dict[str, Any]:
    source_video_options = [record["video_id"] for record in discover_source_videos()]
    field_catalog = []
    for field in schema["fields"]:
        options = list(field.get("options", []))
        if field["input_type"] == "select" and "" not in options:
            options = [""] + options
        field_catalog.append(
            {
                "name": field["name"],
                "label": field["label"],
                "input_type": field["input_type"],
                "options": options,
            }
        )
    field_catalog.append(
        {
            "name": "is_for_export",
            "label": "Visibility",
            "input_type": "select",
            "options": ["public", "secret"],
        }
    )

    return {
        "rules": rules,
        "condition_fields": [
            {
                "name": "video_id",
                "label": "Source Video",
                "options": [""] + source_video_options,
            },
            {
                "name": "violation_type",
                "label": "Violation Type",
                "options": [""] + next(
                    (field["options"] for field in schema["fields"] if field["name"] == "violation_type"),
                    [],
                ),
            },
            {
                "name": "violator_type",
                "label": "Violator Type",
                "options": [""] + next(
                    (field["options"] for field in schema["fields"] if field["name"] == "violator_type"),
                    [],
                ),
            },
        ],
        "fields": field_catalog,
    }


def dedupe_preserve_order(values: list[str]) -> list[str]:
    ordered: list[str] = []
    seen: set[str] = set()
    for raw_value in values:
        value = raw_value.strip()
        if not value or value in seen:
            continue
        ordered.append(value)
        seen.add(value)
    return ordered


def filter_field_options(field_name: str, options: list[str]) -> list[str]:
    hidden_options = HIDDEN_FIELD_OPTIONS.get(field_name, set())
    return [option for option in options if option not in hidden_options]


def parse_video_number(video_id: str) -> int | None:
    match = re.search(r"(\d+)$", video_id)
    if not match:
        return None
    return int(match.group(1))


def field_label(field_name: str) -> str:
    custom_labels = {
        "entering_direction": "Initial Position",
        "exiting_direction": "Final Position",
        "entering_lane": "Initial Lane",
        "exiting_lane": "Final Lane",
    }
    if field_name in custom_labels:
        return custom_labels[field_name]
    return field_name.replace("_", " ").title()


def parse_option_comment(field_name: str, comment: str) -> list[str]:
    if not comment:
        return []
    option_source = comment.strip()
    if "(" in option_source and ")" in option_source:
        option_source = option_source[option_source.find("(") + 1 : option_source.rfind(")")]
    if field_name in TEXT_FIELDS or field_name in TEXTAREA_FIELDS:
        return []
    return dedupe_preserve_order(option_source.split(","))


def load_annotation_rows() -> dict[str, list[dict[str, Any]]]:
    if not ANNOTATIONS_PATH.exists():
        LOGGER.warning("Source annotations not found at %s; starting with no annotation rows", ANNOTATIONS_PATH)
        return {}
    rows = load_json(ANNOTATIONS_PATH)
    return {item["video_id"]: item.get("violations", []) for item in rows}


def build_schema() -> dict[str, Any]:
    line_pattern = re.compile(
        r'^\s*"(?P<field>[^"]+)"\s*:\s*"[^"]*"\s*,?\s*(?://\s*(?P<comment>.*))?$'
    )

    field_notes: dict[str, str] = {}
    field_options: dict[str, list[str]] = {}

    if NOTES_PATH.exists():
        for line in NOTES_PATH.read_text(encoding="utf-8").splitlines():
            match = line_pattern.match(line)
            if not match:
                continue
            field_name = match.group("field")
            comment = (match.group("comment") or "").strip()
            field_notes[field_name] = comment
            field_options[field_name] = parse_option_comment(field_name, comment)
    else:
        LOGGER.warning("Source notes not found at %s; using public default field options", NOTES_PATH)
        field_notes.update(DEFAULT_FIELD_NOTES)
        for field_name, comment in DEFAULT_FIELD_NOTES.items():
            field_options[field_name] = parse_option_comment(field_name, comment)

    annotation_rows = load_annotation_rows()
    actual_violation_types = dedupe_preserve_order(
        DEFAULT_VIOLATION_TYPES
        + [
            normalize_violation_type(violation.get("violation_type", ""))
            for violations in annotation_rows.values()
            for violation in violations
        ]
        + [normalize_violation_type(path.parent.name) for path in sorted((DATASET_DIR / "clips").rglob("*.mp4"))]
    )
    field_options["violation_type"] = [
        violation_type
        for violation_type in actual_violation_types
        if violation_type not in HIDDEN_VIOLATION_TYPE_OPTIONS
    ]
    field_options["light"] = ["daylight", "night"]
    field_notes["light"] = "daylight, night"

    for lane_field in ("entering_lane", "exiting_lane"):
        field_options[lane_field] = dedupe_preserve_order(field_options.get(lane_field, []) + ["na"])

    for direction_field in ("entering_direction", "exiting_direction"):
        field_options[direction_field] = DIRECTION_OPTIONS + ["na"]
        field_notes[direction_field] = ", ".join(DIRECTION_OPTIONS)

    for nullable_field in ("violator_type", "color"):
        field_options[nullable_field] = dedupe_preserve_order(field_options.get(nullable_field, []) + ["na"])

    for field_name, options in list(field_options.items()):
        field_options[field_name] = filter_field_options(field_name, options)
        if field_name in field_notes and field_name in HIDDEN_FIELD_OPTIONS:
            field_notes[field_name] = ", ".join(field_options[field_name])

    field_notes["notes"] = "Workspace-only notes. Not exported."

    fields: list[dict[str, Any]] = []
    for field_name in PATCHABLE_FIELDS:
        input_type = "text"
        if field_name in TEXTAREA_FIELDS:
            input_type = "textarea"
        elif field_name not in TEXT_FIELDS:
            input_type = "select"

        fields.append(
            {
                "name": field_name,
                "label": field_label(field_name),
                "input_type": input_type,
                "options": field_options.get(field_name, []),
                "source_note": field_notes.get(field_name, ""),
                "workspace_only": field_name in WORKSPACE_ONLY_FIELDS,
            }
        )

    return {
        "fields": fields,
        "editable_fields": EDITABLE_FIELDS,
        "field_notes": field_notes,
    }


def build_sample_id(clip_path: Path) -> str:
    return clip_path.with_suffix("").as_posix().replace("/", "__")


def sanitize_path_segment(value: str) -> str:
    return re.sub(r"[^a-zA-Z0-9_-]+", "_", value).strip("_") or "clip"


def derive_default_clip_bounds(sample: dict[str, Any]) -> tuple[float | None, float | None]:
    start_time = sample.get("start_time")
    end_time = sample.get("end_time")
    clip_path = str(sample.get("clip_path", ""))
    if start_time is None or end_time is None:
        return None, None
    if clip_path.startswith("clips/"):
        return max(0.0, float(start_time) - DEFAULT_CLIP_PADDING_SECONDS), float(end_time) + DEFAULT_CLIP_PADDING_SECONDS
    return float(start_time), float(end_time)


def source_video_relative_path(video_id: str) -> str:
    return f"videos/{canonicalize_source_video_id(video_id)}.avi"


def source_video_browser_relative_path(video_id: str) -> str:
    return workspace_relative(SOURCE_VIDEO_COPIES_DIR / f"{sanitize_path_segment(canonicalize_source_video_id(video_id))}.mp4")


def discover_source_videos() -> list[dict[str, str]]:
    video_root = DATASET_DIR / "videos"
    if not video_root.exists():
        return []

    positions = load_source_video_positions()
    discovered: dict[str, dict[str, str]] = {}
    for path in sorted(video_root.iterdir()):
        if not path.is_file() or path.suffix.lower() not in SUPPORTED_SOURCE_VIDEO_EXTENSIONS:
            continue
        relative_path = path.relative_to(DATASET_DIR).as_posix()
        canonical_id = canonicalize_source_video_id(path.stem)
        discovered.setdefault(
            canonical_id,
            {
                "source_video_key": canonical_id,
                "video_id": canonical_id,
                "source_video_path": relative_path,
                "file_name": path.name,
                "last_position_seconds": positions.get(canonical_id, 0.0),
            },
        )
    return sorted(
        discovered.values(),
        key=lambda item: (
            parse_video_number(item["video_id"]) is None,
            parse_video_number(item["video_id"]) or 0,
            item["video_id"],
        ),
    )


def resolve_source_video_record(source_video_key: str) -> dict[str, str]:
    canonical_key = canonicalize_source_video_id(source_video_key)
    for record in discover_source_videos():
        if record["source_video_key"] == canonical_key:
            return record
    raise ValueError("Source video file does not exist")


def normalize_violation_type(value: Any) -> str:
    normalized = "" if value is None else str(value)
    return {
        "crossing": "jaywalking",
        "pedestrian_crossing": "jaywalking",
        "lane_keeping": "lane_discipline",
        "wrong_lane": "lane_use_control",
    }.get(normalized, normalized)


def rule_matches_record(rule: dict[str, Any], record: dict[str, Any]) -> bool:
    conditions = rule.get("conditions", {})
    if not isinstance(conditions, dict):
        return False
    for field_name, expected_value in conditions.items():
        actual_value = "" if record.get(field_name) is None else str(record.get(field_name)).strip()
        if field_name == "violation_type":
            actual_value = normalize_violation_type(actual_value)
        if actual_value != str(expected_value).strip():
            return False
    return True


def default_value_for_field(field_name: str, record: dict[str, Any], rules: list[dict[str, Any]] | None = None) -> str:
    if rules is None:
        rules = load_rules()

    best_value = ""
    best_key = (-1, -1)
    for index, rule in enumerate(rules):
        if rule.get("field_name") != field_name:
            continue
        if not rule_matches_record(rule, record):
            continue
        specificity = len(rule.get("conditions", {}))
        key = (specificity, index)
        if key >= best_key:
            best_value = "" if rule.get("value") is None else str(rule.get("value"))
            best_key = key
    return best_value


def default_export_state_for_record(record: dict[str, Any], rules: list[dict[str, Any]] | None = None) -> bool:
    value = default_value_for_field("is_for_export", record, rules)
    if not value:
        return True
    return normalize_visibility_rule_value(value) == "public"


def normalize_sample_metadata(sample: dict[str, Any]) -> None:
    sample["video_id"] = canonicalize_source_video_id(sample.get("video_id", ""))
    sample["violation_type"] = normalize_violation_type(sample.get("violation_type", ""))
    if "source_video_path" not in sample or not sample["source_video_path"]:
        sample["source_video_path"] = source_video_relative_path(sample["video_id"])
    sample["source_video_path"] = canonicalize_source_video_path(sample.get("source_video_path"))
    if "source_video_browser_path" not in sample or not sample["source_video_browser_path"] or str(
        sample["source_video_browser_path"]
    ).startswith("annotation_workspace/source_videos_mp4/"):
        sample["source_video_browser_path"] = source_video_browser_relative_path(sample["video_id"])
    sample["source_video_browser_path"] = source_video_browser_relative_path(sample["video_id"])
    if "original_clip_path" not in sample or not sample["original_clip_path"]:
        sample["original_clip_path"] = sample.get("clip_path", "")
    if "clip_variant" not in sample or not sample["clip_variant"]:
        sample["clip_variant"] = "dataset" if str(sample.get("clip_path", "")).startswith("clips/") else "generated"
    if "is_for_export" not in sample:
        sample["is_for_export"] = True
    if "notes" not in sample:
        sample["notes"] = ""
    if str(sample.get("clip_path", "")).startswith("annotation_workspace/generated_clips/"):
        sample["clip_path"] = sample["clip_path"].replace(
            "annotation_workspace/generated_clips/",
            "annotation_workspace_data/generated_clips/",
            1,
        )

    clip_start, clip_end = derive_default_clip_bounds(sample)
    if sample.get("clip_source_start_time") is None and clip_start is not None:
        sample["clip_source_start_time"] = clip_start
    if sample.get("clip_source_end_time") is None and clip_end is not None:
        sample["clip_source_end_time"] = clip_end


def move_directory_contents(source_dir: Path, target_dir: Path) -> None:
    if not source_dir.exists():
        return
    target_dir.mkdir(parents=True, exist_ok=True)
    for item in sorted(source_dir.iterdir()):
        destination = target_dir / item.name
        if destination.exists():
            if item.is_dir() and destination.is_dir():
                move_directory_contents(item, destination)
                if item.exists():
                    item.rmdir()
            continue
        shutil.move(str(item), str(destination))
    if source_dir.exists():
        try:
            source_dir.rmdir()
        except OSError:
            pass


def migrate_legacy_workspace_data() -> None:
    RUNTIME_DIR.mkdir(parents=True, exist_ok=True)
    move_directory_contents(LEGACY_DATA_DIR, DATA_DIR)
    move_directory_contents(LEGACY_EXPORT_DIR, EXPORT_DIR)
    move_directory_contents(LEGACY_GENERATED_CLIPS_DIR, GENERATED_CLIPS_DIR)
    move_directory_contents(LEGACY_SOURCE_VIDEO_COPIES_DIR, SOURCE_VIDEO_COPIES_DIR)


def scan_clip_records() -> tuple[list[dict[str, Any]], Counter[str]]:
    clip_root = DATASET_DIR / "clips"
    clip_pattern = re.compile(r"(?P<video_id>video_\d+)_v(?P<sequence>\d+)\.mp4$")
    clip_records: list[dict[str, Any]] = []
    logical_counts: Counter[str] = Counter()

    if not clip_root.exists():
        LOGGER.warning("Clip directory not found at %s; starting with no clips", clip_root)
        return clip_records, logical_counts

    for clip_path in sorted(clip_root.rglob("*.mp4")):
        relative_path = clip_path.relative_to(DATASET_DIR)
        match = clip_pattern.match(clip_path.name)
        if not match:
            continue
        video_id = match.group("video_id")
        clip_sequence = int(match.group("sequence"))
        logical_id = f"{video_id}_v{clip_sequence:03d}"
        logical_counts[logical_id] += 1
        clip_records.append(
            {
                "sample_id": build_sample_id(relative_path),
                "clip_path": relative_path.as_posix(),
                "video_id": video_id,
                "clip_sequence": clip_sequence,
                "clip_folder": clip_path.parent.name,
                "logical_id": logical_id,
            }
        )

    return clip_records, logical_counts


def build_sample_record(
    record: dict[str, Any],
    source_row: dict[str, Any] | None,
    logical_counts: Counter[str],
    source_notes: dict[str, str],
    rules: list[dict[str, Any]],
) -> dict[str, Any]:
    violation_type = normalize_violation_type(source_row.get("violation_type") if source_row else record.get("clip_folder"))
    if source_row is None:
        mapping_status = "unlinked"
    elif logical_counts[record["logical_id"]] > 1:
        mapping_status = "ambiguous"
    else:
        mapping_status = "matched"

    rule_record = {**record, "violation_type": violation_type}
    editable_values = {field: default_value_for_field(field, rule_record, rules) for field in EDITABLE_FIELDS}
    if mapping_status == "matched" and source_row is not None:
        for field in EDITABLE_FIELDS:
            value = source_row.get(field, "")
            editable_values[field] = default_value_for_field(field, rule_record, rules) if value is None else str(value)
    else:
        editable_values["violation_type"] = normalize_violation_type(record["clip_folder"])

    sample = {
        **record,
        **editable_values,
        "mapping_status": mapping_status,
        "is_deleted": False,
        "is_for_export": default_export_state_for_record(rule_record, rules),
        "start_time": source_row.get("start_time") if source_row else None,
        "end_time": source_row.get("end_time") if source_row else None,
        "original_annotation": source_row if mapping_status == "matched" else None,
        "candidate_original": source_row if mapping_status == "ambiguous" else None,
        "source_notes": copy.deepcopy(source_notes),
        "source_video_path": source_video_relative_path(record["video_id"]),
        "original_clip_path": record["clip_path"],
        "clip_variant": "dataset",
        "clip_source_start_time": None,
        "clip_source_end_time": None,
    }
    normalize_sample_metadata(sample)
    return sample


def bootstrap_samples(schema: dict[str, Any]) -> list[dict[str, Any]]:
    annotations_by_video = load_annotation_rows()
    clip_records, logical_counts = scan_clip_records()
    source_notes = copy.deepcopy(schema["field_notes"])
    rules = load_rules()
    samples: list[dict[str, Any]] = []
    for record in clip_records:
        annotation_list = annotations_by_video.get(record["video_id"], [])
        source_row = (
            copy.deepcopy(annotation_list[record["clip_sequence"] - 1])
            if 0 < record["clip_sequence"] <= len(annotation_list)
            else None
        )
        samples.append(build_sample_record(record, source_row, logical_counts, source_notes, rules))

    samples.sort(key=lambda item: (item["video_id"], item["clip_sequence"], item["clip_path"]))
    return samples


def ensure_workspace(schema: dict[str, Any]) -> list[dict[str, Any]]:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    EXPORT_DIR.mkdir(parents=True, exist_ok=True)
    GENERATED_CLIPS_DIR.mkdir(parents=True, exist_ok=True)
    SOURCE_VIDEO_COPIES_DIR.mkdir(parents=True, exist_ok=True)

    if not SAMPLES_PATH.exists():
        samples = bootstrap_samples(schema)
        assign_clip_export_names(samples)
        atomic_write_json(SAMPLES_PATH, samples)
        append_change_log(
            {
                "timestamp": utc_now(),
                "action": "bootstrap",
                "sample_count": len(samples),
            }
        )
        return samples

    samples = load_json(SAMPLES_PATH)
    normalized = False
    for sample in samples:
        before = json.dumps(sample, sort_keys=True, ensure_ascii=False)
        normalize_sample_metadata(sample)
        after = json.dumps(sample, sort_keys=True, ensure_ascii=False)
        if before != after:
            normalized = True
    if assign_clip_export_names(samples):
        normalized = True
    if normalized:
        save_samples(samples)
    return samples


def missing_fields_for_sample(sample: dict[str, Any]) -> list[str]:
    missing: list[str] = []
    for field in EDITABLE_FIELDS:
        value = sample.get(field, "")
        if not str(value).strip():
            missing.append(field)
    return missing


def is_complete_except_description(sample: dict[str, Any]) -> bool:
    missing_fields = missing_fields_for_sample(sample)
    return missing_fields == ["description"]


def build_summary(samples: list[dict[str, Any]]) -> dict[str, int]:
    active_samples = [sample for sample in samples if not sample.get("is_deleted")]
    return {
        "total": len(active_samples),
        "for_export": sum(1 for sample in active_samples if sample.get("is_for_export", True)),
        "secret": sum(1 for sample in active_samples if not sample.get("is_for_export", True)),
        "annotated": sum(1 for sample in active_samples if not missing_fields_for_sample(sample)),
        "complete_except_description": sum(1 for sample in active_samples if is_complete_except_description(sample)),
        "missing_fields": sum(len(missing_fields_for_sample(sample)) for sample in active_samples),
        "deleted": sum(1 for sample in samples if sample.get("is_deleted")),
        "ambiguous": sum(1 for sample in samples if sample.get("mapping_status") == "ambiguous"),
        "unlinked": sum(1 for sample in samples if sample.get("mapping_status") == "unlinked"),
    }


def sample_annotation_time_seconds(sample: dict[str, Any]) -> int | None:
    time_value = str(sample.get("time") or "").strip()
    if not time_value or not is_valid_time_string(time_value):
        return None
    hours, minutes, seconds = [int(part) for part in time_value.split(":")]
    return hours * 3600 + minutes * 60 + seconds


def sample_clip_sequence(sample: dict[str, Any]) -> int:
    try:
        return int(sample.get("clip_sequence") or 0)
    except (TypeError, ValueError):
        return 0


def export_sample_sort_key(sample: dict[str, Any]) -> tuple[str, int, str, str]:
    return (
        str(sample.get("video_id") or ""),
        sample_clip_sequence(sample),
        str(sample.get("clip_path") or ""),
        str(sample.get("sample_id") or ""),
    )


def export_source_video_number(sample: dict[str, Any]) -> int:
    video_id = str(sample.get("video_id") or "").strip()
    video_number = parse_video_number(video_id)
    if video_number is None:
        raise ValueError(f"Cannot derive export source video number from video_id: {video_id or '<blank>'}")
    if video_number < 0 or video_number > 999:
        raise ValueError(f"Export source video number must fit XXX format: {video_id}")
    return video_number


def build_clip_export_name_map(samples: list[dict[str, Any]], export_scope: str = "public") -> dict[str, str]:
    export_scope = normalize_export_scope(export_scope)
    clip_counts_by_source: defaultdict[int, int] = defaultdict(int)
    sample_names: dict[str, str] = {}
    seen_names: dict[str, str] = {}

    exportable_samples = [
        sample for sample in sorted(samples, key=export_sample_sort_key) if sample_is_exportable(sample, export_scope)
    ]
    for sample in exportable_samples:
        sample_id = str(sample.get("sample_id") or "").strip()
        if not sample_id:
            raise ValueError("Cannot export a sample without sample_id")

        source_video_number = export_source_video_number(sample)
        clip_number = clip_counts_by_source[source_video_number]
        clip_counts_by_source[source_video_number] += 1
        clip_export_name = f"{source_video_number:03d}_{clip_number:03d}.mp4"

        existing_sample_id = seen_names.get(clip_export_name)
        if existing_sample_id and existing_sample_id != sample_id:
            raise ValueError(
                "Duplicate export clip name "
                f"{clip_export_name} for samples {existing_sample_id} and {sample_id}"
            )
        seen_names[clip_export_name] = sample_id
        sample_names[sample_id] = clip_export_name

    return sample_names


def assign_clip_export_names(samples: list[dict[str, Any]]) -> bool:
    clip_name_map = build_clip_export_name_map(samples, export_scope="public")
    changed = False
    for sample in samples:
        sample_id = str(sample.get("sample_id") or "")
        clip_export_name = clip_name_map.get(sample_id, "")
        if sample.get("clip_export_name") != clip_export_name:
            sample["clip_export_name"] = clip_export_name
            changed = True
    return changed


def ensure_sample_export_defaults(samples: list[dict[str, Any]]) -> bool:
    changed = False
    for sample in samples:
        if "is_for_export" not in sample:
            sample["is_for_export"] = True
            changed = True
    return changed


def ensure_sample_clip_sizes(samples: list[dict[str, Any]]) -> bool:
    changed = False
    for sample in samples:
        size_bytes: int | None = None
        try:
            size_bytes = resolve_workspace_clip_path(sample).stat().st_size
        except (ValueError, FileNotFoundError, OSError):
            size_bytes = None
        if sample.get("clip_size_bytes") != size_bytes:
            sample["clip_size_bytes"] = size_bytes
            changed = True
    return changed


def load_samples() -> list[dict[str, Any]]:
    samples = load_json(SAMPLES_PATH)
    changed = ensure_sample_export_defaults(samples)
    if ensure_sample_clip_sizes(samples):
        changed = True
    if assign_clip_export_names(samples):
        changed = True
    if changed:
        atomic_write_json(SAMPLES_PATH, samples)
    return samples


def save_samples(samples: list[dict[str, Any]]) -> None:
    ensure_sample_export_defaults(samples)
    ensure_sample_clip_sizes(samples)
    assign_clip_export_names(samples)
    atomic_write_json(SAMPLES_PATH, samples)


def find_sample(samples: list[dict[str, Any]], sample_id: str) -> dict[str, Any] | None:
    for sample in samples:
        if sample["sample_id"] == sample_id:
            return sample
    return None


def normalize_export_scope(value: Any) -> str:
    scope = str(value or "public").strip().lower()
    if scope not in EXPORT_SCOPES:
        raise ValueError("Export scope must be one of: public, secret, both")
    return scope


def sample_matches_export_scope(sample: dict[str, Any], export_scope: str) -> bool:
    if sample.get("is_deleted"):
        return False
    is_public = bool(sample.get("is_for_export", True))
    if export_scope == "both":
        return True
    if export_scope == "public":
        return is_public
    return not is_public


def sample_is_exportable(sample: dict[str, Any], export_scope: str) -> bool:
    return sample_matches_export_scope(sample, export_scope) and not missing_fields_for_sample(sample)


def build_question_answer_export_row(
    sample: dict[str, Any],
    questions: dict[str, str],
    include_description: bool,
    clip_name: str | None = None,
) -> dict[str, Any]:
    row: dict[str, Any] = {
        "clip_name": str(clip_name or sample.get("clip_export_name") or Path(str(sample.get("clip_path", ""))).name)
    }
    for answer_name, source_field in EXPORT_QUESTION_FIELDS:
        if source_field == "description" and not include_description:
            continue
        question_key = f"question_{answer_name}"
        answer_key = f"answer_{answer_name}"
        if question_key not in questions:
            raise ValueError(f"Missing {question_key} in annotation_questions.json")
        row[question_key] = questions[question_key]
        row[answer_key] = sample.get(source_field, "")
    return row


def export_annotations(
    samples: list[dict[str, Any]],
    include_description: bool = True,
    export_scope: str = "public",
) -> dict[str, Any]:
    export_scope = normalize_export_scope(export_scope)
    questions = load_annotation_questions()
    payload: list[dict[str, Any]] = []
    clip_name_map = build_clip_export_name_map(samples, export_scope=export_scope)
    for sample in sorted(samples, key=export_sample_sort_key):
        if not sample_is_exportable(sample, export_scope):
            continue
        sample_id = str(sample.get("sample_id") or "")
        payload.append(
            build_question_answer_export_row(
                sample,
                questions,
                include_description,
                clip_name=clip_name_map[sample_id],
            )
        )

    atomic_write_json(EXPORT_PATH, payload)
    append_change_log(
        {
            "timestamp": utc_now(),
            "action": "export",
            "sample_count": len(payload),
            "export_path": EXPORT_PATH.relative_to(DATASET_DIR).as_posix(),
            "include_description": include_description,
            "export_scope": export_scope,
        }
    )
    LOGGER.info(
        "Exported annotations: %s samples to %s (include_description=%s, export_scope=%s)",
        len(payload),
        EXPORT_PATH.relative_to(DATASET_DIR).as_posix(),
        include_description,
        export_scope,
    )
    return {
        "path": EXPORT_PATH.relative_to(DATASET_DIR).as_posix(),
        "sample_count": len(payload),
        "include_description": include_description,
        "export_scope": export_scope,
    }


def resolve_workspace_clip_path(sample: dict[str, Any]) -> Path:
    clip_path = (DATASET_DIR / str(sample.get("clip_path", ""))).resolve()
    allowed_roots = [
        (DATASET_DIR / "clips").resolve(),
        GENERATED_CLIPS_DIR.resolve(),
    ]
    for root in allowed_roots:
        try:
            clip_path.relative_to(root)
            return clip_path
        except ValueError:
            continue
    raise ValueError("Clip path is invalid for export")


def next_revised_clips_dir() -> Path:
    pattern = re.compile(r"^clips_revised_v(?P<version>\d{3})$")
    versions: list[int] = []
    EXPORT_DIR.mkdir(parents=True, exist_ok=True)
    for path in EXPORT_DIR.iterdir():
        if not path.is_dir():
            continue
        match = pattern.match(path.name)
        if match:
            versions.append(int(match.group("version")))
    next_version = max(versions, default=0) + 1
    return EXPORT_DIR / f"clips_revised_v{next_version:03d}"


def export_clips(samples: list[dict[str, Any]], export_scope: str = "public") -> dict[str, Any]:
    export_scope = normalize_export_scope(export_scope)
    active_samples = [sample for sample in samples if sample_is_exportable(sample, export_scope)]
    clip_name_map = build_clip_export_name_map(samples, export_scope=export_scope)
    target_root = next_revised_clips_dir()
    target_root.mkdir(parents=True, exist_ok=True)
    copied_count = 0

    for sample in sorted(active_samples, key=export_sample_sort_key):
        source_path = resolve_workspace_clip_path(sample)
        sample_id = str(sample.get("sample_id") or "")
        export_name = clip_name_map[sample_id]
        target_path = target_root / export_name
        if target_path.exists():
            raise ValueError(f"Duplicate export target already exists: {export_name}")
        shutil.copy2(source_path, target_path)
        copied_count += 1

    append_change_log(
        {
            "timestamp": utc_now(),
            "action": "export_clips",
            "sample_count": copied_count,
            "export_path": target_root.relative_to(DATASET_DIR).as_posix(),
            "folders": [target_root.name],
            "export_scope": export_scope,
        }
    )
    LOGGER.info(
        "Exported clips: %s samples to %s (export_scope=%s)",
        copied_count,
        target_root.relative_to(DATASET_DIR).as_posix(),
        export_scope,
    )
    return {
        "path": target_root.relative_to(DATASET_DIR).as_posix(),
        "sample_count": copied_count,
        "folder_count": 1 if copied_count else 0,
        "export_scope": export_scope,
    }


def update_sample_export_state(sample_id: str, is_for_export: bool) -> dict[str, Any]:
    samples = load_samples()
    sample = find_sample(samples, sample_id)
    if sample is None:
        raise ValueError("Sample not found")
    old_value = bool(sample.get("is_for_export", True))
    sample["is_for_export"] = bool(is_for_export)
    if sample["is_for_export"] != old_value:
        save_samples(samples)
        append_change_log(
            {
                "timestamp": utc_now(),
                "action": "update_export_state",
                "sample_id": sample_id,
                "changes": {
                    "is_for_export": {
                        "from": old_value,
                        "to": sample["is_for_export"],
                    }
                },
            }
        )
    return {"sample": sample, "summary": build_summary(samples)}


def sync_new_entries(schema: dict[str, Any]) -> dict[str, Any]:
    samples = load_samples()
    rules = load_rules()
    existing_sample_ids = {sample["sample_id"] for sample in samples}
    existing_logical_ids = {sample["logical_id"] for sample in samples}
    annotations_by_video = load_annotation_rows()
    clip_records, logical_counts = scan_clip_records()
    source_notes = copy.deepcopy(schema["field_notes"])

    added_samples: list[dict[str, Any]] = []
    missing_clips = 0

    for video_id, violations in annotations_by_video.items():
        for index, source_row in enumerate(violations, start=1):
            logical_id = f"{video_id}_v{index:03d}"
            if logical_id in existing_logical_ids:
                continue

            matching_records = [record for record in clip_records if record["logical_id"] == logical_id]
            if not matching_records:
                missing_clips += 1
                continue

            for record in matching_records:
                if record["sample_id"] in existing_sample_ids:
                    continue
                sample = build_sample_record(record, copy.deepcopy(source_row), logical_counts, source_notes, rules)
                added_samples.append(sample)
                existing_sample_ids.add(record["sample_id"])
            existing_logical_ids.add(logical_id)

    for record in clip_records:
        if record["sample_id"] in existing_sample_ids:
            continue
        sample = build_sample_record(record, None, logical_counts, source_notes, rules)
        added_samples.append(sample)
        existing_sample_ids.add(record["sample_id"])
        existing_logical_ids.add(record["logical_id"])

    if added_samples:
        samples.extend(added_samples)
        samples.sort(key=lambda item: (item["video_id"], item["clip_sequence"], item["clip_path"]))
        save_samples(samples)

    append_change_log(
        {
            "timestamp": utc_now(),
            "action": "sync_new_entries",
            "added_sample_count": len(added_samples),
            "missing_clip_count": missing_clips,
            "logical_ids_added": [sample["logical_id"] for sample in added_samples],
        }
    )
    LOGGER.info(
        "Synced workspace entries: added=%s missing_clips=%s",
        len(added_samples),
        missing_clips,
    )

    return {
        "added_count": len(added_samples),
        "missing_clip_count": missing_clips,
        "added_samples": added_samples,
        "summary": build_summary(samples),
        "samples": samples,
    }


def parse_trim_time(raw_value: Any, field_name: str) -> float:
    try:
        value = float(raw_value)
    except (TypeError, ValueError):
        raise ValueError(f"{field_name} must be a number") from None
    if value < 0:
        raise ValueError(f"{field_name} must be zero or greater")
    return round(value, 3)


def build_generated_clip_relative_path(sample: dict[str, Any], mode: str) -> str:
    clip_folder = sanitize_path_segment(sample.get("violation_type") or sample.get("clip_folder") or "generated")
    stem = sanitize_path_segment(sample["video_id"])
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%f")
    filename = f"{stem}_{mode}_{timestamp}.mp4"
    return workspace_relative(GENERATED_CLIPS_DIR / clip_folder / filename)


def run_ffmpeg_trim(source_video_path: Path, output_path: Path, start_time: float, end_time: float) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    duration = round(end_time - start_time, 3)
    command = [
        "ffmpeg",
        "-y",
        "-ss",
        f"{start_time:.3f}",
        "-i",
        str(source_video_path),
        "-t",
        f"{duration:.3f}",
        "-c:v",
        "libx264",
        "-c:a",
        "aac",
        str(output_path),
    ]
    subprocess.run(command, check=True, capture_output=True, text=True)


def ensure_source_video_copy(source_video_key: str) -> str:
    source_video_record = resolve_source_video_record(source_video_key)
    source_video_path = (DATASET_DIR / source_video_record["source_video_path"]).resolve()
    video_root = (DATASET_DIR / "videos").resolve()
    try:
        source_video_path.relative_to(video_root)
    except ValueError as exc:
        raise ValueError("Source video path is invalid") from exc
    if not source_video_path.exists():
        raise ValueError("Source video file does not exist")

    SOURCE_VIDEO_COPIES_DIR.mkdir(parents=True, exist_ok=True)
    output_path = SOURCE_VIDEO_COPIES_DIR / f"{sanitize_path_segment(source_video_record['source_video_key'])}.mp4"
    source_mtime = source_video_path.stat().st_mtime
    output_is_fresh = output_path.exists() and output_path.stat().st_mtime >= source_mtime
    if not output_is_fresh:
        command = [
            "ffmpeg",
            "-y",
            "-i",
            str(source_video_path),
            "-c:v",
            "libx264",
            "-preset",
            "veryfast",
            "-movflags",
            "+faststart",
            "-pix_fmt",
            "yuv420p",
            "-c:a",
            "aac",
            str(output_path),
        ]
        subprocess.run(command, check=True, capture_output=True, text=True)
    return workspace_relative(output_path)


def next_workspace_clip_sequence(samples: list[dict[str, Any]], video_id: str) -> int:
    sequences = [int(sample.get("clip_sequence", 0)) for sample in samples if sample.get("video_id") == video_id]
    return max(sequences, default=0) + 1


def clone_sample_for_generated_clip(
    samples: list[dict[str, Any]],
    base_sample: dict[str, Any],
    generated_clip_relative_path: str,
    start_time: float,
    end_time: float,
) -> dict[str, Any]:
    next_sequence = next_workspace_clip_sequence(samples, base_sample["video_id"])
    clip_folder = base_sample.get("violation_type") or base_sample.get("clip_folder") or "generated"
    file_path = Path(generated_clip_relative_path)
    sample = copy.deepcopy(base_sample)
    sample["sample_id"] = build_sample_id(file_path)
    sample["clip_path"] = generated_clip_relative_path
    sample["original_clip_path"] = base_sample.get("original_clip_path") or base_sample.get("clip_path", "")
    sample["clip_variant"] = "generated"
    sample["clip_folder"] = clip_folder
    sample["clip_sequence"] = next_sequence
    sample["logical_id"] = f"{base_sample['video_id']}_workspace_{next_sequence:03d}"
    sample["mapping_status"] = "workspace"
    sample["is_deleted"] = False
    sample["start_time"] = start_time
    sample["end_time"] = end_time
    sample["clip_source_start_time"] = start_time
    sample["clip_source_end_time"] = end_time
    sample["source_video_path"] = source_video_relative_path(base_sample["video_id"])
    sample["derived_from_sample_id"] = base_sample["sample_id"]
    sample["original_annotation"] = copy.deepcopy(base_sample.get("original_annotation"))
    sample["candidate_original"] = copy.deepcopy(base_sample.get("candidate_original"))
    normalize_sample_metadata(sample)
    return sample


def create_sample_from_source_video(
    schema: dict[str, Any],
    source_video_key: str,
    violation_type: str,
    start_time: float,
    end_time: float,
) -> dict[str, Any]:
    if end_time <= start_time:
        raise ValueError("End time must be greater than start time")

    source_video_record = resolve_source_video_record(source_video_key)
    samples = load_samples()
    rules = load_rules()
    normalized_violation_type = normalize_violation_type(violation_type)
    if not normalized_violation_type:
        raise ValueError("Violation type is required")

    source_video_path = (DATASET_DIR / source_video_record["source_video_path"]).resolve()
    video_root = (DATASET_DIR / "videos").resolve()
    try:
        source_video_path.relative_to(video_root)
    except ValueError as exc:
        raise ValueError("Source video path is invalid") from exc

    generated_base = {
        "video_id": source_video_record["video_id"],
        "violation_type": normalized_violation_type,
        "clip_folder": normalized_violation_type,
    }
    generated_relative = build_generated_clip_relative_path(generated_base, "source_extract")
    run_ffmpeg_trim(source_video_path, (DATASET_DIR / generated_relative).resolve(), start_time, end_time)

    next_sequence = next_workspace_clip_sequence(samples, source_video_record["video_id"])
    file_path = Path(generated_relative)
    record = {
        "video_id": source_video_record["video_id"],
        "clip_folder": normalized_violation_type,
        "violation_type": normalized_violation_type,
    }
    editable_values = {field: default_value_for_field(field, record, rules) for field in EDITABLE_FIELDS}
    editable_values["violation_type"] = normalized_violation_type
    source_notes = copy.deepcopy(schema.get("field_notes", {}))
    sample = {
        "sample_id": build_sample_id(file_path),
        "clip_path": generated_relative,
        "video_id": source_video_record["video_id"],
        "clip_sequence": next_sequence,
        "clip_folder": normalized_violation_type,
        "logical_id": f"{source_video_record['video_id']}_workspace_{next_sequence:03d}",
        **editable_values,
        "mapping_status": "workspace",
        "is_deleted": False,
        "is_for_export": default_export_state_for_record(record, rules),
        "start_time": start_time,
        "end_time": end_time,
        "original_annotation": None,
        "candidate_original": None,
        "source_notes": source_notes,
        "source_video_path": source_video_record["source_video_path"],
        "source_video_browser_path": source_video_browser_relative_path(source_video_record["source_video_key"]),
        "original_clip_path": "",
        "clip_variant": "generated",
        "clip_source_start_time": start_time,
        "clip_source_end_time": end_time,
    }
    normalize_sample_metadata(sample)
    samples.append(sample)
    samples.sort(key=lambda item: (item["video_id"], item["clip_sequence"], item["clip_path"]))
    save_samples(samples)
    append_change_log(
        {
            "timestamp": utc_now(),
            "action": "create_source_video_sample",
            "source_video_key": source_video_key,
            "sample_id": sample["sample_id"],
            "new_clip_path": generated_relative,
            "violation_type": normalized_violation_type,
            "start_time": start_time,
            "end_time": end_time,
        }
    )
    LOGGER.info(
        "Created sample %s from source video %s at %.3f-%.3f",
        sample["sample_id"],
        source_video_key,
        start_time,
        end_time,
    )
    return {"sample": sample, "summary": build_summary(samples), "samples": samples}


def update_sample_with_generated_clip(
    sample: dict[str, Any],
    generated_clip_relative_path: str,
    start_time: float,
    end_time: float,
    source_video_relative: str,
) -> None:
    previous_clip_path = sample.get("clip_path", "")
    sample["original_clip_path"] = sample.get("original_clip_path") or previous_clip_path
    sample["clip_path"] = generated_clip_relative_path
    sample["clip_variant"] = "generated"
    sample["clip_folder"] = sample.get("violation_type") or sample.get("clip_folder") or "generated"
    sample["start_time"] = start_time
    sample["end_time"] = end_time
    sample["clip_source_start_time"] = start_time
    sample["clip_source_end_time"] = end_time
    sample["source_video_path"] = source_video_relative
    normalize_sample_metadata(sample)


def generate_trimmed_clip(sample_id: str, start_time: float, end_time: float, mode: str) -> dict[str, Any]:
    if mode not in {"replace", "duplicate"}:
        raise ValueError("mode must be 'replace' or 'duplicate'")

    samples = load_samples()
    sample = find_sample(samples, sample_id)
    if sample is None:
        raise ValueError("Sample not found")

    source_video_relative = sample.get("source_video_path") or source_video_relative_path(sample["video_id"])
    source_video_path = (DATASET_DIR / source_video_relative).resolve()
    video_root = (DATASET_DIR / "videos").resolve()
    try:
        source_video_path.relative_to(video_root)
    except ValueError as exc:
        raise ValueError("Source video path is invalid") from exc
    if not source_video_path.exists():
        raise ValueError("Source video file does not exist")
    if end_time <= start_time:
        raise ValueError("End time must be greater than start time")

    generated_relative = build_generated_clip_relative_path(sample, mode)
    generated_path = (DATASET_DIR / generated_relative).resolve()
    run_ffmpeg_trim(source_video_path, generated_path, start_time, end_time)

    if mode == "replace":
        previous_clip_path = sample.get("clip_path", "")
        update_sample_with_generated_clip(sample, generated_relative, start_time, end_time, source_video_relative)
        save_samples(samples)
        append_change_log(
            {
                "timestamp": utc_now(),
                "action": "replace_clip",
                "sample_id": sample_id,
                "previous_clip_path": previous_clip_path,
                "new_clip_path": generated_relative,
                "start_time": start_time,
                "end_time": end_time,
            }
        )
        return {
            "mode": mode,
            "sample": sample,
            "generated_clip_path": generated_relative,
            "summary": build_summary(samples),
            "samples": samples,
        }

    new_sample = clone_sample_for_generated_clip(samples, sample, generated_relative, start_time, end_time)
    samples.append(new_sample)
    samples.sort(key=lambda item: (item["video_id"], item["clip_sequence"], item["clip_path"]))
    save_samples(samples)
    append_change_log(
        {
            "timestamp": utc_now(),
            "action": "create_generated_sample",
            "base_sample_id": sample_id,
            "new_sample_id": new_sample["sample_id"],
            "new_clip_path": generated_relative,
            "start_time": start_time,
            "end_time": end_time,
        }
    )
    return {
        "mode": mode,
        "sample": new_sample,
        "generated_clip_path": generated_relative,
        "summary": build_summary(samples),
        "samples": samples,
    }


def split_clip_sample(sample_id: str, start_time: float, split_time: float, end_time: float) -> dict[str, Any]:
    samples = load_samples()
    sample = find_sample(samples, sample_id)
    if sample is None:
        raise ValueError("Sample not found")

    source_video_relative = sample.get("source_video_path") or source_video_relative_path(sample["video_id"])
    source_video_path = (DATASET_DIR / source_video_relative).resolve()
    video_root = (DATASET_DIR / "videos").resolve()
    try:
        source_video_path.relative_to(video_root)
    except ValueError as exc:
        raise ValueError("Source video path is invalid") from exc
    if not source_video_path.exists():
        raise ValueError("Source video file does not exist")
    if split_time <= start_time or split_time >= end_time:
        raise ValueError("Split point must be inside the clip bounds")

    first_relative = build_generated_clip_relative_path(sample, "split_a")
    second_relative = build_generated_clip_relative_path(sample, "split_b")
    run_ffmpeg_trim(source_video_path, (DATASET_DIR / first_relative).resolve(), start_time, split_time)
    run_ffmpeg_trim(source_video_path, (DATASET_DIR / second_relative).resolve(), split_time, end_time)

    previous_clip_path = sample.get("clip_path", "")
    update_sample_with_generated_clip(sample, first_relative, start_time, split_time, source_video_relative)
    new_sample = clone_sample_for_generated_clip(samples, sample, second_relative, split_time, end_time)
    new_sample["original_clip_path"] = sample.get("original_clip_path") or previous_clip_path
    samples.append(new_sample)
    samples.sort(key=lambda item: (item["video_id"], item["clip_sequence"], item["clip_path"]))
    save_samples(samples)
    append_change_log(
        {
            "timestamp": utc_now(),
            "action": "split_clip",
            "sample_id": sample_id,
            "first_clip_path": first_relative,
            "second_sample_id": new_sample["sample_id"],
            "second_clip_path": second_relative,
            "start_time": start_time,
            "split_time": split_time,
            "end_time": end_time,
        }
    )
    LOGGER.info(
        "Split clip sample %s into %s and %s at %.3f",
        sample_id,
        first_relative,
        second_relative,
        split_time,
    )
    return {
        "mode": "split",
        "sample": sample,
        "new_sample": new_sample,
        "summary": build_summary(samples),
        "samples": samples,
    }


def split_clip_file_sample(sample_id: str, split_time: float, clip_duration: float) -> dict[str, Any]:
    samples = load_samples()
    sample = find_sample(samples, sample_id)
    if sample is None:
        raise ValueError("Sample not found")
    if split_time <= 0 or split_time >= clip_duration:
        raise ValueError("Split point must be inside the clip duration")

    clip_path = resolve_workspace_clip_path(sample)
    first_relative = build_generated_clip_relative_path(sample, "clip_split_a")
    second_relative = build_generated_clip_relative_path(sample, "clip_split_b")
    run_ffmpeg_trim(clip_path, (DATASET_DIR / first_relative).resolve(), 0.0, split_time)
    run_ffmpeg_trim(clip_path, (DATASET_DIR / second_relative).resolve(), split_time, clip_duration)

    base_start = sample.get("clip_source_start_time")
    if base_start is None:
        base_start = sample.get("start_time")
    base_start = 0.0 if base_start is None else float(base_start)

    first_start = base_start
    first_end = round(base_start + split_time, 3)
    second_start = first_end
    second_end = round(base_start + clip_duration, 3)

    previous_clip_path = sample.get("clip_path", "")
    source_video_relative = sample.get("source_video_path") or source_video_relative_path(sample["video_id"])
    update_sample_with_generated_clip(sample, first_relative, first_start, first_end, source_video_relative)
    new_sample = clone_sample_for_generated_clip(samples, sample, second_relative, second_start, second_end)
    new_sample["original_clip_path"] = sample.get("original_clip_path") or previous_clip_path
    samples.append(new_sample)
    samples.sort(key=lambda item: (item["video_id"], item["clip_sequence"], item["clip_path"]))
    save_samples(samples)
    append_change_log(
        {
            "timestamp": utc_now(),
            "action": "split_clip_file",
            "sample_id": sample_id,
            "first_clip_path": first_relative,
            "second_sample_id": new_sample["sample_id"],
            "second_clip_path": second_relative,
            "split_time": split_time,
            "clip_duration": clip_duration,
        }
    )
    LOGGER.info(
        "Split clip file sample %s into %s and %s at %.3f of %.3f seconds",
        sample_id,
        first_relative,
        second_relative,
        split_time,
        clip_duration,
    )
    return {
        "mode": "clip_split",
        "sample": sample,
        "new_sample": new_sample,
        "summary": build_summary(samples),
        "samples": samples,
    }


def json_response(handler: BaseHTTPRequestHandler, payload: Any, status: HTTPStatus = HTTPStatus.OK) -> None:
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


def error_response(handler: BaseHTTPRequestHandler, status: HTTPStatus, message: str) -> None:
    LOGGER.warning("%s %s -> %s %s", handler.command, handler.path, status.value, message)
    json_response(handler, {"error": message}, status)


def parse_range_header(range_header: str, file_size: int) -> tuple[int, int] | None:
    match = re.match(r"^bytes=(\d*)-(\d*)$", range_header.strip())
    if not match:
        return None

    start_raw, end_raw = match.groups()
    if not start_raw and not end_raw:
        return None

    if start_raw:
        start = int(start_raw)
        end = int(end_raw) if end_raw else file_size - 1
    else:
        suffix_length = int(end_raw)
        if suffix_length <= 0:
            return None
        start = max(file_size - suffix_length, 0)
        end = file_size - 1

    if start < 0 or end < start or start >= file_size:
        return None

    return start, min(end, file_size - 1)


def serve_file(handler: BaseHTTPRequestHandler, path: Path) -> None:
    if not path.exists() or not path.is_file():
        error_response(handler, HTTPStatus.NOT_FOUND, "File not found")
        return

    mime_type, _ = mimetypes.guess_type(path.name)
    file_size = path.stat().st_size
    range_header = handler.headers.get("Range")
    byte_range = parse_range_header(range_header, file_size) if range_header else None

    status = HTTPStatus.PARTIAL_CONTENT if byte_range else HTTPStatus.OK
    start, end = byte_range if byte_range else (0, file_size - 1)
    content_length = end - start + 1

    handler.send_response(status)
    handler.send_header("Content-Type", mime_type or "application/octet-stream")
    handler.send_header("Accept-Ranges", "bytes")
    handler.send_header("Content-Length", str(content_length))
    if byte_range:
        handler.send_header("Content-Range", f"bytes {start}-{end}/{file_size}")
    handler.end_headers()

    try:
        with path.open("rb") as handle:
            handle.seek(start)
            remaining = content_length
            while remaining > 0:
                chunk = handle.read(min(64 * 1024, remaining))
                if not chunk:
                    break
                handler.wfile.write(chunk)
                remaining -= len(chunk)
    except (BrokenPipeError, ConnectionResetError):
        return


class AnnotationRequestHandler(BaseHTTPRequestHandler):
    schema: dict[str, Any] = {}

    def log_message(self, format: str, *args: Any) -> None:
        parsed = urlparse(getattr(self, "path", ""))
        if parsed.path.startswith("/media/") or parsed.path.startswith("/static/"):
            return
        LOGGER.info("%s %s", self.command, format % args)

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path == "/api/schema":
            json_response(self, self.schema)
            return
        if parsed.path == "/api/rules":
            json_response(self, build_rules_payload(self.schema, load_rules()))
            return
        if parsed.path == "/api/source-video-library":
            json_response(self, {"videos": discover_source_videos()})
            return
        if parsed.path == "/api/source-videos/grid-settings":
            json_response(self, {"settings": load_source_video_grid_settings()})
            return
        if parsed.path == "/api/source-videos/footage-start-times":
            json_response(self, {"start_times": load_source_video_footage_start_times()})
            return
        if parsed.path == "/api/prompts":
            try:
                json_response(self, load_prompt_templates())
            except FileNotFoundError as exc:
                error_response(self, HTTPStatus.INTERNAL_SERVER_ERROR, f"Prompt template missing: {exc}")
            return
        if parsed.path == "/api/samples":
            samples = load_samples()
            json_response(self, {"samples": samples, "summary": build_summary(samples)})
            return
        browser_source_match = re.match(r"^/api/source-videos/(?P<source_video_key>.+)\.mp4$", parsed.path)
        if browser_source_match:
            try:
                browser_relative = ensure_source_video_copy(unquote(browser_source_match.group("source_video_key")))
            except subprocess.CalledProcessError as exc:
                error_response(self, HTTPStatus.INTERNAL_SERVER_ERROR, exc.stderr.strip() or "Source video conversion failed")
                return
            except ValueError as exc:
                error_response(self, HTTPStatus.BAD_REQUEST, str(exc))
                return
            serve_file(self, DATASET_DIR / browser_relative)
            return
        if parsed.path.startswith("/media/"):
            media_path = self.resolve_media_path(parsed.path)
            if media_path is None:
                error_response(self, HTTPStatus.NOT_FOUND, "Media path is invalid")
                return
            serve_file(self, media_path)
            return
        if parsed.path == "/" or parsed.path == "/index.html":
            serve_file(self, STATIC_DIR / "index.html")
            return
        if parsed.path.startswith("/static/"):
            relative = parsed.path.removeprefix("/static/")
            serve_file(self, STATIC_DIR / relative)
            return
        error_response(self, HTTPStatus.NOT_FOUND, "Route not found")

    def do_PATCH(self) -> None:
        parsed = urlparse(self.path)
        rule_prefix = "/api/rules/"
        if parsed.path.startswith(rule_prefix):
            rule_id = unquote(parsed.path.removeprefix(rule_prefix))
            payload = self.read_json_body()
            if payload is None:
                return
            try:
                result = update_rule(
                    self.schema,
                    rule_id,
                    payload.get("rule", {}),
                    bool(payload.get("apply_retroactive", False)),
                )
            except ValueError as exc:
                error_response(self, HTTPStatus.BAD_REQUEST, str(exc))
                return
            json_response(self, result, HTTPStatus.OK)
            return

        prefix = "/api/samples/"
        if not parsed.path.startswith(prefix):
            error_response(self, HTTPStatus.NOT_FOUND, "Route not found")
            return

        sample_id = unquote(parsed.path.removeprefix(prefix))
        payload = self.read_json_body()
        if payload is None:
            return

        fields = payload.get("fields")
        if not isinstance(fields, dict):
            error_response(self, HTTPStatus.BAD_REQUEST, "Expected a JSON object under 'fields'")
            return

        invalid_fields = [field for field in fields if field not in PATCHABLE_FIELDS]
        if invalid_fields:
            error_response(self, HTTPStatus.BAD_REQUEST, f"Unsupported fields: {', '.join(invalid_fields)}")
            return

        samples = load_samples()
        sample = find_sample(samples, sample_id)
        if sample is None:
            error_response(self, HTTPStatus.NOT_FOUND, "Sample not found")
            return

        changes: dict[str, dict[str, str]] = {}
        for field, raw_value in fields.items():
            new_value = "" if raw_value is None else str(raw_value)
            old_value = sample.get(field, "")
            if field == "date" and new_value and not is_valid_date_string(new_value):
                error_response(self, HTTPStatus.BAD_REQUEST, "Date must use YYYY-MM-DD format")
                return
            if field == "time" and new_value and not is_valid_time_string(new_value):
                error_response(self, HTTPStatus.BAD_REQUEST, "Time must use HH:MM:SS format")
                return
            if field == "light" and new_value and new_value not in ALLOWED_LIGHT_VALUES:
                error_response(self, HTTPStatus.BAD_REQUEST, "Light must be either 'daylight' or 'night'")
                return
            if new_value == old_value:
                continue
            sample[field] = new_value
            changes[field] = {"from": old_value, "to": new_value}

        if changes:
            save_samples(samples)
            append_change_log(
                {
                    "timestamp": utc_now(),
                    "action": "update",
                    "sample_id": sample_id,
                    "changes": changes,
                }
            )

        json_response(self, {"sample": sample, "summary": build_summary(samples)})

    def do_POST(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path == "/api/rules":
            payload = self.read_json_body()
            if payload is None:
                return
            try:
                result = create_rule(
                    self.schema,
                    payload.get("rule", {}),
                    bool(payload.get("apply_retroactive", False)),
                )
            except ValueError as exc:
                error_response(self, HTTPStatus.BAD_REQUEST, str(exc))
                return
            json_response(self, result, HTTPStatus.CREATED)
            return
        rule_delete_match = re.match(r"^/api/rules/(?P<rule_id>.+)/delete$", parsed.path)
        if rule_delete_match:
            payload = self.read_json_body(allow_empty=True)
            try:
                result = delete_rule(
                    self.schema,
                    unquote(rule_delete_match.group("rule_id")),
                    bool(payload.get("apply_retroactive", False)) if isinstance(payload, dict) else False,
                )
            except ValueError as exc:
                error_response(self, HTTPStatus.BAD_REQUEST, str(exc))
                return
            json_response(self, result, HTTPStatus.OK)
            return
        if parsed.path == "/api/export":
            payload = self.read_json_body(allow_empty=True)
            include_description = True
            export_scope = "public"
            if isinstance(payload, dict) and "include_description" in payload:
                include_description = bool(payload["include_description"])
            if isinstance(payload, dict) and "export_scope" in payload:
                export_scope = str(payload["export_scope"])
            try:
                result = export_annotations(
                    load_samples(),
                    include_description=include_description,
                    export_scope=export_scope,
                )
            except ValueError as exc:
                error_response(self, HTTPStatus.BAD_REQUEST, str(exc))
                return
            json_response(self, result, HTTPStatus.CREATED)
            return
        if parsed.path == "/api/export-clips":
            payload = self.read_json_body(allow_empty=True)
            export_scope = "public"
            if isinstance(payload, dict) and "export_scope" in payload:
                export_scope = str(payload["export_scope"])
            try:
                result = export_clips(load_samples(), export_scope=export_scope)
            except ValueError as exc:
                error_response(self, HTTPStatus.BAD_REQUEST, str(exc))
                return
            json_response(self, result, HTTPStatus.CREATED)
            return
        if parsed.path == "/api/sync":
            _ = self.read_json_body(allow_empty=True)
            result = sync_new_entries(self.schema)
            json_response(self, result, HTTPStatus.OK)
            return
        if parsed.path == "/api/source-videos/create-sample":
            payload = self.read_json_body()
            if payload is None:
                return
            try:
                source_video_key = str(payload.get("source_video_key", "")).strip()
                violation_type = str(payload.get("violation_type", "")).strip()
                start_time = parse_trim_time(payload.get("start_time"), "start_time")
                end_time = parse_trim_time(payload.get("end_time"), "end_time")
                result = create_sample_from_source_video(
                    self.schema,
                    source_video_key,
                    violation_type,
                    start_time,
                    end_time,
                )
            except subprocess.CalledProcessError as exc:
                error_response(self, HTTPStatus.INTERNAL_SERVER_ERROR, exc.stderr.strip() or "Clip generation failed")
                return
            except ValueError as exc:
                error_response(self, HTTPStatus.BAD_REQUEST, str(exc))
                return
            json_response(self, result, HTTPStatus.CREATED)
            return
        if parsed.path == "/api/source-videos/position":
            payload = self.read_json_body()
            if payload is None:
                return
            source_video_key = str(payload.get("source_video_key", "")).strip()
            if not source_video_key:
                error_response(self, HTTPStatus.BAD_REQUEST, "source_video_key is required")
                return
            try:
                canonical_source_video_key = canonicalize_source_video_id(source_video_key)
                resolve_source_video_record(canonical_source_video_key)
                position_seconds = parse_trim_time(payload.get("position_seconds"), "position_seconds")
                positions = update_source_video_position(
                    canonical_source_video_key,
                    position_seconds,
                    allow_zero_reset=bool(payload.get("allow_zero_reset", False)),
                )
            except ValueError as exc:
                error_response(self, HTTPStatus.BAD_REQUEST, str(exc))
                return
            json_response(
                self,
                {
                    "source_video_key": canonical_source_video_key,
                    "position_seconds": positions[canonical_source_video_key],
                },
                HTTPStatus.OK,
            )
            return
        if parsed.path == "/api/source-videos/grid-settings":
            payload = self.read_json_body()
            if payload is None:
                return
            source_video_key = str(payload.get("source_video_key", "")).strip()
            if not source_video_key:
                error_response(self, HTTPStatus.BAD_REQUEST, "source_video_key is required")
                return
            try:
                canonical_source_video_key = canonicalize_source_video_id(source_video_key)
                settings = update_source_video_grid_settings(canonical_source_video_key, payload.get("settings", {}))
            except ValueError as exc:
                error_response(self, HTTPStatus.BAD_REQUEST, str(exc))
                return
            json_response(
                self,
                {
                    "source_video_key": canonical_source_video_key,
                    "settings": settings,
                },
                HTTPStatus.OK,
            )
            return
        if parsed.path == "/api/source-videos/footage-start-time":
            payload = self.read_json_body()
            if payload is None:
                return
            source_video_key = str(payload.get("source_video_key", "")).strip()
            if not source_video_key:
                error_response(self, HTTPStatus.BAD_REQUEST, "source_video_key is required")
                return
            try:
                canonical_source_video_key = canonicalize_source_video_id(source_video_key)
                start_times = update_source_video_footage_start_time(
                    canonical_source_video_key,
                    payload.get("footage_start_time", ""),
                )
            except ValueError as exc:
                error_response(self, HTTPStatus.BAD_REQUEST, str(exc))
                return
            json_response(
                self,
                {
                    "source_video_key": canonical_source_video_key,
                    "start_times": start_times,
                },
                HTTPStatus.OK,
            )
            return
        if parsed.path == "/api/description-batch":
            payload = self.read_json_body()
            if payload is None:
                return
            try:
                result = generate_description_batch(payload)
            except ValueError as exc:
                error_response(self, HTTPStatus.BAD_REQUEST, str(exc))
                return
            except FileNotFoundError as exc:
                error_response(self, HTTPStatus.INTERNAL_SERVER_ERROR, f"Prompt template missing: {exc}")
                return
            json_response(self, result, HTTPStatus.OK)
            return
        description_draft_match = re.match(r"^/api/samples/(?P<sample_id>.+)/description-draft$", parsed.path)
        if description_draft_match:
            payload = self.read_json_body()
            if payload is None:
                return
            try:
                result = generate_description_draft(
                    unquote(description_draft_match.group("sample_id")),
                    payload,
                )
            except subprocess.CalledProcessError as exc:
                error_response(
                    self,
                    HTTPStatus.INTERNAL_SERVER_ERROR,
                    exc.stderr.strip() or "Keyframe extraction failed",
                )
                return
            except LocalModelError as exc:
                error_response(self, HTTPStatus.BAD_GATEWAY, str(exc))
                return
            except ValueError as exc:
                error_response(self, HTTPStatus.BAD_REQUEST, str(exc))
                return
            json_response(self, result, HTTPStatus.OK)
            return
        export_state_match = re.match(r"^/api/samples/(?P<sample_id>.+)/export-state$", parsed.path)
        if export_state_match:
            payload = self.read_json_body()
            if payload is None:
                return
            if "is_for_export" not in payload:
                error_response(self, HTTPStatus.BAD_REQUEST, "Expected boolean 'is_for_export'")
                return
            try:
                result = update_sample_export_state(
                    unquote(export_state_match.group("sample_id")),
                    bool(payload["is_for_export"]),
                )
            except ValueError as exc:
                error_response(self, HTTPStatus.BAD_REQUEST, str(exc))
                return
            json_response(self, result, HTTPStatus.OK)
            return
        trim_match = re.match(r"^/api/samples/(?P<sample_id>.+)/trim$", parsed.path)
        if trim_match:
            payload = self.read_json_body()
            if payload is None:
                return
            try:
                start_time = parse_trim_time(payload.get("start_time"), "start_time")
                end_time = parse_trim_time(payload.get("end_time"), "end_time")
                mode = str(payload.get("mode", ""))
                result = generate_trimmed_clip(unquote(trim_match.group("sample_id")), start_time, end_time, mode)
            except subprocess.CalledProcessError as exc:
                error_response(self, HTTPStatus.INTERNAL_SERVER_ERROR, exc.stderr.strip() or "Clip generation failed")
                return
            except ValueError as exc:
                error_response(self, HTTPStatus.BAD_REQUEST, str(exc))
                return
            json_response(self, result, HTTPStatus.CREATED)
            return
        split_match = re.match(r"^/api/samples/(?P<sample_id>.+)/split$", parsed.path)
        if split_match:
            payload = self.read_json_body()
            if payload is None:
                return
            try:
                start_time = parse_trim_time(payload.get("start_time"), "start_time")
                split_time = parse_trim_time(payload.get("split_time"), "split_time")
                end_time = parse_trim_time(payload.get("end_time"), "end_time")
                result = split_clip_sample(unquote(split_match.group("sample_id")), start_time, split_time, end_time)
            except subprocess.CalledProcessError as exc:
                error_response(self, HTTPStatus.INTERNAL_SERVER_ERROR, exc.stderr.strip() or "Clip split failed")
                return
            except ValueError as exc:
                error_response(self, HTTPStatus.BAD_REQUEST, str(exc))
                return
            json_response(self, result, HTTPStatus.CREATED)
            return
        clip_split_match = re.match(r"^/api/samples/(?P<sample_id>.+)/split-from-clip$", parsed.path)
        if clip_split_match:
            payload = self.read_json_body()
            if payload is None:
                return
            try:
                split_time = parse_trim_time(payload.get("split_time"), "split_time")
                clip_duration = parse_trim_time(payload.get("clip_duration"), "clip_duration")
                result = split_clip_file_sample(unquote(clip_split_match.group("sample_id")), split_time, clip_duration)
            except subprocess.CalledProcessError as exc:
                error_response(self, HTTPStatus.INTERNAL_SERVER_ERROR, exc.stderr.strip() or "Clip split failed")
                return
            except ValueError as exc:
                error_response(self, HTTPStatus.BAD_REQUEST, str(exc))
                return
            json_response(self, result, HTTPStatus.CREATED)
            return

        match = re.match(r"^/api/samples/(?P<sample_id>.+)/(?P<action>delete|restore)$", parsed.path)
        if not match:
            error_response(self, HTTPStatus.NOT_FOUND, "Route not found")
            return

        _ = self.read_json_body(allow_empty=True)
        sample_id = unquote(match.group("sample_id"))
        action = match.group("action")
        samples = load_samples()
        sample = find_sample(samples, sample_id)
        if sample is None:
            error_response(self, HTTPStatus.NOT_FOUND, "Sample not found")
            return

        desired_state = action == "delete"
        if sample.get("is_deleted") != desired_state:
            sample["is_deleted"] = desired_state
            save_samples(samples)
            append_change_log(
                {
                    "timestamp": utc_now(),
                    "action": action,
                    "sample_id": sample_id,
                }
            )

        json_response(self, {"sample": sample, "summary": build_summary(samples)})

    def read_json_body(self, allow_empty: bool = False) -> dict[str, Any] | None:
        length = int(self.headers.get("Content-Length", "0") or "0")
        if length == 0:
            if allow_empty:
                return {}
            error_response(self, HTTPStatus.BAD_REQUEST, "Request body is required")
            return None
        try:
            raw_body = self.rfile.read(length).decode("utf-8")
            return json.loads(raw_body)
        except json.JSONDecodeError:
            error_response(self, HTTPStatus.BAD_REQUEST, "Request body must be valid JSON")
            return None

    def resolve_media_path(self, request_path: str) -> Path | None:
        relative = Path(unquote(request_path.removeprefix("/media/")))
        candidate = (DATASET_DIR / relative).resolve()
        allowed_roots = [
            (DATASET_DIR / "clips").resolve(),
            (DATASET_DIR / "videos").resolve(),
            GENERATED_CLIPS_DIR.resolve(),
            SOURCE_VIDEO_COPIES_DIR.resolve(),
        ]
        for root in allowed_roots:
            try:
                candidate.relative_to(root)
                return candidate
            except ValueError:
                continue
        return None


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Dataset annotation workspace server")
    parser.add_argument("--host", default="127.0.0.1", help="Bind host")
    parser.add_argument("--port", type=int, default=8000, help="Bind port")
    parser.add_argument(
        "--runtime-dir",
        default=str(DEFAULT_RUNTIME_DIR),
        help="Directory for mutable workspace data, exports, generated clips, and browser-ready source videos",
    )
    parser.add_argument(
        "--bootstrap-only",
        action="store_true",
        help="Create runtime data files and print a summary without starting the server",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    try:
        configure_runtime_paths(Path(args.runtime_dir))
    except ValueError as exc:
        raise SystemExit(str(exc)) from exc
    setup_logging()
    migrate_legacy_workspace_data()
    schema = build_schema()
    samples = ensure_workspace(schema)

    if args.bootstrap_only:
        summary = build_summary(samples)
        LOGGER.info("Bootstrap-only run completed for %s samples", summary["total"])
        print(
            json.dumps(
                {
                    "summary": summary,
                    "samples_path": SAMPLES_PATH.as_posix(),
                    "runtime_dir": RUNTIME_DIR.as_posix(),
                },
                indent=2,
            )
        )
        return

    AnnotationRequestHandler.schema = schema
    server = ThreadingHTTPServer((args.host, args.port), AnnotationRequestHandler)
    LOGGER.info(
        "Server starting at http://%s:%s with runtime=%s data=%s",
        args.host,
        args.port,
        RUNTIME_DIR.relative_to(DATASET_DIR).as_posix(),
        SAMPLES_PATH.relative_to(DATASET_DIR).as_posix(),
    )
    print(f"Dataset Annotation Workspace running at http://{args.host}:{args.port}")
    print(f"Workspace runtime: {RUNTIME_DIR.relative_to(DATASET_DIR).as_posix()}")
    print(f"Workspace data: {SAMPLES_PATH.relative_to(DATASET_DIR).as_posix()}")
    print(f"Server log: {SERVER_LOG_PATH.relative_to(DATASET_DIR).as_posix()}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        LOGGER.info("Server shutdown requested by keyboard interrupt")
        print("\nShutting down server...")
    finally:
        server.server_close()
        LOGGER.info("Server stopped")


if __name__ == "__main__":
    main()
