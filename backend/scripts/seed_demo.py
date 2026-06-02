"""
Seed-скрипт для наполнения демо-данными Learning Portal.
Запуск: python scripts/seed_demo.py

Создаёт:
- 6 пользователей (по одному на каждую роль)
- 4 тренера
- 10 родителей
- 35 учеников
- 5 программ (с модулями и темами)
- 8 групп
- Абонементы, счета, транзакции
- 30 лидов для сейлза
- Finance Hub данные (счета, транзакции, долги)
- Задачи, комментарии
"""

import os
import sys
import random
from datetime import date, datetime, timedelta, timezone

# Добавляем путь к приложению
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.auth import get_password_hash

from app.models import (
    User, UserRole, Student, StudentStatus, StudentAccount, StudentAccountTransaction,
    StudentAccountTransactionKind, Abonement, AbonementStatus, Group, GroupStatus,
    GroupStudent, GroupSchedule, GroupProgram, Program, ProgramStatus, Module, Topic,
    TopicStatus, StudentProgram, StudentProgramLinkStatus, Grade, Lead, LeadStatus,
    LeadTask, LeadTaskStatus, LeadSource, PersonalFinanceAccount, PersonalFinanceCategory,
    PersonalFinanceDirection, PersonalFinanceTransaction, FinanceTarget, FinanceAccount,
    FinanceAccountOwnerScope, FinanceArticle, FinanceArticleDirection, FinanceArticleCostKind,
    FinanceArticleScope, FinanceTransaction, FinanceTransactionDirection, FinanceTransactionStatus,
    FinanceHubDebt, FinanceHubAllocation, ProgramTrainer,
)

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://learning_user:change_me_strong_password@localhost:5432/learning_portal"
)

engine = create_engine(DATABASE_URL)
Session = sessionmaker(bind=engine)
db = Session()

rng = random.Random(42)  # фиксированный seed для воспроизводимости

# ─── Казахстанские имена ───────────────────────────────────────────────────

TRAINER_NAMES = [
    "Айгерим Сейткали", "Нурлан Бекенов", "Дана Ахметова", "Марат Жумабеков",
]

PARENT_NAMES = [
    "Гульнара Нурмаганбетова", "Асель Токтарова", "Болат Сейткали",
    "Динара Жакупова", "Ержан Тлеубаев", "Карина Мустафина",
    "Руслан Абенов", "Светлана Ким", "Тимур Ахметов", "Зарина Бекова",
]

STUDENT_NAMES = [
    "Алишер Нурмаганбетов", "Айару Токтарова", "Санжар Сейткали",
    "Малика Жакупова", "Данияр Тлеубаев", "Сабина Мустафина",
    "Ерлан Абенов", "Жансая Ким", "Бауыржан Ахметов", "Айгерим Бекова",
    "Нурдаулет Сарсенбаев", "Диана Касымова", "Рустам Елеусинов",
    "Камила Оспанова", "Асхат Нурпеисов", "Аяулым Дюсупова",
    "Мади Жексенбаев", "Лейла Серикбаева", "Нурсулу Байгалиева",
    "Темирлан Досмагамбетов", "Арузат Мусина", "Ерасыл Бейсенов",
    "Жулдыз Абдикаримова", "Максат Кенжебаев", "Ақерке Сулейменова",
    "Нуржан Қасымов", "Айдана Омарова", "Берик Жанабеков",
    "Гулим Рахимова", "Ерден Тохтаров", "Зияда Сагинтаева",
    "Арайлым Мұратова", "Дулат Тастанбеков", "Қуаныш Ергалиев",
    "Назерке Алибекова",
]

LEAD_NAMES = [
    "Алия Сатыбалдина", "Бакытжан Жунусов", "Венера Ибраева",
    "Гульмира Токсанова", "Дамир Сериков", "Елена Захарова",
    "Жанар Бектурова", "Зоя Попова", "Ибрагим Нуров", "Карлыгаш Смагулова",
    "Лариса Кузнецова", "Мира Байжанова", "Назым Кенесова",
    "Олег Петров", "Перизат Касенова", "Роза Ахметбекова",
    "Самал Ерланова", "Тамара Соколова", "Улжан Мурзина",
    "Фарида Садыкова", "Хабиба Досова", "Цветана Яковлева",
    "Шолпан Аубакирова", "Эльмира Баймагамбетова", "Юлия Романова",
    "Ясмин Наурызбаева", "Алтынай Жаркынбаева", "Бибигуль Сыздыкова",
    "Гульбану Мусабекова", "Дильнара Абдрахманова",
]

# ─── Helpers ──────────────────────────────────────────────────────────────

def hashed(password: str) -> str:
    return get_password_hash(password)

def phone(i: int) -> str:
    return f"+7701{i:07d}"

def rand_date(days_back: int = 365) -> date:
    return date.today() - timedelta(days=rng.randint(0, days_back))

def rand_past_dt(days_back: int = 180) -> datetime:
    return datetime.now(timezone.utc) - timedelta(days=rng.randint(0, days_back), hours=rng.randint(0, 23))

# ─── Проверка: не запускать дважды ────────────────────────────────────────

existing = db.query(User).filter(User.email == "owner@demo.kz").first()
if existing:
    print("⚠️  Демо-данные уже существуют (owner@demo.kz найден).")
    print("   Чтобы сбросить — удалите пользователя owner@demo.kz из БД и запустите снова.")
    print("   Для удаления: docker exec -it learning-portal-backend-1 psql $DATABASE_URL -c \"DELETE FROM users WHERE email LIKE '%@demo.kz';\"")
    sys.exit(0)

print("🌱 Наполняю базу демо-данными...")

# ═══════════════════════════════════════════════════════════════════════════
# 1. ПОЛЬЗОВАТЕЛИ
# ═══════════════════════════════════════════════════════════════════════════

print("  👤 Создаю пользователей...")

owner = User(
    email="owner@demo.kz", hashed_password=hashed("Demo1234!"),
    full_name="Азамат Бекжанов", role=UserRole.OWNER,
    phone="+77011000001", is_active=True,
)
db.add(owner)

admin = User(
    email="admin@demo.kz", hashed_password=hashed("Demo1234!"),
    full_name="Айнур Жексенбаева", role=UserRole.ADMIN,
    phone="+77011000002", is_active=True,
)
db.add(admin)

sales = User(
    email="sales@demo.kz", hashed_password=hashed("Demo1234!"),
    full_name="Дарья Соколова", role=UserRole.SALES,
    phone="+77011000003", is_active=True,
)
db.add(sales)

guest = User(
    email="guest@demo.kz", hashed_password=hashed("Demo1234!"),
    full_name="Гость Платформы", role=UserRole.GUEST,
    is_active=True,
)
db.add(guest)

db.flush()

# Тренеры
trainers = []
for i, name in enumerate(TRAINER_NAMES):
    t = User(
        email=f"trainer{i+1}@demo.kz",
        hashed_password=hashed("Demo1234!"),
        full_name=name,
        role=UserRole.TRAINER,
        phone=phone(2000 + i),
        is_active=True,
        trainer_rate=rng.choice([3000, 3500, 4000]),
        trainer_rate_per_hour=rng.choice([5000, 6000, 7000]),
        trainer_lesson_formats=rng.choice(["group", "individual", "both"]),
        city="Алматы",
    )
    db.add(t)
    trainers.append(t)

db.flush()

# Родители
parents = []
for i, name in enumerate(PARENT_NAMES):
    p = User(
        email=f"parent{i+1}@demo.kz",
        hashed_password=hashed("Demo1234!"),
        full_name=name,
        role=UserRole.PARENT,
        phone=phone(3000 + i),
        is_active=True,
    )
    db.add(p)
    parents.append(p)

db.flush()

print(f"  ✅ {4 + len(trainers) + len(parents)} пользователей создано")

# ═══════════════════════════════════════════════════════════════════════════
# 2. АБОНЕМЕНТЫ
# ═══════════════════════════════════════════════════════════════════════════

print("  📋 Создаю абонементы...")

abonements_data = [
    ("Стандарт (8 занятий)", 24000, 8, "group"),
    ("Интенсив (12 занятий)", 33600, 12, "group"),
    ("Индивидуальный", 40000, 8, "individual"),
    ("Пакет Лайт (4 занятия)", 13000, 4, "group"),
    ("Годовой (96 занятий)", 240000, 96, "package"),
]

abonements = []
for name, price, lessons, fmt in abonements_data:
    a = Abonement(
        name=name, price=price, lessons_count=lessons,
        abonement_format=fmt, status=AbonementStatus.ACTIVE,
    )
    db.add(a)
    abonements.append(a)

db.flush()

# ═══════════════════════════════════════════════════════════════════════════
# 3. ПРОГРАММЫ С МОДУЛЯМИ И ТЕМАМИ
# ═══════════════════════════════════════════════════════════════════════════

print("  📚 Создаю программы...")

programs_data = [
    ("Первый шаг в программирование", [
        ("Основы", ["Знакомство с компьютером", "Алгоритмы в жизни", "Scratch: первые шаги", "Создаём анимацию"]),
        ("Проекты", ["Игра «Кот и мышь»", "Интерактивная открытка", "Мини-квест", "Итоговый проект"]),
    ]),
    ("Python Junior", [
        ("Базовый Python", ["Переменные и типы", "Условия и циклы", "Функции", "Списки и словари"]),
        ("Практика", ["Черепашья графика", "Игра на консоли", "Работа с файлами", "Финальный проект"]),
    ]),
    ("Web-разработка (HTML/CSS)", [
        ("HTML", ["Структура страницы", "Теги и атрибуты", "Формы", "Семантика"]),
        ("CSS", ["Стили и селекторы", "Flexbox", "Grid", "Адаптивность"]),
        ("Проект", ["Лендинг", "Портфолио", "Публикация"]),
    ]),
    ("Python Средний", [
        ("ООП", ["Классы и объекты", "Наследование", "Полиморфизм", "Паттерны"]),
        ("Базы данных", ["SQL основы", "SQLite", "ORM", "Проект с БД"]),
    ]),
    ("Алгоритмы и структуры данных", [
        ("Базовые структуры", ["Массивы и стеки", "Очереди", "Связные списки", "Деревья"]),
        ("Алгоритмы", ["Сортировки", "Поиск", "Рекурсия", "Динамическое программирование"]),
    ]),
]

all_programs = []
all_topics = []  # SimpleNamespace с .id и .module_id

import sqlalchemy as _sa
from types import SimpleNamespace as _NS

for prog_name, modules_data in programs_data:
    prog = Program(name=prog_name, version=1)
    db.add(prog)
    db.flush()
    all_programs.append(prog)

    for mod_order, (mod_name, topic_names) in enumerate(modules_data):
        # Raw SQL для модуля — обходим enum cast для status
        mod_row = db.execute(_sa.text(
            "INSERT INTO modules (program_id, name, \"order\") VALUES (:pid, :name, :ord) RETURNING id"
        ), {"pid": prog.id, "name": mod_name, "ord": mod_order}).fetchone()
        mod_id = mod_row[0]

        for top_order, top_name in enumerate(topic_names):
            # Raw SQL для темы — минуем TypeDecorator + batch-insert
            t_row = db.execute(_sa.text(
                "INSERT INTO topics (module_id, name, description, final_result, \"order\") "
                "VALUES (:mid, :name, :desc, :fr, :ord) RETURNING id"
            ), {
                "mid": mod_id,
                "name": top_name,
                "desc": f"Тема «{top_name}» программы «{prog_name}»",
                "fr": f"Ученик умеет применять {top_name.lower()} на практике",
                "ord": top_order,
            }).fetchone()
            all_topics.append(_NS(id=t_row[0], module_id=mod_id, prog_id=prog.id))

db.flush()
print(f"  ✅ {len(all_programs)} программ, {len(all_topics)} тем")

# ═══════════════════════════════════════════════════════════════════════════
# 4. ГРУППЫ
# ═══════════════════════════════════════════════════════════════════════════

print("  👥 Создаю группы...")

groups_data = [
    ("Первый шаг — Группа А", "first_step", 0, 0),
    ("Первый шаг — Группа Б", "first_step", 1, 2),
    ("Python Junior — Утро", "specialist", 1, 0),
    ("Python Junior — Вечер", "specialist", 0, 3),
    ("Web-разработка", "specialist", 2, 1),
    ("Python Средний", "expert", 3, 0),
    ("Алгоритмы", "expert", 2, 1),
    ("Индивидуальные занятия", "specialist", 0, 2),
]

all_groups = []
schedules = [
    [(0, "10:00", "11:30"), (2, "10:00", "11:30")],  # Пн, Ср
    [(1, "15:00", "16:30"), (3, "15:00", "16:30")],  # Вт, Чт
    [(0, "17:00", "18:30"), (4, "17:00", "18:30")],  # Пн, Пт
    [(2, "12:00", "13:30"), (4, "12:00", "13:30")],  # Ср, Пт
]

from datetime import time as dtime

for i, (name, direction, prog_idx, trainer_idx) in enumerate(groups_data):
    g = Group(
        name=name,
        direction=direction,
        trainer_id=trainers[trainer_idx].id,
        lesson_format="individual" if "Индивидуальные" in name else "group",
        units_per_session=2 if direction == "first_step" else 1,
        start_date=date.today() - timedelta(days=rng.randint(30, 180)),
    )
    db.add(g)
    db.flush()
    all_groups.append(g)

    # Связь группа ↔ программа
    gp = GroupProgram(group_id=g.id, program_id=all_programs[prog_idx].id)
    db.add(gp)

    # Расписание
    for day, start, end in schedules[i % len(schedules)]:
        h_s, m_s = map(int, start.split(":"))
        h_e, m_e = map(int, end.split(":"))
        gs = GroupSchedule(
            group_id=g.id, day_of_week=day,
            start_time=dtime(h_s, m_s), end_time=dtime(h_e, m_e)
        )
        db.add(gs)

    # Привязка тренера к программе
    pt = ProgramTrainer(program_id=all_programs[prog_idx].id, trainer_id=trainers[trainer_idx].id)
    # Может быть дубль — игнорируем при flush
    try:
        db.add(pt)
        db.flush()
    except Exception:
        db.rollback()
        db.flush()

db.flush()
print(f"  ✅ {len(all_groups)} групп создано")

# ═══════════════════════════════════════════════════════════════════════════
# 5. УЧЕНИКИ
# ═══════════════════════════════════════════════════════════════════════════

print("  🎓 Создаю учеников...")

all_students = []
students_per_group = {g.id: [] for g in all_groups}

for i, name in enumerate(STUDENT_NAMES):
    parent = parents[i % len(parents)]
    abo = abonements[i % 3]  # первые 3 абонемента
    is_archived = i >= 30

    s = Student(
        full_name=name,
        parent_id=parent.id,
        abonement_id=abo.id,
        training_start_date=rand_date(300),
    )
    db.add(s)
    db.flush()
    # Устанавливаем статус через raw SQL чтобы избежать enum cast проблемы
    if is_archived:
        db.execute(
            __import__('sqlalchemy').text("UPDATE students SET status = 'archived' WHERE id = :id"),
            {"id": s.id}
        )
    db.add(s)
    db.flush()
    all_students.append(s)

    # Счёт ученика
    acct = StudentAccount(student_id=s.id, name="Основной счёт", balance=rng.randint(0, 5) * abo.price / 8)
    db.add(acct)
    db.flush()

    # Несколько транзакций
    if not is_archived:
        for _ in range(rng.randint(2, 6)):
            pay_amount = abo.price
            tx = StudentAccountTransaction(
                account_id=acct.id,
                amount=pay_amount,
                kind=StudentAccountTransactionKind.PAYMENT,
                note=f"Оплата абонемента «{abo.name}»",
            )
            db.add(tx)

    # Добавляем в группу
    group = all_groups[i % len(all_groups)]
    if not is_archived and len(students_per_group[group.id]) < 8:
        gs = GroupStudent(group_id=group.id, student_id=s.id)
        db.add(gs)
        students_per_group[group.id].append(s.id)

        # Программа ученика
        prog_id = None
        gp_list = [gp for gp in db.query(GroupProgram).filter(GroupProgram.group_id == group.id).all()]
        if gp_list:
            prog_id = gp_list[0].program_id
            sp = StudentProgram(
                student_id=s.id, program_id=prog_id,
            )
            db.add(sp)
            db.flush()

            # Оценки по темам программы (all_topics — список SimpleNamespace)
            topics_for_prog = [t for t in all_topics if t.prog_id == prog_id]
            graded_count = rng.randint(2, min(8, len(topics_for_prog)))
            for topic in topics_for_prog[:graded_count]:
                grade_val = rng.randint(60, 100)
                g_obj = Grade(
                    student_id=s.id,
                    topic_id=topic.id,
                    trainer_id=group.trainer_id,
                    grade=grade_val,
                    comment=rng.choice([
                        "Отличная работа!", "Хорошо, но есть над чем поработать.",
                        "Продолжает расти.", "Нужно повторить материал.", None
                    ]),
                )
                db.add(g_obj)

db.flush()
print(f"  ✅ {len(all_students)} учеников, оценки выставлены")

# ═══════════════════════════════════════════════════════════════════════════
# 6. ЛИДЫ ДЛЯ СЕЙЛЗА
# ═══════════════════════════════════════════════════════════════════════════

print("  📞 Создаю лиды...")

lead_source = LeadSource(name="Инстаграм", is_active=True)
db.add(lead_source)
lead_source2 = LeadSource(name="Сайт", is_active=True)
db.add(lead_source2)
lead_source3 = LeadSource(name="Рекомендация", is_active=True)
db.add(lead_source3)
db.flush()

# Raw SQL статусы (enum в PG)
lead_statuses_pool = [
    "new", "new", "contacted", "no_answer", "demo", "thinking",
    "trial_scheduled", "invoice_sent", "won", "lost", "refused",
]
# Статусы при которых создаём задачу
task_statuses = {"contacted", "no_answer", "demo", "thinking"}

for i, name in enumerate(LEAD_NAMES):
    child_name = STUDENT_NAMES[i % len(STUDENT_NAMES)]
    status_val = lead_statuses_pool[i % len(lead_statuses_pool)]
    source = [lead_source, lead_source2, lead_source3][i % 3]
    comment = rng.choice([
        "Интересуется курсом Python", "Хочет записать ребёнка на пробный урок",
        "Спрашивала про расписание", "Уточняет стоимость", None, None,
    ])
    created = rand_past_dt(90)

    # Raw SQL — обходим native enum cast для status
    res = db.execute(_sa.text("""
        INSERT INTO leads (owner_id, contact_name, phone, parent_full_name,
            child_full_name, email, city, comment, source_id, created_at, status, questionnaire_filled)
        VALUES (:owner, :contact, :phone, :pfn, :cfn, :email, :city, :comment,
            :source, :created, CAST(:status AS leadstatus), false)
        RETURNING id
    """), {
        "owner": sales.id,
        "contact": name,
        "phone": phone(5000 + i),
        "pfn": name,
        "cfn": child_name,
        "email": f"lead{i+1}@example.kz",
        "city": "Алматы",
        "comment": comment,
        "source": source.id,
        "created": created,
        "status": status_val,
    })
    lead_id = res.scalar()

    # Задача по лиду (raw SQL для обхода enum)
    if status_val in task_statuses:
        task_note = rng.choice([
            "Перезвонить завтра", "Отправить программу", "Записать на пробный урок",
            "Уточнить возраст ребёнка", "Напомнить об оплате"
        ])
        due = datetime.combine(date.today() + timedelta(days=rng.randint(1, 14)),
                               datetime.min.time()).replace(tzinfo=timezone.utc)
        db.execute(_sa.text("""
            INSERT INTO lead_tasks (lead_id, owner_id, note, due_at, status)
            VALUES (:lead, :owner, :note, :due, CAST('open' AS leadtaskstatus))
        """), {"lead": lead_id, "owner": sales.id, "note": task_note, "due": due})

db.flush()
print(f"  ✅ {len(LEAD_NAMES)} лидов создано")

# ═══════════════════════════════════════════════════════════════════════════
# 7. FINANCE HUB — СЧЕТА, ТРАНЗАКЦИИ, ДОЛГИ
# ═══════════════════════════════════════════════════════════════════════════

print("  💰 Создаю финансовые данные...")

# Finance Targets (проекты)
targets_data = [
    ("academy", "КодАкадемия (основной)"),
    ("personal", "Личные финансы"),
    ("marketing", "Маркетинг"),
    ("infra", "Инфраструктура"),
]
ft_map = {}
for code, name in targets_data:
    existing_ft = db.query(FinanceTarget).filter(FinanceTarget.code == code).first()
    if not existing_ft:
        ft = FinanceTarget(code=code, name=name, is_active=True)
        db.add(ft)
        db.flush()
        ft_map[code] = ft
    else:
        ft_map[code] = existing_ft

# Finance Accounts (журнал)
fa_codes = [
    ("kaspi_main", "Kaspi Main", FinanceAccountOwnerScope.BUSINESS),
    ("halyk", "Halyk Bank", FinanceAccountOwnerScope.BUSINESS),
    ("cash", "Наличные", FinanceAccountOwnerScope.MIXED),
    ("personal_card", "Личная карта", FinanceAccountOwnerScope.PERSONAL),
]
fa_map = {}
for code, name, scope in fa_codes:
    existing_fa = db.query(FinanceAccount).filter(FinanceAccount.code == code).first()
    if not existing_fa:
        fa = FinanceAccount(code=code, name=name, owner_scope=scope, is_active=True)
        db.add(fa)
        db.flush()
        fa_map[code] = fa
    else:
        fa_map[code] = existing_fa

# Finance Articles
articles_data = [
    ("Оплаты учеников", FinanceArticleDirection.INCOME, FinanceArticleCostKind.VARIABLE, FinanceArticleScope.ACADEMY),
    ("Зарплата тренеров", FinanceArticleDirection.EXPENSE, FinanceArticleCostKind.VARIABLE, FinanceArticleScope.ACADEMY),
    ("Аренда офиса", FinanceArticleDirection.EXPENSE, FinanceArticleCostKind.FIXED, FinanceArticleScope.ACADEMY),
    ("Маркетинг", FinanceArticleDirection.EXPENSE, FinanceArticleCostKind.VARIABLE, FinanceArticleScope.ACADEMY),
    ("Личный доход владельца", FinanceArticleDirection.INCOME, FinanceArticleCostKind.NONE, FinanceArticleScope.PERSONAL),
    ("Личные расходы", FinanceArticleDirection.EXPENSE, FinanceArticleCostKind.VARIABLE, FinanceArticleScope.PERSONAL),
    ("Прочие доходы", FinanceArticleDirection.INCOME, FinanceArticleCostKind.NONE, FinanceArticleScope.ANY),
    ("Коммунальные", FinanceArticleDirection.EXPENSE, FinanceArticleCostKind.FIXED, FinanceArticleScope.ACADEMY),
]
article_map = {}
for art_name, direction, cost_kind, scope in articles_data:
    existing_art = db.query(FinanceArticle).filter(FinanceArticle.name == art_name).first()
    if not existing_art:
        art = FinanceArticle(name=art_name, direction=direction, cost_kind=cost_kind, scope=scope, is_active=True)
        db.add(art)
        db.flush()
        article_map[art_name] = art
    else:
        article_map[art_name] = existing_art

# Генерируем транзакции за последние 6 месяцев
income_article = article_map["Оплаты учеников"]
salary_article = article_map["Зарплата тренеров"]
rent_article = article_map["Аренда офиса"]
marketing_article = article_map["Маркетинг"]
util_article = article_map["Коммунальные"]
personal_inc_article = article_map["Личный доход владельца"]

fa_kaspi = fa_map["kaspi_main"]
fa_halyk = fa_map["halyk"]
ft_academy = ft_map["academy"]
ft_personal = ft_map["personal"]

for month_back in range(6, 0, -1):
    base_date = date.today().replace(day=1) - timedelta(days=month_back * 30)

    # Доходы от учеников (15-25 платежей в месяц)
    for j in range(rng.randint(15, 25)):
        student_name = rng.choice(STUDENT_NAMES)
        abo = rng.choice(abonements[:3])
        tx_date = base_date + timedelta(days=rng.randint(0, 28))
        tx = FinanceTransaction(
            occurred_at=datetime.combine(tx_date, datetime.min.time()).replace(tzinfo=timezone.utc),
            amount=abo.price,
            direction=FinanceTransactionDirection.INCOME,
            account_id=fa_kaspi.id,
            target_id=ft_academy.id,
            article_id=income_article.id,
            counterparty_name=student_name,
            description_raw=f"Оплата абонемента «{abo.name}» — {student_name}",
            status=FinanceTransactionStatus.APPLIED,
        )
        db.add(tx)

    # Зарплата тренеров (1 раз в месяц)
    for trainer in trainers:
        salary_amount = rng.randint(150000, 250000)
        tx_date = base_date + timedelta(days=25)
        tx = FinanceTransaction(
            occurred_at=datetime.combine(tx_date, datetime.min.time()).replace(tzinfo=timezone.utc),
            amount=-salary_amount,
            direction=FinanceTransactionDirection.EXPENSE,
            account_id=fa_kaspi.id,
            target_id=ft_academy.id,
            article_id=salary_article.id,
            counterparty_name=trainer.full_name,
            description_raw=f"Зарплата — {trainer.full_name}",
            status=FinanceTransactionStatus.APPLIED,
        )
        db.add(tx)

    # Аренда офиса
    rent_tx = FinanceTransaction(
        occurred_at=datetime.combine(base_date + timedelta(days=1), datetime.min.time()).replace(tzinfo=timezone.utc),
        amount=-120000,
        direction=FinanceTransactionDirection.EXPENSE,
        account_id=fa_kaspi.id,
        target_id=ft_academy.id,
        article_id=rent_article.id,
        description_raw=f"Аренда офиса за {base_date.strftime('%B %Y')}",
        status=FinanceTransactionStatus.APPLIED,
    )
    db.add(rent_tx)

    # Маркетинг
    mkt_tx = FinanceTransaction(
        occurred_at=datetime.combine(base_date + timedelta(days=5), datetime.min.time()).replace(tzinfo=timezone.utc),
        amount=-rng.randint(30000, 80000),
        direction=FinanceTransactionDirection.EXPENSE,
        account_id=fa_halyk.id,
        target_id=ft_academy.id,
        article_id=marketing_article.id,
        description_raw="Таргетированная реклама Instagram",
        status=FinanceTransactionStatus.APPLIED,
    )
    db.add(mkt_tx)

db.flush()

# Personal Finance Hub Accounts (для Finance Hub страницы)
pf_accounts_data = [
    ("Kaspi Gold", "bank", "KZT", rng.randint(300000, 800000), None),
    ("Наличные", "cash", "KZT", rng.randint(50000, 150000), None),
    ("USDT кошелёк", "crypto", "USD", rng.randint(500, 2000), None),
    ("Счёт Академии", "bank", "KZT", rng.randint(500000, 1500000), ft_map["academy"].id),
    ("Маркетинговый бюджет", "bank", "KZT", rng.randint(100000, 300000), ft_map["marketing"].id),
]

pf_acc_map = []
for acc_name, acc_type, currency, balance, project_id in pf_accounts_data:
    pf_acc = PersonalFinanceAccount(
        owner_id=owner.id,
        name=acc_name,
        account_type=acc_type,
        currency=currency,
        balance=float(balance),
        project_id=project_id,
        is_active=True,
    )
    db.add(pf_acc)
    db.flush()
    pf_acc_map.append(pf_acc)

# Personal Finance Categories
pf_cats = [
    ("Жильё", PersonalFinanceDirection.EXPENSE),
    ("Питание", PersonalFinanceDirection.EXPENSE),
    ("Транспорт", PersonalFinanceDirection.EXPENSE),
    ("Развлечения", PersonalFinanceDirection.EXPENSE),
    ("Дивиденды", PersonalFinanceDirection.INCOME),
    ("Фриланс", PersonalFinanceDirection.INCOME),
]
pf_cat_map = []
for cat_name, cat_dir in pf_cats:
    cat = PersonalFinanceCategory(owner_id=owner.id, name=cat_name, direction=cat_dir, is_active=True)
    db.add(cat)
    db.flush()
    pf_cat_map.append(cat)

# Personal Finance Transactions (последние 3 месяца)
income_cats = [c for c in pf_cat_map if c.direction == PersonalFinanceDirection.INCOME]
expense_cats = [c for c in pf_cat_map if c.direction == PersonalFinanceDirection.EXPENSE]
personal_acct = pf_acc_map[0]

for month_back in range(3, 0, -1):
    base_date = date.today().replace(day=1) - timedelta(days=month_back * 30)

    # Личный доход (дивиденды)
    pf_tx_inc = PersonalFinanceTransaction(
        owner_id=owner.id,
        account_id=personal_acct.id,
        category_id=income_cats[0].id,
        amount=rng.randint(200000, 350000),
        direction=PersonalFinanceDirection.INCOME,
        article="Дивиденды от Академии",
        hub_status="completed",
        occurred_at=datetime.combine(base_date + timedelta(days=10), datetime.min.time()).replace(tzinfo=timezone.utc),
    )
    db.add(pf_tx_inc)

    # Расходы
    for cat in expense_cats:
        amounts = {"Жильё": 150000, "Питание": 80000, "Транспорт": 50000, "Развлечения": 40000}
        amt = amounts.get(cat.name, 30000) + rng.randint(-10000, 10000)
        pf_tx_exp = PersonalFinanceTransaction(
            owner_id=owner.id,
            account_id=personal_acct.id,
            category_id=cat.id,
            amount=-abs(amt),
            direction=PersonalFinanceDirection.EXPENSE,
            article=cat.name,
            hub_status="completed",
            occurred_at=datetime.combine(base_date + timedelta(days=rng.randint(1, 25)), datetime.min.time()).replace(tzinfo=timezone.utc),
        )
        db.add(pf_tx_exp)

# Плановые транзакции (для блока "Планирование")
planned_txs = [
    (45000, "income", "project_revenue", "Ожидаемые оплаты учеников", "planned"),
    (120000, "expense", "salary", "Зарплата тренеров (следующий месяц)", "planned"),
    (80000, "income", "personal_income", "Дивиденды (прогноз)", "pending"),
    (40000, "expense", "tax", "НПД за квартал", "planned"),
]
next_month = date.today() + timedelta(days=15)
for amt, direction, category, desc, status in planned_txs:
    pf_planned = PersonalFinanceTransaction(
        owner_id=owner.id,
        account_id=pf_acc_map[0].id,
        amount=amt if direction == "income" else -amt,
        direction=PersonalFinanceDirection.INCOME if direction == "income" else PersonalFinanceDirection.EXPENSE,
        article=category,
        description=desc,
        hub_status=status,
        occurred_at=datetime.combine(next_month, datetime.min.time()).replace(tzinfo=timezone.utc),
    )
    db.add(pf_planned)

db.flush()

# Finance Hub Debts
debts_data = [
    ("Алибек (займ на маркетинг)", "owe", 500000, "KZT", 200000, date.today() + timedelta(days=30), "Займ на рекламную кампанию"),
    ("Налоговая (ИПН Q2)", "owe", 85000, "KZT", 0, date.today() - timedelta(days=5), "ИПН за 2 квартал — просрочен!"),
    ("Клиент Байжанов (предоплата)", "owed", 150000, "KZT", 0, date.today() + timedelta(days=7), "Предоплата за корпоративное обучение"),
    ("Партнёр КодАрена", "owed", 300000, "KZT", 100000, date.today() + timedelta(days=45), "Совместный проект — задолженность"),
]

for counterparty, dtype, amount, currency, paid, due, desc in debts_data:
    debt = FinanceHubDebt(
        owner_id=owner.id,
        debt_type=dtype,
        counterparty=counterparty,
        amount=amount,
        paid_amount=paid,
        currency=currency,
        due_date=due,
        description=desc,
        status="closed" if paid >= amount else ("partially_paid" if paid > 0 else "active"),
    )
    db.add(debt)

db.flush()
print(f"  ✅ Финансовые данные: счета, транзакции, долги")

# ═══════════════════════════════════════════════════════════════════════════
# ИТОГ
# ═══════════════════════════════════════════════════════════════════════════

db.commit()

print()
print("=" * 60)
print("✅ ДЕМО-ДАННЫЕ УСПЕШНО ЗАГРУЖЕНЫ!")
print("=" * 60)
print()
print("🔑 УЧЁТНЫЕ ЗАПИСИ (пароль для всех: Demo1234!)")
print()
print("  Роль     | Email                 | Имя")
print("  ---------|-----------------------|---------------------------")
print("  owner    | owner@demo.kz         | Азамат Бекжанов")
print("  admin    | admin@demo.kz         | Айнур Жексенбаева")
print("  sales    | sales@demo.kz         | Дарья Соколова")
print("  guest    | guest@demo.kz         | Гость Платформы")
for i, t in enumerate(trainers):
    print(f"  trainer  | trainer{i+1}@demo.kz      | {t.full_name}")
print("  parent   | parent1@demo.kz       | Гульнара Нурмаганбетова")
print("  ...      | parent2-10@demo.kz    | (10 родителей)")
print()
print("📊 ДАННЫЕ:")
print(f"  👤 Пользователей: {4 + len(trainers) + len(parents)}")
print(f"  🎓 Учеников: {len(all_students)}")
print(f"  👥 Групп: {len(all_groups)}")
print(f"  📚 Программ: {len(all_programs)}")
print(f"  📝 Тем для оценок: {len(all_topics)}")
print(f"  📞 Лидов: {len(LEAD_NAMES)}")
print(f"  💰 Finance Hub счетов: {len(pf_acc_map)}")
print(f"  🔴 Долгов: {len(debts_data)}")
print()
