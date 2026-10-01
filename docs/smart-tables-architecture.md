# «Умные таблицы» — архитектура и план реализации

Модуль spreadsheet с AI-слоем, встраиваемый в learning-portal-main.
Стек подогнан под существующий репозиторий: **FastAPI + PostgreSQL + SQLAlchemy + Alembic** на бэкенде,
**React 18 + TypeScript + MUI + react-query + axios** на фронтенде. Отдельного Node.js-сервиса нет —
модуль живёт как ещё один домен (`routers/smart_tables.py`, `schemas/smart_tables.py`, `services/smart_tables/`),
аналогично `agile`/`course_studio`.

Статус: раздел A–N — проектный план. Реализованы (код в репозитории):
**Phase 1 — ядро грида + базовая персистенция**, **Phase 2 — форматирование/sort/filter**
(format_range, conditional_format, sort_rows, клиентские per-column текстовые фильтры) и
**Phase 3 — формулы** (собственный парсер, dependency graph, recalculation, SUM/AVERAGE/MIN/MAX/
COUNT/COUNTA/IF/AND/OR/ROUND/CONCAT/SUMIF/COUNTIF/VLOOKUP/XLOOKUP, относительные/абсолютные
ссылки, межлистовые ссылки на чтение, обнаружение циклических ссылок) и
**Phase 4 — import/export** (CSV/XLSX, автоопределение типов колонок при импорте).
AI, realtime — спроектированы, но не реализованы.

---

## A. Architecture Decision

- **Единый бэкенд** — FastAPI, без отдельного Node.js-сервиса. Это убирает дублирование auth/permissions/
  observability и не плодит второй деплоймент на проде (см. `deploy-workflow` — весь прод деплоится одним
  `git push` + cron autodeploy).
- **Grid engine**: не Handsontable (коммерческая лицензия на часть фич, тяжёлый бандл) и не HyperFormula
  (GPLv3/commercial). Для MVP — собственный virtualized grid на `react-window`/ручной виртуализации
  (десятки килобайт, полный контроль над keyboard nav и selection, без лицензионных рисков). Если в будущем
  понадобится более богатый грид — кандидат на замену: `glide-data-grid` (MIT, canvas-based, хорошо тянет
  10k+ строк).
- **Formula engine**: минимальный собственный парсер/вычислитель на Python (рекурсивный спуск + граф
  зависимостей), а не порт HyperFormula. Причины: (1) нет Python-порта HyperFormula; (2) пересчёт должен
  идти на сервере — источник истины один; (3) набор функций в ТЗ (SUM/AVERAGE/IF/VLOOKUP и т.д.) небольшой,
  самостоятельная реализация занимает дни, а не недели, и не тащит лицензионные ограничения.
- **Operations layer — обязательный**: ни UI, ни AI не пишут в БД напрямую. Всё идёт через
  `SpreadsheetOperation` → `OperationExecutor` (backend service) → persistence. Это даёт undo/redo,
  audit log и единую точку валидации/permissions бесплатно.
- **Хранение cells**: hybrid (см. раздел C) — отдельная строка на cell в PostgreSQL, но с batched upsert и
  partial index, плюс JSONB-кэш «снимка строки» для быстрого чтения грида одним запросом.
- **Realtime**: не Liveblocks (vendor lock-in, платный SaaS) и не Yjs на первом этапе — см. раздел K.
  Для MVP — обычный REST + ETag/version на sheet (optimistic concurrency), realtime переносится в Phase 6.
- **AI**: LLM вызывается только через tool-calling с жёстко типизированным набором actions
  (Zod → в Python это Pydantic-модели + JSON Schema, см. раздел H). Содержимое ячеек — untrusted data,
  никогда не инструкция (раздел L).

## B. System Diagram

```
┌─────────────────────────── Browser ───────────────────────────┐
│  SmartTablesPage (React)                                       │
│   Grid (virtualized) · FormulaBar · Toolbar · AICommandBar      │
│        │ optimistic update        │ read (react-query cache)   │
│        ▼                          ▲                             │
│  OperationQueue  ──────────────▶  smartTablesApi (axios)        │
└───────────┼──────────────────────────────────────────────────┘
            │ POST /api/v1/smart-tables/sheets/{id}/operations
            ▼
┌───────────────────────── FastAPI ──────────────────────────────┐
│  routers/smart_tables.py                                       │
│    permission check (owner/editor/viewer, workbook membership) │
│        ▼                                                        │
│  services/smart_tables/executor.py  (OperationExecutor)        │
│    validate → apply → compute (formula engine) → persist        │
│        │                              │                         │
│        ▼                              ▼                         │
│  services/smart_tables/formula_engine.py   operation_log (audit)│
│        │                                                         │
│        ▼                                                         │
│  SQLAlchemy models (Workbook/Sheet/Column/Row/Cell)              │
└───────────┼───────────────────────────────────────────────────┘
            ▼
      PostgreSQL (hybrid cell storage, см. раздел C)

AI-путь (Phase 5, спроектирован):
  AICommandBar → POST /smart-tables/sheets/{id}/ai/actions
    → context_builder (минимальный schema/sample, НЕ весь workbook)
    → LLM tool-calling (Anthropic) → список SpreadsheetOperation (preview)
    → тот же OperationExecutor (validate/permissions/preview/undo) — AI не имеет отдельного write-пути
```

## C. Data Model

### Сущности

- **Workbook**: id, name, owner_id, created_at, updated_at.
- **Sheet**: id, workbook_id, name, position.
- **Column**: id, sheet_id, name, position, type (`text|number|currency|percentage|date|datetime|boolean|select|multi_select|formula|ai`), width, config (JSONB: select-опции, формат числа, AI-инструкция и т.п.).
- **Row**: id, sheet_id, position, height.
- **Cell**: id, row_id, column_id, raw_value (text — то, что ввёл пользователь), formula (nullable), computed_value (JSONB — результат, может быть числом/строкой/ошибкой), metadata (JSONB: ai status/cost/cached_at), formatting (JSONB: bold/color/align/number_format).
- **SmartTableOperationLog**: id, sheet_id, user_id, operation (JSONB), inverse_operation (JSONB, для undo), created_at. Это и есть history/audit, никакого полного snapshot после каждого изменения.
- **SmartTableWorkbookMember**: workbook_id, user_id, role (`owner|editor|viewer`).

### Хранение cells — сравнение подходов

| Подход | Плюсы | Минусы |
|---|---|---|
| 1. Отдельная строка на cell | простые точечные апдейты, легко индексировать по (row, column), легко считать dependency graph | много строк (10k×100 = 1M), JOIN для рендера всей таблицы |
| 2. JSONB на row | один документ на строку — быстрое чтение всей строки, компактно | сложно update одной ячейки атомарно без re-write JSON, сложно индексировать по колонке (для SUMIF/фильтров), конкурентные правки разных ячеек одной строки конфликтуют |
| 3. **Hybrid (выбран)** | cell — источник истины как отдельная строка (п.1), но на чтение грид получает **материализованный JSONB-снимок строки**, который пересобирается инкрементально при каждом set_cell той же строки | небольшая доп. сложность (держать снимок в консистентности), но она инкапсулирована в `executor.py` |

Для MVP с 10k строк × 100 колонок (макс. 1M cell-строк) это в пределах PostgreSQL без проблем при
правильных индексах (`(row_id)`, `(column_id)`, partial index на непустые formula). JSONB-снимок на Row
(`row.cells_snapshot`) обновляется точечно в той же транзакции, что и запись в Cell — рендер грида делает
один `SELECT * FROM rows WHERE sheet_id = ... ORDER BY position` без JOIN на cells.

### Стабильные ID, не A1

Row.id и Column.id — суррогатные integer PK, не зависят от позиции. `position` — float (как в agile/kanban
ordering в этом репо) для дешёвой вставки между соседями без ренумерации. A1-нотация (`F2`, `A1:C10`)
существует только в слое формул и в API как удобный ввод — транслируется в (columnId, rowId) через
индекс `position → id` на сервере перед исполнением операции. Удаление/сортировка строк не ломает формулы,
т.к. ссылки в AST хранятся как `{rowId, columnId}`, а не как текст `A1`.

### PostgreSQL schema (SQL)

```sql
CREATE TABLE smart_table_workbooks (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    owner_id INTEGER NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ
);

CREATE TABLE smart_table_members (
    workbook_id BIGINT NOT NULL REFERENCES smart_table_workbooks(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id),
    role VARCHAR(20) NOT NULL DEFAULT 'viewer', -- owner|editor|viewer
    PRIMARY KEY (workbook_id, user_id)
);

CREATE TABLE smart_table_sheets (
    id BIGSERIAL PRIMARY KEY,
    workbook_id BIGINT NOT NULL REFERENCES smart_table_workbooks(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    position DOUBLE PRECISION NOT NULL,
    frozen_rows INTEGER NOT NULL DEFAULT 0,
    frozen_columns INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_smart_table_sheets_workbook ON smart_table_sheets(workbook_id);

CREATE TABLE smart_table_columns (
    id BIGSERIAL PRIMARY KEY,
    sheet_id BIGINT NOT NULL REFERENCES smart_table_sheets(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    position DOUBLE PRECISION NOT NULL,
    type VARCHAR(20) NOT NULL DEFAULT 'text',
    width INTEGER NOT NULL DEFAULT 160,
    config JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX ix_smart_table_columns_sheet ON smart_table_columns(sheet_id);

CREATE TABLE smart_table_rows (
    id BIGSERIAL PRIMARY KEY,
    sheet_id BIGINT NOT NULL REFERENCES smart_table_sheets(id) ON DELETE CASCADE,
    position DOUBLE PRECISION NOT NULL,
    height INTEGER NOT NULL DEFAULT 32,
    cells_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb  -- {columnId: computedValue} для быстрого чтения
);
CREATE INDEX ix_smart_table_rows_sheet_position ON smart_table_rows(sheet_id, position);

CREATE TABLE smart_table_cells (
    id BIGSERIAL PRIMARY KEY,
    row_id BIGINT NOT NULL REFERENCES smart_table_rows(id) ON DELETE CASCADE,
    column_id BIGINT NOT NULL REFERENCES smart_table_columns(id) ON DELETE CASCADE,
    raw_value TEXT,
    formula TEXT,
    computed_value JSONB,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    formatting JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (row_id, column_id)
);
CREATE INDEX ix_smart_table_cells_column ON smart_table_cells(column_id);
CREATE INDEX ix_smart_table_cells_formula ON smart_table_cells(column_id) WHERE formula IS NOT NULL;

CREATE TABLE smart_table_operation_log (
    id BIGSERIAL PRIMARY KEY,
    sheet_id BIGINT NOT NULL REFERENCES smart_table_sheets(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id),
    operation JSONB NOT NULL,
    inverse_operation JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_smart_table_oplog_sheet_created ON smart_table_operation_log(sheet_id, created_at DESC);
```

SQLAlchemy-модели реализованы в [backend/app/models.py](../backend/app/models.py) (добавлены в конец файла,
классы `SmartTable*`), миграция — [backend/alembic/versions/0210_smart_tables.py](../backend/alembic/versions/0210_smart_tables.py).

## D. Spreadsheet Engine

- **Grid**: рендерит только видимые строки/колонки (windowing по вертикали и горизонтали). Каждая ячейка —
  лёгкий компонент без внутреннего состояния формы, пока не редактируется (editing-ячейка — отдельный
  контролируемый input поверх грида).
- **Formulas**: AST-парсер (`services/smart_tables/formula/parser.py`, Phase 3) строит выражение из токенов,
  ссылки `A1`/`A1:C10`/`Sheet2!A1` резолвятся в `{sheetId, columnId, rowId}` через position-индекс сразу при
  парсинге — дальше AST работает только со стабильными ID.
- **Recalculation**: dependency graph — направленный граф `cell → cells, от которых он зависит`. При
  `set_cell`/`set_formula` обновляется только подграф, достижимый от изменённой ячейки (topological order),
  не вся таблица. Циклические ссылки определяются на этапе построения графа (DFS с back-edge) — такие ячейки
  получают `computed_value = {"error": "#CIRCULAR"}` вместо падения пересчёта.
- **Относительные/абсолютные ссылки**: при copy/paste формулы со смещением относительные части ссылки
  (`A1`) сдвигаются на дельту (row/col), абсолютные (`$A$1`) — нет. Это делается на уровне AST
  (`shiftReference(ast, deltaRow, deltaCol)`), а не строковой подстановкой.

## E. Operations Engine

```typescript
// packages/shared-types — одинаковые типы на фронте (TS) и зеркально Pydantic-модели на бэке
type CellRef = { rowId: string; columnId: string };
type RangeRef = { sheetId: string; startRow: string; endRow: string; startColumn: string; endColumn: string };

type SpreadsheetOperation =
  | { type: "create_workbook"; name: string }
  | { type: "create_sheet"; workbookId: string; name: string; afterSheetId?: string }
  | { type: "rename_sheet"; sheetId: string; name: string }
  | { type: "delete_sheet"; sheetId: string }
  | { type: "insert_row"; sheetId: string; afterRowId: string | null; count?: number }
  | { type: "delete_row"; sheetId: string; rowId: string }
  | { type: "insert_column"; sheetId: string; afterColumnId: string | null; name: string; columnType: ColumnType }
  | { type: "delete_column"; sheetId: string; columnId: string }
  | { type: "move_row"; sheetId: string; rowId: string; afterRowId: string | null }
  | { type: "move_column"; sheetId: string; columnId: string; afterColumnId: string | null }
  | { type: "resize_column"; columnId: string; width: number }
  | { type: "resize_row"; rowId: string; height: number }
  | { type: "set_cell"; rowId: string; columnId: string; value: string | number | boolean | null }
  | { type: "set_formula"; rowId: string; columnId: string; formula: string }
  | { type: "set_range"; range: RangeRef; values: (string | number | boolean | null)[][] }
  | { type: "clear_range"; range: RangeRef }
  | { type: "sort_range"; range: RangeRef; columnId: string; direction: "asc" | "desc" }
  | { type: "format_range"; range: RangeRef; formatting: CellFormatting }
  | { type: "conditional_format"; range: RangeRef; condition: Condition; style: CellFormatting };
```

Исполнение — **пакетами** (`OperationBatch = { ops: SpreadsheetOperation[] }`), одна транзакция в БД.
Каждая операция при исполнении порождает `inverse_operation` (например, `delete_row` ⇄ `insert_row` с
сохранёнными значениями удалённых cells в payload инверсии) — это и есть undo без full snapshot.

## F. API

REST, не RPC-копия из примера в ТЗ — ресурсы соответствуют сущностям, операции — отдельный под-ресурс:

```
POST   /api/v1/smart-tables/workbooks
GET    /api/v1/smart-tables/workbooks
GET    /api/v1/smart-tables/workbooks/{workbook_id}
PATCH  /api/v1/smart-tables/workbooks/{workbook_id}
DELETE /api/v1/smart-tables/workbooks/{workbook_id}
POST   /api/v1/smart-tables/workbooks/{workbook_id}/members
GET    /api/v1/smart-tables/workbooks/{workbook_id}/sheets
GET    /api/v1/smart-tables/sheets/{sheet_id}              -- columns + rows (snapshot) одним ответом
POST   /api/v1/smart-tables/sheets/{sheet_id}/operations    -- batched SpreadsheetOperation[], основной write-путь
POST   /api/v1/smart-tables/sheets/{sheet_id}/undo
POST   /api/v1/smart-tables/sheets/{sheet_id}/redo
GET    /api/v1/smart-tables/sheets/{sheet_id}/operations    -- лог, пагинация, для истории/аудита
POST   /api/v1/smart-tables/workbooks/{workbook_id}/import    -- CSV/XLSX, создаёт новый лист (реализовано, Phase 4)
GET    /api/v1/smart-tables/sheets/{sheet_id}/export           -- CSV/XLSX текущего листа (реализовано, Phase 4)
POST   /api/v1/smart-tables/sheets/{sheet_id}/ai/actions      -- AI-команда → preview operations (Phase 5)
POST   /api/v1/smart-tables/sheets/{sheet_id}/ai/actions/apply -- применить ранее показанный preview
```

WebSocket (Phase 6, не реализован): `/ws/smart-tables/sheets/{sheet_id}` — события
`operation_applied`, `presence_update`, `cell_lock` для совместного редактирования; формат события —
тот же `SpreadsheetOperation`, что и в REST, плюс `{ actorId, version }`.

## G. Frontend

```
SmartTablesPage
 ├─ SpreadsheetToolbar        (undo/redo, формат, sort/filter триггеры)
 ├─ FormulaBar                 (редактирование формулы активной ячейки)
 ├─ SheetTabs
 ├─ Grid                       (виртуализация, keyboard nav, multi-select, drag fill)
 │   ├─ ColumnHeader
 │   ├─ RowHeader
 │   └─ CellEditor              (контролируемый input, маунтится только для активной ячейки)
 ├─ ContextMenu / FilterMenu
 └─ AICommandBar                (Phase 5)
```

- **State management**: react-query (как и везде в проекте) — `useSheetQuery(sheetId)` кэширует snapshot
  (columns+rows), мутации идут через `useApplyOperations()`; после ответа сервера — `queryClient.setQueryData`
  точечным патчем (не инвалидация всего сheet) для отзывчивости на больших таблицах.
- **Optimistic updates**: `OperationQueue` в сторе (zustand, как `stores/` в проекте) применяет операцию к
  локальной копии немедленно, помечает affected cells как `pending`; ответ сервера подтверждает или
  откатывает (если 409/validation error) конкретные ячейки, не весь грид.
- **Undo/redo manager**: тонкий клиентский стек последних N операций для мгновенного Ctrl+Z без round-trip,
  но источник истины — серверный `operation_log`; при расхождении (конфликт от другого пользователя)
  клиентский стек инвалидируется.

## H. AI Architecture (Phase 5, спроектировано)

AI-слой — отдельный модуль (`services/smart_tables/ai/`), не имеющий прямого доступа к БД. Он:

1. строит **минимальный контекст**: `get_sheet_schema` (имена/типы колонок) + до N образцовых строк
   (не весь workbook) — см. ниже;
2. вызывает LLM с tool-calling, где каждый инструмент — Pydantic-модель с строгой JSON Schema;
3. получает список `SpreadsheetOperation` (не свободный текст, не SQL);
4. прогоняет их через **тот же** `OperationExecutor.validate()` + `preview()`, что и ручной ввод;
5. для деструктивных операций (`delete_row`, `clear_range` на >10 ячеек) возвращает `preview`
   (`{ affected_count, sample_before, sample_after }`) и требует явного `apply`.

```python
# Пример Pydantic tool-схемы (зеркало Zod-примера из ТЗ)
class SetFormulaTool(BaseModel):
    """Записать формулу в ячейку или диапазон."""
    range: str = Field(..., description="A1-диапазон, напр. 'F2' или 'F2:F100'")
    formula: str = Field(..., description="Формула в стиле Excel, напр. '=(D2-E2)/D2'")

class ConditionalFormatTool(BaseModel):
    range: str
    operator: Literal["less_than", "greater_than", "equals", "contains"]
    value: str | float
    style: CellFormatting
```

Инструменты AI (каждый — тонкая обёртка над операцией из раздела E, с собственной input schema,
валидацией и undo "бесплатно" через OperationExecutor): `read_range`, `get_sheet_schema`, `get_columns`,
`set_cell`, `set_range`, `insert_row`, `insert_column`, `delete_row`, `delete_column`, `set_formula`,
`sort_range`, `filter_range`, `format_range`, `conditional_format`, `create_sheet`, `rename_sheet`.
AI не имеет инструмента для произвольного SQL/HTTP — технически невозможно вызвать ничего, кроме этого
списка (раздел L).

**Минимальный контекст для AI** — эвристика: `get_sheet_schema()` всегда полностью (колонки дёшевы по
объёму), плюс для данных — top-50 строк + случайная выборка 50 строк (для оценки разнообразия значений),
а не весь sheet. Если команда явно ссылается на диапазон (`"посчитай для F2:F100"`), догружается именно он.
Это держит промпт в разумных пределах даже для 10k строк.

## I. AI Column (Phase 5, спроектировано)

Колонка типа `ai` хранит в `config`: `{ instruction: string, sourceColumnIds: string[], model: string }`.
Пайплайн генерации — фоновая задача (тот же паттерн, что `services/academy_ai` в этом репо использует для
фоновых LLM-джобов):

1. По триггеру (новая строка / ручной "regenerate") ячейка помечается `metadata.status = "pending"`.
2. Воркер батчит строки (напр. по 20) в один LLM-вызов со structured output (`{ rowId, value }[]`),
   не 1 запрос на ячейку.
3. При ошибке — retry с backoff (до 3 раз), затем `metadata.status = "error"`, `metadata.error`.
4. Результат кэшируется по хэшу `(instruction, sourceValues)` — если исходные данные не менялись,
   повторная генерация не вызывает LLM повторно.
5. Пользователь может вручную переписать `raw_value` — тогда `metadata.manual_override = true`, и
   авто-регенерация эту ячейку больше не трогает, пока override не снят явно.
6. Стоимость — счётчик токенов на workbook (`metadata.tokens_used`), с мягким лимитом на батч.

## J. Undo/Redo + History

Источник истины — `smart_table_operation_log`. Каждая запись содержит `operation` и уже посчитанный
`inverse_operation` (посчитан в момент применения, когда ещё доступно "старое" состояние — так `delete_row`
инвертируется в `insert_row` с полным содержимым удалённых cells, не позже). Undo = взять последнюю
непогашенную запись пользователя для sheet, применить её `inverse_operation` как обычную операцию
(которая тоже уйдёт в лог с собственной inverse — это и есть redo-стек без отдельной структуры: redo —
это undo отменённого undo). Snapshot/version history (Phase 6+) — периодический материализованный дамп
sheet (не на каждое изменение), для "вернуться к состоянию на вчера".

## K. Realtime

| Вариант | Плюсы | Минусы | Вывод |
|---|---|---|---|
| Yjs (CRDT) | проверенный conflict-free merge, богатая экосистема | сложность интеграции с реляционной моделью cells (Yjs типы — не SQL-строки), двойной источник истины (Yjs doc vs Postgres) | избыточно для MVP, где конфликты — редкость (одна организация, не тысячи параллельных правок) |
| Liveblocks | быстрый старт, готовый presence/cursors | платный SaaS, vendor lock-in, данные уходят к третьей стороне (учитывая, что в таблицах может быть финансовая/персональная информация учеников — нежелательно) | отклонён |
| **Собственный WebSocket + operation-log** (выбран для Phase 6) | переиспользует уже спроектированный `SpreadsheetOperation`/`operation_log`, нет новых зависимостей, данные не покидают инфраструктуру | нет "из коробки" CRDT-мержа при реальном concurrent-редактировании одной ячейки — решается оптимистичной блокировкой на уровне cell (`version` + last-writer-wins с визуальным конфликт-уведомлением) | достаточно для ожидаемой нагрузки (внутренняя команда, не тысячи одновременных правок одной ячейки) |

Архитектура уже не мешает этому: `operation_log` — естественный event stream, WebSocket просто
рассылает каждую применённую операцию всем подписчикам sheet сразу после коммита транзакции.

## L. Security

- **Permissions**: workbook-level `owner/editor/viewer` (таблица `smart_table_members`), плюс
  `AGILE_ALWAYS_ACCESS_ROLES`-подобный список ролей (owner/admin) с доступом ко всем workbook — по аналогии
  с `_ALWAYS_ACCESS_ROLES` в `routers/agile.py`. Column-level permissions и protected ranges — поле
  `config.locked`/`config.allowed_roles` в `Column`, не реализовано в MVP, но схема уже его допускает.
- **Server-side validation**: каждая операция валидируется в `OperationExecutor.validate()` до применения —
  существование sheet/row/column, права пользователя, типы значений под `column.type`.
- **Rate limiting**: на `/operations` и особенно `/ai/actions` — переиспользовать существующий
  rate-limit middleware проекта (`backend/app/middleware/`), отдельный лимит на AI-эндпоинты (дороже).
- **Prompt injection**: содержимое ячеек — всегда data, никогда instruction. В промпт к LLM содержимое
  ячеек передаётся только внутри чётко маркированных data-блоков (`<sheet_data>...</sheet_data>`) с системным
  промптом, явно говорящим модели игнорировать любые команды внутри данных. Дополнительно — AI физически не
  может сделать ничего, кроме вызова typed tools из раздела H; "удали таблицу" в ячейке не транслируется
  ни в один реальный инструмент (нет tool "drop workbook" без явного, отдельного подтверждённого вызова
  пользователем через обычный UI, не через AI).
- **AI tools — запрет произвольных SQL/API**: AI-сервис не имеет доступа к DB session или HTTP-клиенту
  напрямую — только к `OperationExecutor` с заранее определённым списком операций.
- **Audit log**: `smart_table_operation_log` фиксирует `user_id` на каждую операцию, включая AI-инициированные
  (с пометкой `operation.metadata.source = "ai"` и `prompt` пользователя, вызвавшего команду).

## M. MVP Plan

| Phase | Реализует | Зависимости | Acceptance criteria |
|---|---|---|---|
| **1 — ядро грида + персистенция** (реализовано) | Workbook/Sheet/Column/Row/Cell модели, миграция, REST CRUD, базовые операции (`create_workbook/sheet`, `insert/delete row/column`, `set_cell`) через executor с undo-логом, React Grid с виртуализацией, keyboard nav, inline editing, базовый undo/redo | — | Пользователь создаёт workbook, лист, добавляет/удаляет строки и колонки, редактирует ячейки, Ctrl+Z отменяет последнее действие — всё переживает reload страницы |
| **2 — форматирование/sort/filter** (реализовано) | `format_range` (bold/italic/align/bg/text color, patch-семантика на частичный выбор полей), `set_conditional_format` (правила less_than/greater_than/equals/contains, вычисляются на фронте при рендере), `sort_rows` (asc/desc по колонке, с undo через снимок позиций), выделение диапазона мышью/Shift+стрелками, клиентские per-column текстовые фильтры (не мутируют данные, только вид) | Phase 1 | Можно выделить диапазон, покрасить/выделить жирным, настроить условное форматирование на колонку, отсортировать по колонке, отфильтровать по тексту — всё отменяется через Ctrl+Z/undo и переживает reload |
| **3 — формулы** (реализовано) | Парсер (`services/smart_tables/formula/parser.py`), SUM/AVERAGE/MIN/MAX/COUNT/COUNTA/IF/AND/OR/ROUND/CONCAT/SUMIF/COUNTIF/VLOOKUP/XLOOKUP, относительные/абсолютные ссылки (`A1`/`$A$1`), диапазоны, межлистовые ссылки на чтение (`Sheet2!A1`), пересчёт всего листа при любой value-affecting операции через dependency graph (Kahn topological sort), #CIRCULAR/#DIV0!/#VALUE!/#REF!/#N/A/#NAME? | Phase 1 | `=SUM(A1:A10)` пересчитывается при правке A1, циклическая ссылка даёт `#CIRCULAR`, не падение — подтверждено интеграционными тестами и в браузере |
| **4 — import/export** (реализовано) | Импорт CSV/XLSX создаёт **новый лист** в workbook (не трогает существующие данные), типы колонок — автоопределение (boolean/number/date/text) по значениям столбца; экспорт текущего computed_value листа в CSV/XLSX | Phase 1–2 | Импорт CSV создаёт sheet с нужными типами колонок; экспорт скачивает файл с текущими данными — подтверждено в браузере |
| 5 — AI | AI tools API, AICommandBar, AI-column pipeline, preview для деструктивных операций | Phase 1, 3 (для формульных AI-команд) | «Добавь колонку Маржа» создаёт formula-колонку с превью; «удали строки без email» показывает preview перед удалением |
| 6 — realtime | WebSocket, presence, cell-level optimistic locking | Phase 1 | Два пользователя видят правки друг друга почти мгновенно без потери данных |

## N. Project Structure

Модуль встроен в существующую монолитную структуру репозитория (не отдельный monorepo-пакет — в проекте
его и так нет, см. `backend/app/routers/*`):

```
backend/app/
  models.py                          # + SmartTable* классы (в конец файла, как остальные домены)
  schemas/smart_tables.py            # Pydantic: сущности, SpreadsheetOperation (discriminated union), AI tools
  routers/smart_tables.py            # REST endpoints
  services/smart_tables/
    __init__.py
    executor.py                     # OperationExecutor: validate/apply/invert/persist
    permissions.py                  # require_access/require_edit по аналогии с agile.py
    formula/                        # Phase 3
      parser.py
      evaluator.py
      dependency_graph.py
    ai/                              # Phase 5
      context_builder.py
      tools.py
  alembic/versions/0210_smart_tables.py

frontend/src/
  types/smartTables.ts               # зеркало SpreadsheetOperation и сущностей
  services/smartTablesApi.ts         # axios-клиент, как studentPortalApi.ts
  pages/SmartTablesPage.tsx
  components/smartTables/
    Grid.tsx
    ColumnHeader.tsx
    RowHeader.tsx
    CellEditor.tsx
    SpreadsheetToolbar.tsx
    FormulaBar.tsx                   # Phase 3
    SheetTabs.tsx
    AICommandBar.tsx                 # Phase 5
  stores/smartTablesStore.ts         # zustand: selection, operation queue, undo stack
```

## O. Код Phase 1 + Phase 2 + Phase 3 + Phase 4

Реализовано в репозитории:

- [backend/app/models.py](../backend/app/models.py) — модели `SmartTableWorkbook`, `SmartTableMember`,
  `SmartTableSheet`, `SmartTableColumn`, `SmartTableRow`, `SmartTableCell`, `SmartTableOperationLog`.
  `SmartTableCell.formatting` и `SmartTableColumn.config.conditional_formats` — Phase 2.
  `SmartTableCell.formula`/`computed_value` — источник и результат формулы (Phase 3).
- [backend/alembic/versions/0210_smart_tables.py](../backend/alembic/versions/0210_smart_tables.py) — миграция.
- [backend/app/schemas/smart_tables.py](../backend/app/schemas/smart_tables.py) — Pydantic-схемы,
  discriminated union `SpreadsheetOperation` (Phase 1: insert/delete row/column, resize, set_cell;
  Phase 2: `format_range`, `set_conditional_format`, `sort_rows`; Phase 3: `set_formula`).
  `RowOut.cells` — `{columnId: {value, formula, formatting}}`. `CellValue` допускает объект
  `{"error": "#КОД"}` — результат формулы, завершившейся ошибкой. `CellValue = Union[bool, float, str, ...]` —
  именно в этом порядке: `bool` — подкласс `int` в Python, и если `float` стоит раньше `bool` в Union,
  Pydantic в smart-режиме приводит `True`/`False` к `1.0`/`0.0` (поймано тестами на импорте boolean-колонки
  при разработке Phase 4 — баг жил и в Phase 1–3, просто не был замечен).
- [backend/app/services/smart_tables/executor.py](../backend/app/services/smart_tables/executor.py) —
  `OperationExecutor` (validate/apply/invert, запись в operation log). Все обращения к позициям строк/колонок
  идут через свежие SQL-запросы (`_fresh_rows`/`_fresh_columns`), а не через закэшированную ORM-relationship —
  иначе несколько `insert_row`/`insert_column` подряд в одном батче получали одинаковую позицию (найдено и
  исправлено тестами при разработке Phase 2). После любой value-affecting операции (`_VALUE_AFFECTING_OPS`)
  вызывает `FormulaEngine.recalculate_sheet()`.
- [backend/app/services/smart_tables/formula/parser.py](../backend/app/services/smart_tables/formula/parser.py) —
  рекурсивный спуск: числа/строки/bool, `A1`/`$A$1`/`A1:B10`/`Sheet2!A1`, вызовы функций, арифметика,
  сравнения, `&` (конкатенация).
- [backend/app/services/smart_tables/formula/functions.py](../backend/app/services/smart_tables/formula/functions.py) —
  SUM/AVERAGE/MIN/MAX/COUNT/COUNTA/ROUND/CONCAT/SUMIF/COUNTIF/VLOOKUP/XLOOKUP (точный поиск; приближённый
  поиск VLOOKUP по отсортированной таблице не реализован).
- [backend/app/services/smart_tables/formula/engine.py](../backend/app/services/smart_tables/formula/engine.py) —
  `FormulaEngine`: резолвинг A1-нотации в стабильные `(row_id, column_id)` через текущий порядок строк/колонок
  листа, граф зависимостей между формульными ячейками листа, топологическая сортировка (Kahn), обнаружение
  циклов (`#CIRCULAR`), IF/AND/OR — ленивые (короткое замыкание), остальные функции — eager. Межлистовые
  ссылки читают последний посчитанный `computed_value` другого листа (без проактивного проброса пересчёта
  между листами — ограничение MVP, см. раздел D выше).
- [backend/app/services/smart_tables/import_export.py](../backend/app/services/smart_tables/import_export.py) —
  парсинг CSV (`csv.Sniffer` для разделителя)/XLSX (`openpyxl`), автоопределение типа колонки по значениям
  столбца (boolean → number → date → text, первое совпадение по всем непустым значениям), создание нового
  листа напрямую (в обход OperationExecutor — массовая вставка, не "операция" с осмысленным undo); экспорт
  текущего `computed_value` каждой ячейки в CSV/XLSX (не формулы — значения).
- [backend/app/routers/smart_tables.py](../backend/app/routers/smart_tables.py) — REST API, включая
  `POST /workbooks/{id}/import` (multipart) и `GET /sheets/{id}/export?format=csv|xlsx`.
- [frontend/src/types/smartTables.ts](../frontend/src/types/smartTables.ts) — включая `FormulaError`/`isFormulaError`.
- [frontend/src/services/api/smartTables.ts](../frontend/src/services/api/smartTables.ts) — `importFile`
  (FormData), `exportFile` (blob → programmatic `<a download>`).
- [frontend/src/pages/SmartTablesPage.tsx](../frontend/src/pages/SmartTablesPage.tsx) +
  [components/smartTables/Grid.tsx](../frontend/src/components/smartTables/Grid.tsx) — грид, тулбар
  форматирования, выделение диапазона, меню сортировки/условного форматирования, строка фильтров, кнопки
  «Импорт CSV/XLSX» (скрытый `<input type=file>`) и «Экспорт» (меню CSV/XLSX).
  Ввод значения, начинающегося с `=`, отправляет `set_formula`; редактирование формульной ячейки показывает
  исходный текст формулы, а не вычисленный результат; ошибки формул рендерятся красным текстом (`#DIV/0!` и т.п.).

AI, realtime — не реализованы (Phases 5, 6, план выше). Отдельная FormulaBar (раздел G) не реализована —
формула редактируется прямо в ячейке, этого достаточно для MVP.
