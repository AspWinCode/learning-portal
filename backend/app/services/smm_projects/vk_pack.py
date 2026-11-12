"""Build downloadable VK publication packs for manual media upload."""
from __future__ import annotations

import io
import json
import re
import zipfile
from typing import Iterable, Optional, Tuple


def _safe_filename(value: str, fallback: str = "file") -> str:
    value = re.sub(r"[\r\n\t/\\:]+", " ", str(value or "")).strip()
    value = re.sub(r"[^\w .()\-\u0400-\u04ff]+", "_", value)
    return (value or fallback)[:120]


def build_vk_pack(
    *,
    title: Optional[str],
    text: str,
    assets: Iterable[Tuple[str, bytes, Optional[str]]],
) -> bytes:
    """Return a ZIP with human-readable VK text and ordered media files.

    ``assets`` contains ``(filename, bytes, content_type)`` tuples in the order
    in which VK should show the carousel slides.
    """
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("post.txt", (text or "").strip() + "\n")
        archive.writestr(
            "README.txt",
            "ПАКЕТ ДЛЯ ПУБЛИКАЦИИ В VK\n\n"
            "1. Откройте сообщество VK и создайте новую запись.\n"
            "2. Скопируйте текст из файла post.txt.\n"
            "3. Загрузите изображения из папки media по порядку.\n"
            "4. Для карусели добавьте все изображения одной публикацией.\n"
            "5. Проверьте предпросмотр и опубликуйте запись.\n",
        )

        manifest = []
        for index, (original_name, data, content_type) in enumerate(assets, start=1):
            original_basename = original_name.rsplit("/", 1)[-1]
            extension = "jpg"
            if "." in original_basename:
                extension = original_basename.rsplit(".", 1)[-1].lower()[:8]
                stem = original_basename.rsplit(".", 1)[0]
            else:
                stem = original_basename
                if content_type and "/" in content_type:
                    extension = content_type.split("/", 1)[1].split("+", 1)[0][:8]
            filename = f"media/{index:02d}_{_safe_filename(stem, f'slide_{index}')}.{extension}"
            archive.writestr(filename, data)
            manifest.append({"order": index, "file": filename, "source_name": original_name})

        archive.writestr(
            "manifest.json",
            json.dumps({"title": title or "", "media": manifest}, ensure_ascii=False, indent=2) + "\n",
        )
    return output.getvalue()
