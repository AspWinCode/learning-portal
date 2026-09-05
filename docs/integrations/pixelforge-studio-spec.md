# PixelForge Studio — спецификация интеграции

Встроенная студия методиста в портале (`/pixelforge`), аналог `/technolab`.
Портал проксирует authoring-API PixelForge от имени сервис-подписи (HMAC).

Статус: **SSO + чтение прогресса — сделано и на проде.** Этот документ — про
**authoring** (создание/редактирование курсов, задач, лекций, тестов).

Скоуп согласован с владельцем: **полный authoring** — иерархия `module → topic →
task`, тесты (данные, проверка ручная), подсказки, полный CRUD. Авторизация —
**HMAC общим секретом**. Своя студия PixelForge (`TeacherPage`) **выпиливается** —
портал единственная authoring-поверхность.

**Отложено отдельным заходом** (решение владельца, см. §8): механизм «ученик
видит курс» (enrollment / путь по курсу), синхронизация курсов PixelForge →
витрина портала (пункт на каждый курс), автогрейдинг Snap/GDevelop. Пока студия =
только создание контента методистом; ученический путь по дереву в этот заход не
строится.

### Решения по открытым вопросам (зафиксировано)

| Вопрос | Решение |
|---|---|
| A.1 `assignment.class_id` nullable | **Да.** Задачи из студии — шаблоны в дереве (`class_id=null`, `status=DRAFT`). Существующие класс-привязанные задания не трогаются. |
| A.2 как ученик видит курс | **Отложено.** Отдельный заход, вариант B (`course_enrollment` + `buildCoursePath`). До него — `PUT /api/admin/tasks/{id}` принимает опциональный `class_id` как единственный мост «показать задачу ученику». |
| C.4 формат ошибок | Портальный клиент читает `.message` (как клиент ТехноЛаб). **Общий `GlobalExceptionHandler` PixelForge не трогаем.** |
| D своя студия PixelForge | **Выпилить authoring** из `TeacherPage`. Review сдач тренером — не authoring, остаётся. |
| §7.1 `tool` | Фиксированный enum `SNAP | GDEVELOP`. |
| §7.2 checker для `task_test` | Автопроверки нет. `task_test` = данные («ожидаемый результат»), `checker` принимается в API, эффективно всегда `MANUAL`. |
| §7.3 глубина дерева | Ровно 3: `MODULE → TOPIC → SUBTOPIC`, guard на `POST /nodes` по `parent.type`, глубже → 400. |
| §7.4 `slug` курса | Внутренний, nullable unique, автоген translit-kebab из `title`, переопределяемый. Публичных URL по слагу нет. |
| §7.5 OpenAPI | **Да**, springdoc + Swagger UI, в шаге 1 вместе с guard. |
| node_task в нескольких узлах | Разрешено (`unique(node_id, assignment_id)`) — задача переиспользуемая. |

---

## 0. Термины и соответствие с ТехноЛаб

| Портал (UI, как в ТехноЛаб) | PixelForge сущность | Сейчас есть? |
|---|---|---|
| Курс | `course` | ❌ создать |
| Узел дерева (модуль/тема/подтема) | `course_node` | ❌ создать |
| Задача | `assignment` (существует) | ⚠️ есть create+publish, нужен PUT/DELETE/unpublish |
| Привязка задачи к узлу | `node_task` | ❌ создать |
| Автотест | `task_test` | ❌ создать |
| Подсказка | `task_hint` | ❌ создать |
| Лекция | `lecture` (существует) | ⚠️ есть create, нужен PUT/DELETE |
| Карточка лекции | `lecture_card` (существует) | ⚠️ есть create, нужен PUT/DELETE/reorder |
| Класс | `class` (существует, только bulk-синк) | ⚠️ нужен list/CRUD |

`org_id = 1` — единственный тенант, хардкод сохраняем.

---

## 1. Авторизация authoring-API (PixelForge side)

### Проблема
Сейчас `SecurityConfig`: `csrf disabled` + `anyRequest().permitAll()`.
`POST /api/assignments` доступен без авторизации на публичном домене. **Закрыть
надо в любом случае**, до релиза студии.

### Схема (та же семья, что `X-LP-Signature` / `X-Kodex-Signature`)

Все authoring-запросы портал подписывает общим `SSO_KODEX_SHARED_SECRET`.

```
X-LP-Timestamp: <unix seconds>
X-LP-Signature: hex( HMAC_SHA256( secret, "{METHOD}\n{path}\n{X-LP-Timestamp}\n{sha256_hex(body)}" ) )
```

- `path` — путь без query и без хоста, напр. `/api/admin/courses/12`
- `body` — сырые байты тела; для запросов без тела `sha256_hex("")`
- Для `multipart` (загрузка картинок) — подписывать `sha256_hex("")` и
  дополнительно слать `X-LP-Multipart: 1`; guard пропускает без хеша тела
- Отклонять, если `abs(now - X-LP-Timestamp) > 300` (анти-replay)
- Ответ при провале: `401 {"error":"invalid signature"}`

### Что реализовать в PixelForge
1. `LmsAuthoringSignatureFilter` (Servlet `OncePerRequestFilter`), навешенный на
   `/api/admin/**`. Проверяет timestamp + сигнатуру. При успехе кладёт в
   `SecurityContext` синтетическую роль `LMS_METHODIST`.
2. `SecurityConfig`: `/api/admin/**` → `.authenticated()` (или проверка роли
   `LMS_METHODIST`), остальное как есть.
3. Все authoring-контроллеры перевести под префикс `/api/admin/...` (см. §3).
   Публичные/ученические маршруты (`/api/classes/{id}/students`,
   `/api/assignments/{id}` для ученика) остаются где были.
4. `userId`/`role` больше **не** брать из query — для authoring актор всегда
   «методист LMS».

---

## 2. Модель данных (миграции PixelForge)

```
course
  id            bigserial pk
  org_id        bigint not null default 1
  title         varchar not null
  slug          varchar unique nullable
  description   text nullable
  status        varchar not null default 'DRAFT'   -- DRAFT | PUBLISHED | ARCHIVED
  sort_order    int not null default 0
  created_at, updated_at

course_node
  id            bigserial pk
  course_id     bigint not null fk -> course
  parent_id     bigint nullable fk -> course_node
  type          varchar not null                   -- MODULE | TOPIC | SUBTOPIC
  title         varchar not null
  description   text nullable
  sort_order    int not null default 0
  status        varchar not null default 'DRAFT'    -- DRAFT | PUBLISHED
  created_at, updated_at

node_task
  id            bigserial pk
  node_id       bigint not null fk -> course_node
  assignment_id bigint not null fk -> assignment
  sort_order    int not null default 0
  is_required   boolean not null default true
  unique (node_id, assignment_id)

task_test
  id             bigserial pk
  assignment_id  bigint not null fk -> assignment
  test_type      varchar not null default 'PUBLIC'  -- PUBLIC | HIDDEN
  input_data     text nullable
  expected_output text nullable
  checker        varchar not null default 'EXACT'   -- EXACT | TRIMMED | REGEX | MANUAL
  weight         numeric not null default 1
  order_index    int not null default 0

task_hint
  id             bigserial pk
  assignment_id  bigint not null fk -> assignment
  level          int not null default 1
  unlock_attempts int not null default 3
  coin_cost      int not null default 0
  content        text not null
  order_index    int not null default 0
```

Изменения существующих:
- `assignment`: добавить `updated_at`; допускать `PUBLISHED → DRAFT` (unpublish).
- `lecture`, `lecture_card`: убедиться в `updated_at`; у карточки `position`
  переиспользуем для reorder.

---

## 3. REST-контракт PixelForge (`/api/admin/**`, HMAC-guarded)

Пути и формы — калька с ТехноЛаб (`backend/app/services/technolab_client.py`).

### Курсы
```
GET    /api/admin/courses
POST   /api/admin/courses                 {title, slug?, description?, status?, sort_order?}
GET    /api/admin/courses/{id}
PUT    /api/admin/courses/{id}
DELETE /api/admin/courses/{id}
POST   /api/admin/courses/{id}/archive
POST   /api/admin/courses/{id}/unarchive
GET    /api/admin/courses/{id}/tree        -> вложенное дерево course_node + node_task
```

### Узлы дерева
```
POST   /api/admin/courses/{courseId}/nodes    {parent_id?, type, title, description?, sort_order?, status?}
PUT    /api/admin/nodes/{id}
DELETE /api/admin/nodes/{id}
POST   /api/admin/nodes/{id}/move             {parent_id?, sort_order?}
POST   /api/admin/nodes/reorder               {parent_id?, ordered_ids:[...]}
```

### Задачи (assignment)
```
GET    /api/admin/tasks/{id}
POST   /api/admin/nodes/{nodeId}/tasks         {create_new: bool, assignment_id?, title?, tool?, is_required?}
PUT    /api/admin/tasks/{id}                    {title?, description?, tool?, deadline?, lecture_id?}
DELETE /api/admin/tasks/{id}
POST   /api/admin/tasks/{id}/publish
POST   /api/admin/tasks/{id}/unpublish
DELETE /api/admin/nodes/{nodeId}/tasks/{nodeTaskId}     -- отвязать от узла (assignment не удаляется)
POST   /api/admin/nodes/{nodeId}/tasks/reorder          {ordered_ids:[...]}
```

### Тесты
```
POST   /api/admin/tasks/{taskId}/tests   {test_type?, input_data?, expected_output?, checker?, weight?, order_index?}
PUT    /api/admin/tests/{id}
DELETE /api/admin/tests/{id}
```

### Подсказки
```
POST   /api/admin/tasks/{taskId}/hints   {level?, unlock_attempts?, coin_cost?, content}
PUT    /api/admin/hints/{id}
DELETE /api/admin/hints/{id}
```

### Лекции
```
GET    /api/admin/lectures
POST   /api/admin/lectures               {title}
PUT    /api/admin/lectures/{id}          {title}
DELETE /api/admin/lectures/{id}
GET    /api/admin/lectures/{id}/cards
POST   /api/admin/lectures/{id}/cards    {card_type, content}
PUT    /api/admin/lecture-cards/{id}     {content}
DELETE /api/admin/lecture-cards/{id}
POST   /api/admin/lectures/{id}/cards/reorder   {ordered_ids:[...]}
```
`card_type`: `TEXT | IMAGE | VIDEO | SNAP_SNIPPET`.

### Классы (для выбора при привязке / просмотра)
```
GET    /api/admin/classes
GET    /api/admin/classes/{id}
GET    /api/admin/classes/{id}/students
```
CRUD классов не нужен — роут-синк остаётся на `/api/lms/sync/class`.

### Картинки задач (уже есть, перенести под admin + guard)
```
POST   /api/admin/tasks/{id}/images   (multipart, X-LP-Multipart: 1)
GET    /api/admin/tasks/{id}/images
```

Ошибки: `4xx` с телом `{"error": "..."}`; `5xx` — портал заворачивает в 502.

---

## 4. Портал — backend

### `backend/app/services/pixelforge_client.py` (новый)
Тонкий httpx-клиент. По образцу `technolab_client.py`, но вместо login/JWT —
подпись каждого запроса:

```python
PIXELFORGE_ADMIN_BASE = os.getenv("PIXELFORGE_BASE_URL", "https://pixelforge.tirskix.space")

def _sign(method: str, path: str, body: bytes) -> dict[str, str]:
    ts = str(int(time.time()))
    body_hash = hashlib.sha256(body or b"").hexdigest()
    msg = f"{method}\n{path}\n{ts}\n{body_hash}".encode()
    sig = hmac.new(SSO_KODEX_SHARED_SECRET.encode(), msg, hashlib.sha256).hexdigest()
    return {"X-LP-Timestamp": ts, "X-LP-Signature": sig}

async def _request(method, path, *, json=None): ...
```
Функции: `list_courses / create_course / get_course / update_course / delete_course /
archive_course / unarchive_course / get_course_tree / create_node / update_node /
delete_node / move_node / reorder_nodes / get_task / create_node_task / update_task /
delete_task / publish_task / unpublish_task / delete_node_task / reorder_node_tasks /
create_task_test / update_task_test / delete_task_test / create_task_hint /
update_task_hint / delete_task_hint / list_lectures / create_lecture / update_lecture /
delete_lecture / list_lecture_cards / create_lecture_card / update_lecture_card /
delete_lecture_card / reorder_lecture_cards / list_classes / get_class / get_class_students`.
+ `class PixelForgeError(Exception)` (status_code, detail).

### `backend/app/routers/pixelforge.py` (дополнить)
Добавить группу `/admin/...`, каждый эндпоинт под
`auth.require_permission("pixelforge.manage")`, тело валидируется pydantic-схемой,
ошибки `PixelForgeError` → `_raise` (как `technolab.py`), успешные мутации →
`log_action(db, user.id, "create|update|delete", "pixelforge_<entity>", id, {...})`.

Итоговые пути на портале: `/api/v1/pixelforge/admin/courses`, `.../nodes/{id}` и т.д.

### `backend/app/schemas/pixelforge.py` (дополнить)
`PixelForgeCourseCreate/Update`, `PixelForgeNodeCreate/Update/Move`,
`PixelForgeTaskCreate/Update`, `PixelForgeTestCreate`, `PixelForgeHintCreate`,
`PixelForgeLectureCreate`, `PixelForgeLectureCardCreate` — по образцу
`schemas/technolab.py`.

### Env
`PIXELFORGE_BASE_URL` уже в `docker-compose.yml`. Секрет `SSO_KODEX_SHARED_SECRET`
уже в контейнере портала. Новых переменных не нужно.

---

## 5. Портал — frontend

### `frontend/src/pages/PixelForgeStudioPage.tsx` (новый)
Калька с `TechnoLabStudioPage.tsx` (~900 строк): список курсов → дерево
(модуль/тема/подтема, drag-n-drop сортировка) → карточка задачи (описание,
инструмент SNAP/GDEVELOP, дедлайн, привязанная лекция) → вкладки «Тесты» и
«Подсказки» → редактор лекций и карточек. Публикация/снятие с публикации.

### `frontend/src/services/pixelforgeApi.ts` (дополнить)
Добавить объект `pixelforgeAdminApi` с методами под `/pixelforge/admin/...`
(по образцу `technolabApi`).

### Роут — `frontend/src/App.tsx`
```tsx
const PixelForgeStudioPage = React.lazy(() => import('./pages/PixelForgeStudioPage'));
...
<Route path="/pixelforge" element={
  <PrivateRoute requiredPermission="pixelforge.manage">
    <SectionBoundary><PixelForgeStudioPage /></SectionBoundary>
  </PrivateRoute>
} />
```

### Навигация — `frontend/src/components/Layout.tsx`
В `methodist` меню после «ТехноЛаб Studio»:
```tsx
{ text: 'PixelForge Studio', icon: <EditNoteIcon sx={{ fontSize: 18 }} />, path: '/pixelforge' },
```

### Карточка хаба — `frontend/src/pages/MethodistHubPage.tsx`
Убрать `external`, вернуть `route: '/pixelforge'` у направления `id: 'game'`
(сейчас открывает внешний сайт — временно).

### Права
`pixelforge.access` / `pixelforge.manage` уже в `permissions.py`; методист и
owner/admin (`*`) уже имеют `pixelforge.manage` — правки RBAC не нужны.

---

## 6. Последовательность

| # | Кто | Работа | Блокирует |
|---|---|---|---|
| 1 | PixelForge | HMAC-guard `/api/admin/**` + перенос существующих authoring-роутов | всё |
| 2 | PixelForge | Миграции `course / course_node / node_task / task_test / task_hint` + unpublish assignment | 3,4 |
| 3 | PixelForge | Эндпоинты §3 (курсы, узлы, задачи, тесты, подсказки, лекции CRUD, классы list) | 5,6 |
| 4 | Портал | `pixelforge_client.py` + схемы + роутер `/admin` | 6,7 |
| 5 | Портал | `PixelForgeStudioPage.tsx` + api + роут + навигация + карточка хаба | 7 |
| 6 | Оба | e2e authoring: создать курс → дерево (module/topic/subtopic) → задачу с тестом и подсказкой → лекцию с карточками → публикация; проверка через `GET /api/admin/courses/{id}/tree` + логи портала. **Без ученического шага** (см. §8). | — |
| 7 | Портал | Обновить память `external_sso_services`, док-раздел | — |

Портальные шаги 4–5 можно начинать по мере готовности эндпоинтов §3
(параллельно с шагом 3, PixelForge отдаёт контракт группами:
a) courses+nodes+tree → b) tasks+node_task → c) tests+hints → d) lectures → e) classes list).

---

## 7. Открытые вопросы к PixelForge — закрыты

Ответы сведены в таблицу «Решения по открытым вопросам» в начале документа.

---

## 8. Отложено — отдельный заход (после релиза студии)

Решение владельца: сначала студия (методист создаёт контент), потом —
подключение учеников.

1. **`course_enrollment(course_id, user_id)` + `buildCoursePath(courseId, userId)`**
   в PixelForge — путь ученика по дереву курса, независимый от классов.
   Портал зачисляет `lp-student-N` напрямую (вариант B из обсуждения).
2. **Синхронизация курсов PixelForge → витрина портала: пункт на каждый курс.**
   Каждый опубликованный `course` = отдельный `course_catalog_item`
   (`kind=external`, `code=pixelforge-<slug>`, `external_url=…/api/auth/sso?course=<id>`).
   Нужен механизм синка (webhook при publish/unpublish, либо периодический pull
   порталом `GET /api/admin/courses`). Выдача доступа ученику — точечная по курсу.
3. **Автогрейдинг** Snap/GDevelop-проектов — раннер/движок проверки. Крупный
   отдельный проект.

До этого захода: `task_test` показывается ученику/тренеру как справка,
проверка сдач — ручная (`POST /api/assignments/{id}/submissions/review`).
