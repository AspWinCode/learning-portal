"""
seed_full.py — расширенное наполнение всех use cases Learning Portal.
Запускать ПОСЛЕ seed_demo.py (требует наличия owner@demo.kz).

Добавляет:
- Посещаемость уроков (3 месяца, все группы)
- Пропуски и воронка отработок
- Характеристики учеников (draft / pending / approved)
- Карточки учеников (student_cards)
- Мероприятия + регистрации лидов
- Счета-фактуры (invoices) для лидов
- Задачи (tasks) для sales и owner
- Канбан-проекты со стадиями и карточками
- B2B-школы с контактами и взаимодействиями
- Выплаты тренеров (расчёты)
- Заморозки учеников
- Вопросы родителей тренеру
"""

import os, sys, random
from datetime import date, datetime, timedelta, timezone, time as dtime

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from app.models import (
    User, UserRole, Student, Group, GroupStudent, GroupSchedule,
    GroupProgram, Program, Topic, StudentProgram,
    LessonAttendance, AbsenceFollowUp,
    Characteristic, CharacteristicStatus,
    StudentCard, StudentFreeze,
    Event, EventStatus, EventRegistration, EventRegistrationStatus,
    Invoice, InvoiceStatus,
    Lead,
    Task, TaskSubtask,
    Project, ProjectStage, ProjectCard,
    B2BSchool, B2BSchoolContact, B2BSchoolInteraction,
    TrainerPayout, TrainerPeriodBonus,
    ParentQuestion,
)

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://learning_user:change_me_strong_password@localhost:5432/learning_portal"
)

engine = create_engine(DATABASE_URL)
Session = sessionmaker(bind=engine)
db = Session()

rng = random.Random(99)


# ── Проверка: seed_demo должен быть запущен ───────────────────────────────────
owner = db.query(User).filter(User.email == "owner@demo.kz").first()
if not owner:
    print("❌ owner@demo.kz не найден. Сначала запусти seed_demo.py")
    sys.exit(1)

print("🌱 Расширяю демо-данные (seed_full)...")

# ── Загружаем существующие данные ─────────────────────────────────────────────
admin   = db.query(User).filter(User.email == "admin@demo.kz").first()
sales   = db.query(User).filter(User.email == "sales@demo.kz").first()
trainers = db.query(User).filter(User.role == UserRole.TRAINER).all()
parents  = db.query(User).filter(User.role == UserRole.PARENT).all()
students = db.query(Student).all()
active_students = [s for s in students if s.status != "archived"]
groups   = db.query(Group).all()
leads    = db.query(Lead).all()
programs = db.query(Program).all()
topics   = db.query(Topic).all()

# ─────────────────────────────────────────────────────────────────────────────
# 1. ПОСЕЩАЕМОСТЬ УРОКОВ (LessonAttendance)
# ─────────────────────────────────────────────────────────────────────────────
print("  📅 Создаю посещаемость уроков...")

already_attendance = db.query(LessonAttendance).count()
if already_attendance > 0:
    print(f"  ⚠️  Посещаемость уже есть ({already_attendance} записей), пропускаю")
else:
    absence_reasons = ["sick", "olympiad", "other", None, None, None]  # в основном None = был
    call_results = ["contacted", "no_answer", "contacted", None]

    attendance_count = 0
    absences_created = []

    for group in groups:
        # Студенты группы
        gs_list = db.query(GroupStudent).filter(GroupStudent.group_id == group.id).all()
        if not gs_list:
            continue
        group_student_ids = [gs.student_id for gs in gs_list]

        # Расписание группы
        schedules = db.query(GroupSchedule).filter(GroupSchedule.group_id == group.id).all()
        if not schedules:
            continue

        # Генерируем уроки за последние 3 месяца
        today = date.today()
        start = today - timedelta(days=90)
        cur = start
        while cur <= today:
            for sched in schedules:
                if cur.weekday() == sched.day_of_week:
                    for sid in group_student_ids:
                        attended = rng.random() > 0.15  # 85% посещаемость
                        reason = None if attended else rng.choice(absence_reasons[:-3] + [None])
                        call_res = None if attended else rng.choice(call_results)
                        att = LessonAttendance(
                            group_id=group.id,
                            lesson_date=cur,
                            student_id=sid,
                            trainer_id=group.trainer_id,
                            attended=attended,
                            late=rng.random() < 0.05 if attended else False,
                            absence_reason=reason if not attended else None,
                            call_result=call_res,
                            lesson_start_time=sched.start_time,
                            lesson_end_time=sched.end_time,
                        )
                        db.add(att)
                        attendance_count += 1
                        if not attended and cur < today - timedelta(days=3):
                            absences_created.append((att, sid, group.id, cur))
            cur += timedelta(days=1)

    db.flush()
    print(f"  ✅ {attendance_count} записей посещаемости")

    # ── 2. ВОРОНКА ОТРАБОТОК (AbsenceFollowUp) ───────────────────────────────
    print("  🔄 Создаю воронку отработок...")
    stages = ["missed", "assigned", "made_up", "missed_makeup"]
    followup_count = 0
    for att_obj, sid, gid, ldate in absences_created[:20]:
        # Перезагружаем attendance чтобы получить id
        att_db = db.query(LessonAttendance).filter(
            LessonAttendance.group_id == gid,
            LessonAttendance.lesson_date == ldate,
            LessonAttendance.student_id == sid,
        ).first()
        if not att_db:
            continue
        fu = AbsenceFollowUp(
            lesson_attendance_id=att_db.id,
            student_id=sid,
            group_id=gid,
            lesson_date=ldate,
            stage=rng.choice(stages),
            absence_reason=att_db.absence_reason or "other",
        )
        db.add(fu)
        followup_count += 1
    db.flush()
    print(f"  ✅ {followup_count} записей воронки пропусков")

# ─────────────────────────────────────────────────────────────────────────────
# 3. ХАРАКТЕРИСТИКИ (Characteristic)
# ─────────────────────────────────────────────────────────────────────────────
print("  📝 Создаю характеристики учеников...")

char_count = db.query(Characteristic).count()
if char_count > 0:
    print(f"  ⚠️  Характеристики уже есть ({char_count}), пропускаю")
else:
    char_fields = [
        "Активность на уроке", "Выполнение домашних заданий",
        "Взаимодействие с одногруппниками", "Прогресс по программе",
        "Самостоятельность при выполнении заданий",
    ]
    char_statuses = [
        CharacteristicStatus.APPROVED,
        CharacteristicStatus.APPROVED,
        CharacteristicStatus.PENDING,
        CharacteristicStatus.DRAFT,
    ]
    char_comments = [
        "Отличный прогресс за месяц", "Нужно уделить внимание домашним заданиям",
        "Очень активен на занятиях", "Хорошо работает в команде",
        "Стабильный рост показателей",
    ]

    today = date.today()
    created_chars = 0
    for student in active_students[:25]:
        trainer = rng.choice(trainers)
        for month_back in [1, 2, 3]:
            target = today - timedelta(days=month_back * 30)
            month, year = target.month, target.year
            status = rng.choice(char_statuses)
            data = {field: rng.randint(3, 5) for field in char_fields}
            data["comment"] = rng.choice(char_comments)
            char = Characteristic(
                student_id=student.id,
                trainer_id=trainer.id,
                month=month,
                year=year,
                data=data,
                status=status,
                admin_comment="Хорошая работа тренера" if status == CharacteristicStatus.APPROVED else None,
                published_at=datetime.now(timezone.utc) - timedelta(days=month_back * 30 - 5)
                    if status == CharacteristicStatus.APPROVED else None,
            )
            db.add(char)
            created_chars += 1
    db.flush()
    print(f"  ✅ {created_chars} характеристик")

# ─────────────────────────────────────────────────────────────────────────────
# 4. КАРТОЧКИ УЧЕНИКОВ (StudentCard)
# ─────────────────────────────────────────────────────────────────────────────
print("  🪪 Создаю карточки учеников...")

sc_count = db.query(StudentCard).count()
if sc_count > 0:
    print(f"  ⚠️  Карточки уже есть ({sc_count}), пропускаю")
else:
    cities = ["Алматы", "Астана", "Шымкент"]
    schools = ["НИШ", "Школа №15", "Гимназия №68", "Лицей №134", "Назарбаев Интеллектуальная школа"]
    grades_list = ["3", "4", "5", "6", "7", "8", "9"]
    anketa_statuses = ["new", "filled", "sent", "agreed"]

    for i, student in enumerate(active_students[:30]):
        parent = parents[i % len(parents)]
        sc = StudentCard(
            student_id=student.id,
            student_full_name=student.full_name,
            parent_full_name=parent.full_name,
            birth_date=date(rng.randint(2010, 2016), rng.randint(1, 12), rng.randint(1, 28)),
            gender=rng.choice(["м", "ж"]),
            city=rng.choice(cities),
            school=rng.choice(schools),
            grade=rng.choice(grades_list),
            format_type=rng.choice(["group", "individual"]),
            anketa_status=rng.choice(anketa_statuses),
        )
        db.add(sc)
    db.flush()
    print(f"  ✅ 30 карточек учеников")

# ─────────────────────────────────────────────────────────────────────────────
# 5. МЕРОПРИЯТИЯ + РЕГИСТРАЦИИ (Event, EventRegistration)
# ─────────────────────────────────────────────────────────────────────────────
print("  🎪 Создаю мероприятия...")

ev_count = db.query(Event).count()
if ev_count > 0:
    print(f"  ⚠️  Мероприятия уже есть ({ev_count}), пропускаю")
else:
    events_data = [
        ("Открытый урок по Python", "Бесплатное занятие для знакомства с программированием", -14),
        ("День открытых дверей КодАкадемии", "Экскурсия по академии, пробные уроки, знакомство с тренерами", -7),
        ("Мастер-класс: Создай свою игру на Scratch", "Практический МК для детей 7-10 лет", 3),
        ("Олимпиада по программированию — отборочный тур", "Внутренняя олимпиада для учеников академии", 10),
        ("Вебинар: Профессии в IT для родителей", "Расскажем о карьерных путях в IT", 21),
    ]
    created_events = []
    for title, desc, days_offset in events_data:
        ev_date = datetime.now(timezone.utc) + timedelta(days=days_offset)
        ev = Event(
            title=title,
            description=desc,
            starts_at=ev_date,
            ends_at=ev_date + timedelta(hours=2),
            location="КодАкадемия, ул. Абая 10, каб. 201" if days_offset < 15 else "Zoom",
            capacity=rng.randint(15, 30),
            status=EventStatus.ACTIVE,
            created_by=owner.id,
        )
        db.add(ev)
        created_events.append(ev)
    db.flush()

    # Регистрируем лидов на прошедшие мероприятия
    reg_count = 0
    for ev in created_events:
        if ev.starts_at > datetime.now(timezone.utc):
            continue
        reg_leads = rng.sample(leads, min(len(leads), rng.randint(5, 12)))
        for lead in reg_leads:
            reg = EventRegistration(
                event_id=ev.id,
                lead_id=lead.id,
                owner_id=sales.id,
                status=rng.choice([
                    EventRegistrationStatus.REGISTERED,
                    EventRegistrationStatus.REGISTERED,
                    EventRegistrationStatus.CANCELLED,
                ]),
                note=rng.choice(["Подтвердил участие", "Перезвонить за день", None]),
            )
            db.add(reg)
            reg_count += 1
    db.flush()
    print(f"  ✅ {len(created_events)} мероприятий, {reg_count} регистраций")

# ─────────────────────────────────────────────────────────────────────────────
# 6. СЧЕТА-ФАКТУРЫ (Invoice)
# ─────────────────────────────────────────────────────────────────────────────
print("  🧾 Создаю счета-фактуры для лидов...")

inv_count = db.query(Invoice).count()
if inv_count > 0:
    print(f"  ⚠️  Счета уже есть ({inv_count}), пропускаю")
else:
    from app.models import Abonement
    abonements = db.query(Abonement).all()
    inv_statuses = [InvoiceStatus.SENT, InvoiceStatus.PAID, InvoiceStatus.PAID, InvoiceStatus.DRAFT, InvoiceStatus.OVERDUE]
    inv_created = 0
    won_leads = [l for l in leads if True][:15]
    for lead in won_leads:
        abo = rng.choice(abonements)
        status = rng.choice(inv_statuses)
        inv = Invoice(
            lead_id=lead.id,
            abonement_id=abo.id,
            amount=abo.price,
            currency="KZT",
            status=status,
            email_to=lead.email,
            sent_at=datetime.now(timezone.utc) - timedelta(days=rng.randint(1, 30))
                if status != InvoiceStatus.DRAFT else None,
            paid_at=datetime.now(timezone.utc) - timedelta(days=rng.randint(1, 15))
                if status == InvoiceStatus.PAID else None,
        )
        db.add(inv)
        inv_created += 1
    db.flush()
    print(f"  ✅ {inv_created} счетов-фактур")

# ─────────────────────────────────────────────────────────────────────────────
# 7. ЗАДАЧИ (Task)
# ─────────────────────────────────────────────────────────────────────────────
print("  ✅ Создаю задачи...")

task_count = db.query(Task).count()
if task_count > 0:
    print(f"  ⚠️  Задачи уже есть ({task_count}), пропускаю")
else:
    tasks_data = [
        # (title, category, assigned_to, priority, days_offset)
        ("Позвонить Алии Сатыбалдиной — уточнить решение", "leads", sales, "high", 0),
        ("Отправить программу курса Python родителям из мероприятия", "leads", sales, "normal", 1),
        ("Напомнить об оплате: Нурдаулет Сарсенбаев", "leads", sales, "high", 0),
        ("Записать 3 лидов на пробный урок на следующей неделе", "leads", sales, "normal", 2),
        ("Подготовить отчёт по конверсии за май", "leads", owner, "normal", 3),
        ("Обновить расписание групп на июнь", "schools", admin, "normal", 1),
        ("Проверить и подтвердить характеристики за май", "schools", admin, "high", 0),
        ("Связаться с директором школы №15 по B2B", "schools", sales, "normal", 5),
        ("Оплатить аренду офиса за июнь", "leads", owner, "high", 2),
        ("Запустить рекламную кампанию в Instagram", "leads", owner, "normal", 7),
        ("Составить план пробных уроков на следующий месяц", "leads", sales, "low", 10),
        ("Выставить расчёт тренерам за май", "schools", owner, "high", 0),
    ]
    created_tasks = 0
    for title, category, assigned, priority, days_offset in tasks_data:
        task = Task(
            title=title,
            category=category,
            created_by_id=owner.id,
            assigned_to_id=assigned.id if assigned else None,
            priority=priority,
            status="active",
            scheduled_for=date.today() + timedelta(days=days_offset),
            due_at=datetime.now(timezone.utc) + timedelta(days=days_offset, hours=20),
        )
        db.add(task)
        created_tasks += 1
    db.flush()
    print(f"  ✅ {created_tasks} задач")

# ─────────────────────────────────────────────────────────────────────────────
# 8. КАНБАН-ПРОЕКТЫ (Project, ProjectStage, ProjectCard)
# ─────────────────────────────────────────────────────────────────────────────
print("  📋 Создаю канбан-проекты...")

proj_count = db.query(Project).count()
if proj_count > 0:
    print(f"  ⚠️  Проекты уже есть ({proj_count}), пропускаю")
else:
    # Проект 1: Воронка родителей
    p1 = Project(
        name="Воронка родителей — Июнь 2026",
        entity_type="parent",
        description="Ведение лидов по воронке продаж: от первого контакта до оплаты",
        created_by_id=owner.id,
        start_date=date.today().replace(day=1),
        end_date=date.today().replace(day=1) + timedelta(days=30),
    )
    db.add(p1)
    db.flush()

    stages_p1 = ["Новый лид", "Первый контакт", "Демо-урок", "Думает", "Счёт отправлен", "Оплатил"]
    stage_objs_p1 = []
    for i, name in enumerate(stages_p1):
        s = ProjectStage(project_id=p1.id, name=name, position=i)
        db.add(s)
        stage_objs_p1.append(s)
    db.flush()

    # Раскладываем родителей по стадиям
    for i, parent in enumerate(parents):
        stage = stage_objs_p1[i % len(stage_objs_p1)]
        card = ProjectCard(
            project_id=p1.id,
            stage_id=stage.id,
            entity_type="parent",
            entity_id=parent.id,
            position=i // len(stage_objs_p1),
        )
        db.add(card)

    # Проект 2: Воронка учеников по программам
    p2 = Project(
        name="Прогресс учеников — Python Junior",
        entity_type="student",
        description="Отслеживание прогресса учеников по уровням программы",
        created_by_id=admin.id,
        start_date=date.today() - timedelta(days=60),
    )
    db.add(p2)
    db.flush()

    stages_p2 = ["Начальный уровень", "Базовый", "Уверенный", "Продвинутый", "Завершил курс"]
    stage_objs_p2 = []
    for i, name in enumerate(stages_p2):
        s = ProjectStage(project_id=p2.id, name=name, position=i)
        db.add(s)
        stage_objs_p2.append(s)
    db.flush()

    for i, student in enumerate(active_students[:15]):
        stage = stage_objs_p2[i % len(stage_objs_p2)]
        try:
            card = ProjectCard(
                project_id=p2.id,
                stage_id=stage.id,
                entity_type="student",
                entity_id=student.id,
                position=i // len(stage_objs_p2),
            )
            db.add(card)
            db.flush()
        except Exception:
            db.rollback()

    db.flush()
    print(f"  ✅ 2 проекта со стадиями и карточками")

# ─────────────────────────────────────────────────────────────────────────────
# 9. B2B-ШКОЛЫ (B2BSchool, B2BSchoolContact, B2BSchoolInteraction)
# ─────────────────────────────────────────────────────────────────────────────
print("  🏫 Создаю B2B-школы...")

b2b_count = db.query(B2BSchool).count()
if b2b_count > 0:
    print(f"  ⚠️  B2B-школы уже есть ({b2b_count}), пропускаю")
else:
    schools_data = [
        ("НИШ Алматы", "Абдуллаев Нурлан", "ул. Сейфуллина 597", "Алматы", 1200, "first_contact"),
        ("Гимназия №68", "Ержанова Айгуль", "пр. Алатау 12", "Алматы", 800, "letter_sent"),
        ("Назарбаев Интеллектуальная Школа", "Исаева Дина", "ул. Панфилова 25", "Алматы", 1500, "meeting_scheduled"),
        ("Лицей №134", "Тлеубеков Серик", "ул. Жибек Жолы 88", "Алматы", 650, "contact_found"),
        ("РФМШ", "Байжанов Арман", "пр. Достык 155", "Алматы", 900, "agreement"),
        ("Школа №15", "Омарова Жанна", "ул. Абая 44", "Астана", 700, "new"),
        ("Bilim Innovation Lyceum", "Сарсенов Даурен", "ул. Бейбитшилик 4", "Астана", 1100, "event_done"),
        ("Astana International School", "Ковалёва Елена", "пр. Туран 37", "Астана", 600, "leads_received"),
    ]

    created_b2b = []
    for name, director, address, city, count, stage in schools_data:
        school = B2BSchool(
            name=name,
            director=director,
            address=address,
            city=city,
            student_count=count,
            pipeline_stage=stage,
            friendship_degree=rng.choice(["unknown", "indirect", "friends"]),
            manager_id=sales.id,
            next_step=rng.choice([
                "Позвонить директору", "Отправить письмо поддержки",
                "Согласовать дату мероприятия", "Подписать договор", None,
            ]),
            next_step_date=date.today() + timedelta(days=rng.randint(1, 14)) if rng.random() > 0.3 else None,
        )
        db.add(school)
        db.flush()
        created_b2b.append(school)

        # Контакты
        for j in range(rng.randint(1, 3)):
            contact = B2BSchoolContact(
                b2b_school_id=school.id,
                full_name=rng.choice([
                    "Сейткали Айгерим", "Нурланов Болат", "Жакупова Динара",
                    "Ахметов Тимур", "Бекова Зарина", "Мустафин Ержан",
                ]),
                position=rng.choice(["Директор", "Завуч", "Учитель информатики", "Классный руководитель"]),
                phone=f"+7701{rng.randint(1000000, 9999999)}",
            )
            db.add(contact)

        # Взаимодействия
        for k in range(rng.randint(1, 4)):
            inter = B2BSchoolInteraction(
                b2b_school_id=school.id,
                type=rng.choice(["call", "letter", "meeting"]),
                happened_at=datetime.now(timezone.utc) - timedelta(days=rng.randint(1, 60)),
                summary=rng.choice([
                    "Познакомились с директором, договорились о встрече",
                    "Отправили письмо с предложением сотрудничества",
                    "Провели вводный урок для 7-го класса — 25 учеников",
                    "Директор попросил прислать программу курсов",
                    "Подтвердили дату мероприятия на следующий месяц",
                    "Нет ответа, перезвонить через неделю",
                ]),
                created_by_id=sales.id,
            )
            db.add(inter)

    db.flush()
    print(f"  ✅ {len(created_b2b)} B2B-школ с контактами и взаимодействиями")

# ─────────────────────────────────────────────────────────────────────────────
# 10. ВЫПЛАТЫ ТРЕНЕРОВ (TrainerPayout, TrainerPeriodBonus)
# ─────────────────────────────────────────────────────────────────────────────
print("  💸 Создаю выплаты тренеров...")

payout_count = db.query(TrainerPayout).count()
if payout_count > 0:
    print(f"  ⚠️  Выплаты уже есть ({payout_count}), пропускаю")
else:
    payout_created = 0
    for trainer in trainers:
        for month_back in range(1, 4):
            target = date.today() - timedelta(days=month_back * 30)
            period = target.strftime("%Y-%m")
            lessons = rng.randint(32, 56)
            hours = lessons * 1.5
            rate_lesson = trainer.trainer_rate or 3500
            rate_hour = trainer.trainer_rate_per_hour or 6000
            base = lessons * rate_lesson
            bonus_val = rng.choice([0, 0, 5000, 10000, 15000])
            total = base + bonus_val

            payout = TrainerPayout(
                trainer_id=trainer.id,
                period=period,
                lessons_count=lessons,
                hours_count=hours,
                rate_per_lesson=rate_lesson,
                rate_per_hour=rate_hour,
                base_payment=base,
                bonus=bonus_val,
                total=total,
                paid_at=datetime.now(timezone.utc) - timedelta(days=month_back * 30 - 25),
            )
            db.add(payout)
            payout_created += 1

            if bonus_val > 0:
                bonus = TrainerPeriodBonus(
                    trainer_id=trainer.id,
                    period=period,
                    bonus=bonus_val,
                )
                db.add(bonus)
    db.flush()
    print(f"  ✅ {payout_created} выплат тренеров")

# ─────────────────────────────────────────────────────────────────────────────
# 11. ЗАМОРОЗКИ УЧЕНИКОВ (StudentFreeze)
# ─────────────────────────────────────────────────────────────────────────────
print("  ❄️  Создаю заморозки учеников...")

freeze_count = db.query(StudentFreeze).count()
if freeze_count > 0:
    print(f"  ⚠️  Заморозки уже есть ({freeze_count}), пропускаю")
else:
    frozen_students = rng.sample(active_students, min(5, len(active_students)))
    for student in frozen_students:
        start = date.today() - timedelta(days=rng.randint(0, 15))
        end = start + timedelta(days=rng.randint(7, 21))
        freeze = StudentFreeze(
            student_id=student.id,
            freeze_start=start,
            freeze_end=end,
        )
        db.add(freeze)
    db.flush()
    print(f"  ✅ {len(frozen_students)} заморозок учеников")

# ─────────────────────────────────────────────────────────────────────────────
# 12. ВОПРОСЫ РОДИТЕЛЕЙ ТРЕНЕРУ (ParentQuestion)
# ─────────────────────────────────────────────────────────────────────────────
print("  💬 Создаю вопросы родителей...")

pq_count = db.query(ParentQuestion).count()
if pq_count > 0:
    print(f"  ⚠️  Вопросы уже есть ({pq_count}), пропускаю")
else:
    questions = [
        "Как мой ребёнок справляется с программой? Есть ли отставание?",
        "Можно ли получить дополнительные материалы для практики дома?",
        "Когда планируется следующая итоговая работа по теме?",
        "Ребёнок пропустил 2 урока — как лучше догнать программу?",
        "Можно ли перейти в другую группу — текущее время неудобно?",
        "Как оценить реальный прогресс ребёнка за 3 месяца?",
    ]
    pq_statuses = ["new", "answered", "new", "answered"]
    pq_created = 0
    for i, parent in enumerate(parents[:6]):
        student = active_students[i % len(active_students)]
        trainer = rng.choice(trainers)
        pq = ParentQuestion(
            parent_user_id=parent.id,
            student_id=student.id,
            target_trainer_id=trainer.id,
            topic=rng.choice(["Успеваемость", "Расписание", "Программа", "Пропуски"]),
            message=questions[i % len(questions)],
            status=rng.choice(pq_statuses),
        )
        db.add(pq)
        pq_created += 1
    db.flush()
    print(f"  ✅ {pq_created} вопросов от родителей")

# ─────────────────────────────────────────────────────────────────────────────
# КОММИТ
# ─────────────────────────────────────────────────────────────────────────────
db.commit()

print()
print("=" * 60)
print("✅ seed_full завершён успешно!")
print("=" * 60)
print()
print("📊 Добавлено:")
print("  📅 Посещаемость уроков — 3 месяца по всем группам")
print("  🔄 Воронка пропусков (absence_follow_ups)")
print("  📝 Характеристики учеников (draft/pending/approved)")
print("  🪪 Карточки учеников (student_cards)")
print("  🎪 Мероприятия + регистрации лидов")
print("  🧾 Счета-фактуры для лидов")
print("  ✅ Задачи для owner/admin/sales")
print("  📋 Канбан-проекты с воронками")
print("  🏫 B2B-школы с контактами и взаимодействиями")
print("  💸 Выплаты тренеров (3 месяца)")
print("  ❄️  Заморозки учеников")
print("  💬 Вопросы родителей тренерам")
