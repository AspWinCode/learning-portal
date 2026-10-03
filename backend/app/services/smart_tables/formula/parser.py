"""Парсер формул (подмножество Excel-синтаксиса) — Phase 3.

=A1+B1*2, диапазоны (A1:A10), относительные/абсолютные ссылки ($A$1),
межлистовые ссылки (Sheet2!A1 или 'My Sheet'!A1), вызовы функций.

AST не содержит column_id/row_id — только "сырые" координаты (буквы
колонки, номер строки, опциональное имя листа). Резолвинг в стабильные
ID (A1-нотация — только удобный слой поверх стабильного хранилища,
см. docs/smart-tables-architecture.md раздел C) делает
`engine.py` на основе текущего порядка колонок/строк листа.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import List, Optional, Union


class FormulaSyntaxError(ValueError):
    pass


# ── AST ────────────────────────────────────────────────────────

@dataclass
class NumberLit:
    value: float


@dataclass
class StringLit:
    value: str


@dataclass
class BoolLit:
    value: bool


@dataclass
class CellRef:
    sheet: Optional[str]
    col_letters: str
    col_abs: bool
    row_number: int
    row_abs: bool


@dataclass
class RangeRef:
    start: CellRef
    end: CellRef


@dataclass
class FuncCall:
    name: str
    args: List["Node"] = field(default_factory=list)


@dataclass
class BinOp:
    op: str
    left: "Node"
    right: "Node"


@dataclass
class UnaryOp:
    op: str
    operand: "Node"


Node = Union[NumberLit, StringLit, BoolLit, CellRef, RangeRef, FuncCall, BinOp, UnaryOp]


# ── Tokenizer helpers (регулярки проверяются на текущей позиции) ──

_WS_RE = re.compile(r"\s*")
_NUMBER_RE = re.compile(r"\d+(\.\d+)?")
_STRING_RE = re.compile(r'"((?:[^"]|"")*)"')
_CELL_RE = re.compile(r"(?P<col_abs>\$)?(?P<col>[A-Za-z]{1,3})(?P<row_abs>\$)?(?P<row>\d+)")
_SHEET_PREFIX_RE = re.compile(r"(?:'([^']+)'|([A-Za-z_][A-Za-z0-9_]*))!")
_NAME_RE = re.compile(r"[A-Za-z_][A-Za-z0-9_]*")


class Parser:
    def __init__(self, text: str):
        self.s = text
        self.i = 0

    def parse(self) -> Node:
        self._ws()
        node = self._comparison()
        self._ws()
        if self.i != len(self.s):
            raise FormulaSyntaxError(f"Лишние символы в формуле на позиции {self.i}: {self.s[self.i:]!r}")
        return node

    # ── low-level ───────────────────────────────────────────────

    def _ws(self):
        m = _WS_RE.match(self.s, self.i)
        if m:
            self.i = m.end()

    def _match(self, pattern: re.Pattern):
        self._ws()
        m = pattern.match(self.s, self.i)
        if m:
            self.i = m.end()
        return m

    def _char(self, ch: str) -> bool:
        self._ws()
        if self.s[self.i:self.i + len(ch)] == ch:
            self.i += len(ch)
            return True
        return False

    def _peek_char(self, ch: str) -> bool:
        self._ws()
        return self.s[self.i:self.i + len(ch)] == ch

    # ── grammar (по возрастанию приоритета) ───────────────────────
    # comparison -> concat (( '=' | '<>' | '<=' | '>=' | '<' | '>' ) concat)*
    # concat     -> additive ('&' additive)*
    # additive   -> term (('+'|'-') term)*
    # term       -> power (('*'|'/') power)*
    # power      -> unary ('^' power)?
    # unary      -> '-' unary | primary
    # primary    -> NUMBER | STRING | TRUE | FALSE | range | cellref | func(args) | '(' comparison ')'

    def _comparison(self) -> Node:
        node = self._concat()
        while True:
            for op in ("<=", ">=", "<>", "=", "<", ">"):
                if self._peek_char(op):
                    self._char(op)
                    node = BinOp(op, node, self._concat())
                    break
            else:
                break
        return node

    def _concat(self) -> Node:
        node = self._additive()
        while self._peek_char("&"):
            self._char("&")
            node = BinOp("&", node, self._additive())
        return node

    def _additive(self) -> Node:
        node = self._term()
        while True:
            if self._peek_char("+"):
                self._char("+")
                node = BinOp("+", node, self._term())
            elif self._peek_char("-"):
                self._char("-")
                node = BinOp("-", node, self._term())
            else:
                break
        return node

    def _term(self) -> Node:
        node = self._power()
        while True:
            if self._peek_char("*"):
                self._char("*")
                node = BinOp("*", node, self._power())
            elif self._peek_char("/"):
                self._char("/")
                node = BinOp("/", node, self._power())
            else:
                break
        return node

    def _power(self) -> Node:
        node = self._unary()
        if self._peek_char("^"):
            self._char("^")
            node = BinOp("^", node, self._power())
        return node

    def _unary(self) -> Node:
        if self._peek_char("-"):
            self._char("-")
            return UnaryOp("-", self._unary())
        if self._peek_char("+"):
            self._char("+")
            return self._unary()
        return self._primary()

    def _primary(self) -> Node:
        self._ws()
        if self.i >= len(self.s):
            raise FormulaSyntaxError("Неожиданный конец формулы")

        if self._char("("):
            node = self._comparison()
            if not self._char(")"):
                raise FormulaSyntaxError("Ожидалась ')'")
            return node

        m = self._match(_STRING_RE)
        if m:
            return StringLit(m.group(1).replace('""', '"'))

        # возможная ссылка на ячейку/диапазон (с опциональным префиксом листа)
        start = self.i
        sheet_name = None
        sm = self._match(_SHEET_PREFIX_RE)
        if sm:
            sheet_name = sm.group(1) or sm.group(2)
        cell = self._try_cell_ref(sheet_name)
        if cell is not None:
            if self._peek_char(":"):
                self._char(":")
                end_sheet = self._try_sheet_prefix()
                end_cell = self._try_cell_ref(end_sheet or sheet_name)
                if end_cell is None:
                    raise FormulaSyntaxError("Ожидалась вторая ссылка диапазона после ':'")
                return RangeRef(cell, end_cell)
            return cell
        self.i = start  # не ссылка — откатываемся и пробуем другие варианты

        m = self._match(_NUMBER_RE)
        if m:
            return NumberLit(float(m.group(0)))

        m = self._match(_NAME_RE)
        if m:
            name = m.group(0)
            if self._char("("):
                args: List[Node] = []
                if not self._peek_char(")"):
                    args.append(self._comparison())
                    while self._char(","):
                        args.append(self._comparison())
                if not self._char(")"):
                    raise FormulaSyntaxError(f"Ожидалась ')' после аргументов {name}()")
                return FuncCall(name.upper(), args)
            if name.upper() == "TRUE":
                return BoolLit(True)
            if name.upper() == "FALSE":
                return BoolLit(False)
            raise FormulaSyntaxError(f"Неизвестный идентификатор {name!r} (не функция и не ссылка)")

        raise FormulaSyntaxError(f"Не удалось разобрать формулу на позиции {self.i}: {self.s[self.i:]!r}")

    def _try_sheet_prefix(self) -> Optional[str]:
        sm = self._match(_SHEET_PREFIX_RE)
        if sm:
            return sm.group(1) or sm.group(2)
        return None

    def _try_cell_ref(self, sheet: Optional[str]) -> Optional[CellRef]:
        self._ws()
        m = _CELL_RE.match(self.s, self.i)
        if not m:
            return None
        self.i = m.end()
        return CellRef(
            sheet=sheet,
            col_letters=m.group("col").upper(),
            col_abs=m.group("col_abs") is not None,
            row_number=int(m.group("row")),
            row_abs=m.group("row_abs") is not None,
        )


def parse_formula(text: str) -> Node:
    """`text` — формула без ведущего '=' (его срезает вызывающий код)."""
    return Parser(text).parse()


def col_letters_to_index(letters: str) -> int:
    """'A' -> 0, 'B' -> 1, ..., 'Z' -> 25, 'AA' -> 26, ... (0-indexed)."""
    n = 0
    for ch in letters.upper():
        n = n * 26 + (ord(ch) - ord("A") + 1)
    return n - 1


def index_to_col_letters(index: int) -> str:
    """Обратное к col_letters_to_index: 0 -> 'A', 25 -> 'Z', 26 -> 'AA', ..."""
    n = index + 1
    letters = ""
    while n > 0:
        n, rem = divmod(n - 1, 26)
        letters = chr(ord("A") + rem) + letters
    return letters
