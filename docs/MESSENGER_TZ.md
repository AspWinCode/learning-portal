# ТЗ: Модуль мессенджера для Learning Portal

**Версия:** 1.0
**Дата:** 2026-04-02
**Статус:** Планирование (не начато)

Документ предназначен для: backend-разработчика, frontend-разработчика, mobile-разработчика, дизайнера, project manager / product owner.

---

## 1. Назначение проекта

Разработать встроенный мессенджер для системы Learning Portal, который работает:

- внутри веб-портала
- в мобильном приложении на Android
- в мобильном приложении на iOS

Мессенджер обеспечивает коммуникацию между:

- учениками
- тренерами
- родителями
- службой заботы / менеджерами
- администрацией

Мессенджер глубоко интегрирован в текущую CRM/ERP-логику портала: группы, занятия, напоминания, оплаты, рассылки, опросы, push-уведомления, роли пользователей.

---

## 2. Цели внедрения

### Бизнес-цели

- Перевести коммуникацию с учениками и родителями в собственную экосистему
- Повысить удержание учеников за счет групповых чатов и напоминаний
- Упростить коммуникацию родителей со службой заботы
- Увеличить собираемость оплат через push и кнопку «Оплатить» в чате
- Создать единый канал для объявлений, рассылок и опросов
- Снизить зависимость от внешних мессенджеров

### Продуктовые цели

- У каждого ученика — личный аккаунт
- У каждой учебной группы — свой чат
- У родителя — отдельный чат со службой заботы
- Тренер может публиковать объявления в группах
- Менеджер может рассылать сообщения и опросы
- Система отправляет автоматические напоминания о занятиях и оплатах

---

## 3. Область внедрения

Модуль внедряется в текущую систему:

- **Backend:** FastAPI + SQLAlchemy + PostgreSQL
- **Frontend:** React 18 + TypeScript + Material UI
- **Mobile:** новое приложение на React Native
- **Notifications:** текущий worker + push-инфраструктура
- **Auth:** JWT OAuth2

---

## 4. Пользовательские роли

В текущую ролевую модель добавить новую роль: `student`

Итоговый набор ролей:

| Роль | Описание |
|------|----------|
| `owner` | Владелец, полный доступ |
| `admin` | Администратор |
| `sales` | Продажи / CRM |
| `trainer` | Тренер |
| `parent` | Родитель ученика |
| `student` | **Новая роль** |
| `guest` | Гость, только просмотр |

---

## 5. Основные сценарии использования

### 5.1. Ученик

- Входит по логину и паролю
- Видит список своих чатов
- Состоит в групповом чате своей группы
- Получает напоминания о занятиях
- Может писать сообщения в групповой чат
- Может отправлять: текст, смайлики, GIF, стикеры, изображения, видео, файлы
- Получает объявления от тренера
- Участвует в опросах

### 5.2. Тренер

- Видит чаты своих групп
- Отправляет объявления и материалы
- Пишет в групповые чаты
- Запускает опросы
- Отправляет системные сообщения вручную
- Прикрепляет файлы и видео

### 5.3. Родитель

- Входит в приложение / портал
- Имеет один основной чат со службой заботы
- Получает: уведомления о занятиях ребенка, напоминания об оплате, сообщения от менеджера, опросы
- Может задать вопрос в чат
- Видит кнопку «Оплатить» в сообщениях, связанных с оплатой
- Получает push-уведомления

### 5.4. Менеджер / служба заботы

- Ведет чаты с родителями
- Отправляет шаблонные и ручные сообщения
- Запускает рассылки
- Отправляет опросы и напоминания об оплате
- Видит статусы доставки и прочтения

### 5.5. Администратор / владелец

- Управляет политиками чатов
- Создает системные рассылки
- Модерирует сообщения
- Видит аналитику
- Управляет шаблонами и настройками

---

## 6. Функциональные требования

### 6.1. Аккаунты и авторизация

- Каждый ученик имеет собственный аккаунт
- В системе есть роль `student`
- Авторизация: логин + пароль, JWT access/refresh
- В мобильном приложении поддерживается постоянная сессия
- Восстановление доступа через портал / администратора

**Связь сущностей:**

```
students.user_id → users.id (nullable, unique)
```

### 6.2. Типы чатов

| Тип | Описание |
|-----|----------|
| `group_chat` | Чат учебной группы |
| `direct_chat` | Личный чат между двумя пользователями |
| `parent_support_chat` | Чат родителя со службой заботы |
| `system_chat` | Системный сервисный канал |
| `broadcast_channel` | Служебный канал рассылок |
| `lesson_chat` | Чат по конкретному занятию (этап 2) |

### 6.3. Групповые чаты

- Для каждой учебной группы создается отдельный чат
- В чат автоматически добавляются ученики и тренер группы
- При изменении состава группы состав участников чата обновляется
- В чат приходят системные сообщения: напоминание о занятии, перенос, отмена, материалы, ДЗ, опрос
- Чат имеет: название, аватар/иконку, список участников, историю сообщений

### 6.4. Личные чаты

**Этап 1** — разрешить только:
- `parent` ↔ `support/sales`
- `trainer` ↔ `manager/admin`
- `trainer` ↔ `student` — опционально

**Не включать по умолчанию:** `student` ↔ `student` (риски общения детей без ограничений)

**Этап 2** — ввести политику:
- можно ли ученикам писать друг другу
- в пределах группы или нет
- требуется ли модерация

### 6.5. Сообщения

**Поддерживаемые типы:**
- Текст
- Изображение
- Видео
- GIF
- Стикер
- Файл
- Системное сообщение
- Сообщение-опрос
- Сообщение с оплатой
- Сообщение-объявление

**Возможности:**
- Отправка / получение
- Отображение времени
- Статус доставки / прочтения
- Reply на сообщение
- Удаление сообщения для себя
- Редактирование текста (опционально)

### 6.6. Стикеры, смайлики, GIF

- Поддержка emoji
- Поддержка GIF
- Поддержка стикеров
- Старт: стандартные emoji + встроенный набор стикеров школы
- Позже: тематические стикерпаки по курсам, achievement stickers

### 6.7. Медиа и вложения

**Поддерживаемые типы:** jpg, png, webp, gif, mp4/mov, pdf, doc/docx, xlsx, txt

**Ограничения:**
- Ограничение размера файла
- Ограничение длины видео
- Whitelist MIME-types
- Антивирусная/санитарная проверка
- Генерация preview и thumbnail

**Хранение:** не в PostgreSQL. Использовать MinIO / S3-compatible (Synology NAS).

### 6.8. Напоминания о занятиях

Система отправляет автоматически:
- Сообщение в групповой чат за заданное время до занятия
- Push-уведомление ученику
- Push родителю (при необходимости)

Данные берутся из: `LessonInstance`, `Group`, состава группы, `chat_conversations`.

**Примеры текста:**
- «Напоминаем: сегодня в 18:00 занятие по Python»
- «Завтра в 17:00 у вас занятие по группе WinCode Base»

**Настраиваемые параметры:** за 24 часа / за 3 часа / за 30 минут

### 6.9. Родительский чат со службой заботы

- У каждого родителя — один чат типа `parent_support_chat`
- Участники: родитель + менеджер (+ администратор при необходимости)
- Родитель задаёт вопросы, менеджер отвечает вручную и шаблонами
- В чат приходят: напоминания об оплате, сообщения по расписанию, опросы, сервисные уведомления

### 6.10. Кнопка «Оплатить»

В родительском чате отображаются специальные сообщения с кнопкой «Оплатить», содержащие:
- Сумму
- Назначение платежа
- Дедлайн
- Статус оплаты
- Кнопку перехода к оплате

**Источники данных:** `Invoice`, `StudentAccount`, `SalesDebtsPage`, финансовый модуль.

**После оплаты система:**
- Обновляет статус оплаты
- Отправляет push-уведомление родителю
- Отправляет системное сообщение «Оплата получена»
- Обновляет данные в CRM

### 6.11. Push-уведомления

**Push приходят по событиям:**
- Новое сообщение
- Напоминание по занятию
- Оплата
- Рассылка / опрос / объявление тренера

**Платформы:** Android, iOS, Web push

**Поведение:**
- Если приложение закрыто → push с deep link
- Если открыто → обновление внутри интерфейса + локальный badge
- Нажатие на push → открывается конкретный чат / сообщение / карточка оплаты

### 6.12. Рассылки

**Аудитории:**
- Родители группы / программы
- Ученики группы / направления
- Пользователи по сегменту или условию (неоплаченные счета, занятие завтра, мероприятие)

**Типы рассылок:** текстовая, announcement, payment reminder, опрос, приглашение, системная

**Кто может создавать:** admin, owner, sales/service manager, тренер (только по своим группам)

### 6.13. Опросы

- Создаются в: групповом чате, родительском чате, массовой рассылке
- Поддержка: один вариант / несколько вариантов
- Задаётся дата закрытия
- Результаты видны создателю

### 6.14. Модерация и безопасность

Обязательно (система для детей):

- Жёсткая модель прав
- Логирование сообщений
- Возможность жалобы на сообщение
- Фильтрация запрещённых вложений
- Rate limit на отправку сообщений
- Возможность отключить личные чаты между учениками
- Удаление участника из чата
- Архивирование / заморозка чата
- Блокировка пользователя в чате
- Протоколирование действий модератора

---

## 7. Нефункциональные требования

### 7.1. Производительность

- История сообщений открывается быстро
- Список чатов загружается без полной перезагрузки
- Realtime-доставка — почти мгновенная
- Предусмотреть масштабирование

### 7.2. Надёжность

- Сообщения не теряются при сбоях
- Retry-механика для push
- Журнал ошибок доставки

### 7.3. Безопасность

- JWT-проверка
- Проверка доступа к каждому чату, сообщению, файлу
- Валидация вложений
- Лимиты на размер медиа
- Серверная защита от спама и flood

### 7.4. Масштабируемость

Сразу закладывать архитектуру под рост:
- Redis (pub/sub, presence, unread counts, rate limit, fan-out)
- Очередь задач (рассылки, media processing, push fan-out, retry)
- Object storage (MinIO / Synology S3)

---

## 8. Архитектурное решение

### 8.1. Общая схема

```
Learning Portal Core          Chat Core               Infra
─────────────────────    ─────────────────────    ──────────────
FastAPI                  Chat tables              Redis
PostgreSQL               REST API                 Queue worker
JWT                      WebSocket                MinIO / S3
CRM/ERP logic            Push delivery            Push providers
                         Broadcasts
                         Polls                    Clients
                         Payment cards            ────────────
                                                  Web portal
                                                  React Native (Android + iOS)
```

### 8.2. Почему нужен Redis

- Online/offline presence
- Pub/sub realtime-событий
- Кэш unread counts
- Rate limit
- Fan-out при broadcast

### 8.3. Почему нужен отдельный worker

Текущий APScheduler внутри FastAPI — недостаточен для мессенджера.
Вынести в отдельную очередь:
- Массовые рассылки
- Push fan-out
- Генерацию thumbnails
- Обработку видео
- Retry доставки

**Рекомендуется:** Redis + Celery или Redis + Dramatiq/RQ

---

## 9. Изменения в модели данных

### 9.1. Роль student

```python
# В enum UserRole добавить:
student = "student"
```

### 9.2. Связь User ↔ Student

```sql
ALTER TABLE students ADD COLUMN user_id INTEGER UNIQUE REFERENCES users(id);
```

### 9.3. Новые таблицы

#### `chat_conversations`

| Поле | Тип | Описание |
|------|-----|----------|
| id | UUID | PK |
| type | enum | group_chat / direct_chat / parent_support_chat / system_chat / broadcast_channel |
| title | varchar | Название чата |
| avatar_url | varchar | nullable |
| group_id | int | nullable, FK groups |
| lesson_instance_id | int | nullable |
| parent_user_id | int | nullable, FK users |
| created_by | int | FK users |
| is_active | bool | |
| created_at | timestamp | |
| updated_at | timestamp | |

#### `chat_participants`

| Поле | Тип | Описание |
|------|-----|----------|
| id | UUID | PK |
| conversation_id | UUID | FK chat_conversations |
| user_id | int | FK users |
| role_in_chat | enum | admin / member / readonly |
| can_write | bool | |
| can_send_media | bool | |
| can_invite | bool | |
| joined_at | timestamp | |
| last_read_message_id | UUID | nullable |
| last_read_at | timestamp | nullable |
| is_muted | bool | |
| is_archived | bool | |

#### `chat_messages`

| Поле | Тип | Описание |
|------|-----|----------|
| id | UUID | PK |
| conversation_id | UUID | FK |
| sender_user_id | int | FK users |
| message_type | enum | text / image / video / file / sticker / gif / system / poll / payment / announcement |
| text | text | nullable |
| reply_to_message_id | UUID | nullable |
| metadata_json | jsonb | доп. данные (poll_id, invoice_id, etc.) |
| created_at | timestamp | |
| edited_at | timestamp | nullable |
| deleted_at | timestamp | nullable (soft delete) |

#### `chat_attachments`

| Поле | Тип | Описание |
|------|-----|----------|
| id | UUID | PK |
| message_id | UUID | FK |
| file_name | varchar | |
| file_kind | enum | image / video / document / audio |
| mime_type | varchar | |
| file_size | int | bytes |
| storage_key | varchar | ключ в S3/MinIO |
| preview_url | varchar | |
| duration_sec | int | nullable (для видео/аудио) |
| width | int | nullable |
| height | int | nullable |
| created_at | timestamp | |

#### `chat_message_reads`

| Поле | Тип | Описание |
|------|-----|----------|
| id | UUID | PK |
| message_id | UUID | FK |
| user_id | int | FK |
| read_at | timestamp | |

#### `chat_broadcasts`

| Поле | Тип | Описание |
|------|-----|----------|
| id | UUID | PK |
| audience_type | enum | group / program / all_parents / all_students / segment |
| segment_json | jsonb | параметры сегментации |
| title | varchar | |
| body | text | |
| status | enum | draft / scheduled / sending / sent / cancelled |
| scheduled_at | timestamp | nullable |
| created_by | int | FK users |
| created_at | timestamp | |

#### `chat_polls`

| Поле | Тип | Описание |
|------|-----|----------|
| id | UUID | PK |
| conversation_id | UUID | nullable |
| broadcast_id | UUID | nullable |
| question | text | |
| options_json | jsonb | список вариантов |
| multiple_choice | bool | |
| closes_at | timestamp | nullable |
| created_by | int | FK users |
| created_at | timestamp | |

#### `chat_poll_votes`

| Поле | Тип | Описание |
|------|-----|----------|
| id | UUID | PK |
| poll_id | UUID | FK |
| user_id | int | FK |
| option_key | varchar | |
| voted_at | timestamp | |

#### `push_devices`

| Поле | Тип | Описание |
|------|-----|----------|
| id | UUID | PK |
| user_id | int | FK users |
| platform | enum | android / ios / web |
| push_token | varchar | |
| app_version | varchar | |
| last_seen_at | timestamp | |
| is_active | bool | |

#### `chat_moderation_logs`

| Поле | Тип | Описание |
|------|-----|----------|
| id | UUID | PK |
| target_message_id | UUID | nullable |
| target_user_id | int | nullable |
| moderator_user_id | int | FK users |
| action_type | enum | delete_message / ban_user / mute_user / freeze_chat / warn |
| reason | text | |
| created_at | timestamp | |

---

## 10. API

### 10.1. REST endpoints

#### Conversations
```
GET    /api/chat/conversations
POST   /api/chat/conversations
GET    /api/chat/conversations/{id}
POST   /api/chat/conversations/{id}/participants
DELETE /api/chat/conversations/{id}/participants/{user_id}
```

#### Messages
```
GET    /api/chat/conversations/{id}/messages
POST   /api/chat/conversations/{id}/messages
PATCH  /api/chat/messages/{id}
DELETE /api/chat/messages/{id}
POST   /api/chat/messages/{id}/read
```

#### Attachments
```
POST   /api/chat/attachments/upload
GET    /api/chat/attachments/{id}
```

#### Polls
```
POST   /api/chat/polls
POST   /api/chat/polls/{id}/vote
GET    /api/chat/polls/{id}/results
```

#### Broadcasts
```
POST   /api/chat/broadcasts
GET    /api/chat/broadcasts
GET    /api/chat/broadcasts/{id}
POST   /api/chat/broadcasts/{id}/send
POST   /api/chat/broadcasts/{id}/schedule
```

#### Parent support / payment
```
POST   /api/chat/parent-support/{parent_id}/message
POST   /api/chat/payment-reminders/send
GET    /api/chat/payment-card/{invoice_id}
```

#### Devices / push
```
POST   /api/chat/devices/register
DELETE /api/chat/devices/{id}
```

---

## 11. WebSocket events

### Клиент → сервер
```
chat.connect
chat.join_conversation
chat.leave_conversation
chat.send_message
chat.mark_read
chat.typing_start
chat.typing_stop
```

### Сервер → клиент
```
chat.message_created
chat.message_updated
chat.message_deleted
chat.read_updated
chat.typing
chat.conversation_updated
chat.user_presence
chat.poll_updated
chat.payment_card_updated
chat.system_notification
```

---

## 12. UI в веб-портале

### 12.1. Новый раздел

Добавить в навигацию: `/messages`

### 12.2. Структура интерфейса

**Для всех ролей:**
- Список чатов слева
- Активный чат справа
- Поиск по чатам
- Unread badges
- Поле ввода + вложения + emoji/sticker picker

**Для менеджеров / админов — дополнительные вкладки:**
- Рассылки
- Опросы
- Шаблоны
- Модерация

### 12.3. Точки входа в существующем интерфейсе

| Страница | Точка входа |
|----------|-------------|
| GroupsPage | Кнопка «Открыть чат группы» |
| LessonsPage | Кнопка «Отправить напоминание в чат» / «Открыть чат группы» |
| StudentsPage | Кнопка «Коммуникации по ученику» |
| SalesDebtsPage | Кнопка «Напомнить об оплате» / «Открыть чат родителя» |
| parent-dashboard | Блоки: чат, оплата, опросы, уведомления |

---

## 13. Мобильное приложение

### 13.1. Технология

**React Native** — рекомендуется по причинам:
- Близость к текущему React + TypeScript стеку
- Удобно разделять типы и API-контракты
- Быстрее разработка, чем отдельные нативные приложения

### 13.2. Основные экраны

**Общие:**
- Splash / Login / Forgot password
- Chat list / Conversation screen
- Notifications center / Profile

**Для ученика:** Chats, Group chat, Schedule, Polls, Media viewer

**Для родителя:** Support chat, Payment card screen, Child schedule, Notifications, Polls

**Для тренера:** My groups, Group chats, Send announcement, Polls, Files/materials

### 13.3. Mobile UX требования

- Deep links из push
- Отправка фото / видео
- Список чатов с badge
- Lazy loading истории
- Устойчивость к плохому интернету
- Локальное кэширование последних сообщений

---

## 14. Бизнес-правила

### 14.1. Создание чатов

- При создании группы → создаётся групповой чат
- При назначении тренера → добавляется в чат
- При зачислении ученика → добавляется в чат группы
- При исключении ученика → деактивируется как участник

### 14.2. Родительские чаты

- Один родитель — один основной support chat
- Если несколько детей — чат единый, но с контекстными карточками по каждому ребёнку

### 14.3. Напоминания

- Создаются автоматически по `LessonInstance`
- Перенос занятия → старое напоминание отменяется, новое создаётся
- Отмена занятия → системное уведомление в чат

### 14.4. Оплата

- Если счёт просрочен → можно отправить payment reminder
- После оплаты → сообщение обновляется
- Родитель имеет доступ к оплате из чата и из dashboard

---

## 15. Ограничения первой версии

**НЕ включать в v1:**

- Голосовые / видеозвонки
- Свободные личные чаты всех учеников со всеми
- Сложное удаление сообщений «для всех»
- E2E-шифрование
- Каналы как в Telegram
- Боты со сложным сценарием поведения

---

## 16. Этапы разработки

### Этап 1. Базовый мессенджер

- Роль `student` + связь `user_id` в `Student`
- Таблицы чатов
- Групповые чаты + родительский support chat
- Отправка сообщений + статус прочтения
- Вложения (файлы, изображения)
- Push devices registration
- Базовый мобильный логин + чат-экран
- Системные напоминания о занятиях
- Payment card в чате родителя

### Этап 2. Коммуникации и управление

- Рассылки (broadcasts)
- Опросы (polls)
- Шаблоны сообщений
- Логи модерации
- Стикеры + GIF
- Unread counters (Redis)
- Archive / mute

### Этап 3. Масштабирование

- Redis pub/sub для realtime
- Очередь задач (Celery/Dramatiq)
- Media processing (thumbnail, video)
- Analytics dashboard
- Расширенные сегменты рассылки
- Optional: личные чаты между учениками с политиками

---

## 17. Приоритеты разработки

### Критично (P0)

- Student accounts
- Group chats
- Parent support chat
- Push notifications
- Lesson reminders
- Payment button in chat
- Mobile app authentication
- Permission checks

### Важно (P1)

- Вложения
- Опросы
- Рассылки
- Статус прочтения
- Шаблоны сообщений

### Можно позже (P2)

- Личные чаты учеников
- Продвинутый дашборд модерации
- Маркетплейс стикеров
- Analytics dashboards

---

## 18. Риски проекта

### Технические

- APScheduler внутри FastAPI слаб при росте нагрузки → нужен отдельный worker
- Без Redis realtime и broadcasts будут хрупкими
- Без object storage видео быстро перегрузят систему
- Крупные страницы frontend затрудняют интеграцию UI мессенджера

### Продуктовые

- Открытые чаты между всеми учениками → хаос
- Не продуманные права → родители получат лишний доступ
- Плохой deep link / push → слабый мобильный UX

### Организационные

- Нужно определить политику общения детей заранее
- Определить, кто модерирует спорные ситуации
- Определить SLA ответа службы заботы

---

## 19. Итоговая фраза для команды

> Нужно разработать **встроенный коммуникационный модуль**, а не «отдельный мессенджер», который использует текущие сущности портала, связывается с группами, уроками и оплатами, работает в вебе и мобильном приложении, разделяет сценарии учеников, родителей, тренеров и менеджеров, поддерживает чаты, push, рассылки, опросы и оплату из чата.
