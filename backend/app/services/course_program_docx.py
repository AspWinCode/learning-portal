"""Парсер .docx-файла с программой обучения курса для Студии методиста.

Ожидаемая структура документа (по стилям заголовков Word):
    Heading 1 -> модуль
    Heading 2 -> подмодуль (необязателен)
    Heading 3 -> тема (крепится к последнему открытому подмодулю в текущем
                 модуле, если он есть, иначе — напрямую к модулю)
    Heading 4 -> занятие (заголовок = title урока)

Обычные абзацы между заголовком занятия (Heading 4) и следующим заголовком
считаются содержанием занятия и конвертируются в markdown. Абзац, начинающийся
со слов "Домашнее задание" (регистронезависимо), делит содержание: всё после
него уходит в homework_md, всё до — в theory_md.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from io import BytesIO
from typing import List, Optional

import docx
from docx.text.paragraph import Paragraph

_HOMEWORK_MARKER = "домашнее задание"


@dataclass
class ParsedLesson:
    title: str
    theory_md: str = ""
    homework_md: str = ""


@dataclass
class ParsedTopic:
    title: str
    lessons: List[ParsedLesson] = field(default_factory=list)


@dataclass
class ParsedSubmodule:
    title: str
    topics: List[ParsedTopic] = field(default_factory=list)


@dataclass
class ParsedModule:
    title: str
    submodules: List[ParsedSubmodule] = field(default_factory=list)
    topics: List[ParsedTopic] = field(default_factory=list)  # темы без подмодуля


@dataclass
class ParsedProgram:
    modules: List[ParsedModule] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)


class DocxProgramParseError(ValueError):
    """Документ не подходит под ожидаемую структуру программы обучения."""


def _paragraph_markdown(paragraph: Paragraph) -> Optional[str]:
    text = paragraph.text.strip()
    if not text:
        return None

    is_bullet = "List Bullet" in (paragraph.style.name or "")
    is_number = "List Number" in (paragraph.style.name or "")

    line = ""
    for run in paragraph.runs:
        chunk = run.text
        if not chunk:
            continue
        if run.bold and run.italic:
            chunk = f"***{chunk}***"
        elif run.bold:
            chunk = f"**{chunk}**"
        elif run.italic:
            chunk = f"*{chunk}*"
        line += chunk
    line = line.strip() or text

    if is_bullet:
        return f"- {line}"
    if is_number:
        return f"1. {line}"
    return line


def _heading_level(paragraph: Paragraph) -> Optional[int]:
    style_name = paragraph.style.name or ""
    if style_name.startswith("Heading "):
        try:
            return int(style_name.rsplit(" ", 1)[-1])
        except ValueError:
            return None
    if style_name == "Title":
        return 1
    return None


def _split_theory_homework(lines: List[str]) -> (str, str):
    for i, line in enumerate(lines):
        if line.lower().lstrip("-* ").startswith(_HOMEWORK_MARKER):
            theory = "\n".join(lines[:i]).strip()
            after_marker = line.split(":", 1)
            rest = after_marker[1].strip() if len(after_marker) > 1 else ""
            homework_lines = ([rest] if rest else []) + lines[i + 1:]
            homework = "\n".join(homework_lines).strip()
            return theory, homework
    return "\n".join(lines).strip(), ""


def parse_program_docx(data: bytes) -> ParsedProgram:
    try:
        document = docx.Document(BytesIO(data))
    except Exception as exc:  # noqa: BLE001 - библиотека кидает разные исключения на битый файл
        raise DocxProgramParseError("Не удалось прочитать .docx файл — он повреждён или имеет неверный формат") from exc

    program = ParsedProgram()

    current_module: Optional[ParsedModule] = None
    current_submodule: Optional[ParsedSubmodule] = None
    current_topic: Optional[ParsedTopic] = None
    current_lesson: Optional[ParsedLesson] = None
    lesson_lines: List[str] = []

    def flush_lesson():
        nonlocal current_lesson, lesson_lines
        if current_lesson is not None:
            theory, homework = _split_theory_homework(lesson_lines)
            current_lesson.theory_md = theory
            current_lesson.homework_md = homework
            if not theory and not homework:
                program.warnings.append(f"Занятие «{current_lesson.title}» без содержания")
        current_lesson = None
        lesson_lines = []

    for paragraph in document.paragraphs:
        level = _heading_level(paragraph)
        title = paragraph.text.strip()

        if level == 1:
            flush_lesson()
            if not title:
                continue
            current_module = ParsedModule(title=title)
            program.modules.append(current_module)
            current_submodule = None
            current_topic = None
            continue

        if level == 2:
            flush_lesson()
            if current_module is None:
                raise DocxProgramParseError(
                    f"Подмодуль «{title}» встретился раньше первого модуля (Heading 1)"
                )
            if not title:
                continue
            current_submodule = ParsedSubmodule(title=title)
            current_module.submodules.append(current_submodule)
            current_topic = None
            continue

        if level == 3:
            flush_lesson()
            if current_module is None:
                raise DocxProgramParseError(
                    f"Тема «{title}» встретилась раньше первого модуля (Heading 1)"
                )
            if not title:
                continue
            current_topic = ParsedTopic(title=title)
            if current_submodule is not None:
                current_submodule.topics.append(current_topic)
            else:
                current_module.topics.append(current_topic)
            continue

        if level == 4:
            flush_lesson()
            if current_topic is None:
                raise DocxProgramParseError(
                    f"Занятие «{title}» встретилось раньше первой темы (Heading 3)"
                )
            if not title:
                continue
            current_lesson = ParsedLesson(title=title)
            current_topic.lessons.append(current_lesson)
            continue

        if level is not None:
            # Heading 5+ не используется в конвенции — считаем обычным текстом занятия.
            pass

        if current_lesson is not None:
            md_line = _paragraph_markdown(paragraph)
            if md_line is not None:
                lesson_lines.append(md_line)

    flush_lesson()

    if not program.modules:
        raise DocxProgramParseError(
            "В документе не найдено ни одного модуля (заголовок стиля Heading 1)"
        )

    for m in program.modules:
        all_topics = list(m.topics) + [t for s in m.submodules for t in s.topics]
        if not all_topics:
            program.warnings.append(f"Модуль «{m.title}» без тем")
        for t in all_topics:
            if not t.lessons:
                program.warnings.append(f"Тема «{t.title}» без занятий")

    return program
