from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import Optional

from app.models import Transcription, TranscriptionStatus

logger = logging.getLogger(__name__)

TRANSCRIPTION_STORAGE_ROOT = Path(os.getenv("TRANSCRIPTION_STORAGE_ROOT", "/app/storage/transcriptions")).resolve()
TRANSCRIPTION_MODEL_SIZE = os.getenv("TRANSCRIPTION_MODEL_SIZE", "small")
TRANSCRIPTION_DEVICE = os.getenv("TRANSCRIPTION_DEVICE", "cpu")
TRANSCRIPTION_COMPUTE_TYPE = os.getenv("TRANSCRIPTION_COMPUTE_TYPE", "int8")

_model = None


def ensure_storage_root() -> None:
    TRANSCRIPTION_STORAGE_ROOT.mkdir(parents=True, exist_ok=True)


def _get_model():
    global _model
    if _model is None:
        from faster_whisper import WhisperModel

        logger.info("Loading faster-whisper model %s (%s/%s)", TRANSCRIPTION_MODEL_SIZE, TRANSCRIPTION_DEVICE, TRANSCRIPTION_COMPUTE_TYPE)
        _model = WhisperModel(TRANSCRIPTION_MODEL_SIZE, device=TRANSCRIPTION_DEVICE, compute_type=TRANSCRIPTION_COMPUTE_TYPE)
    return _model


def run_transcription_job(db, transcription_id: int) -> None:
    row: Optional[Transcription] = db.query(Transcription).filter(Transcription.id == transcription_id).first()
    if not row:
        return
    row.status = TranscriptionStatus.PROCESSING
    db.commit()

    audio_path = TRANSCRIPTION_STORAGE_ROOT / row.storage_key
    try:
        if not audio_path.exists():
            raise FileNotFoundError(f"Audio file not found: {row.storage_key}")
        model = _get_model()
        segments, info = model.transcribe(str(audio_path))
        text = "".join(segment.text for segment in segments).strip()
        row.text = text
        row.language = getattr(info, "language", None)
        row.status = TranscriptionStatus.DONE
        row.error_message = None
    except Exception as exc:  # noqa: BLE001
        logger.exception("Transcription job failed for id=%s", transcription_id)
        row.status = TranscriptionStatus.ERROR
        row.error_message = str(exc)[:2000]
    finally:
        db.commit()
