from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import or_
from app.database import get_db
from app import auth
from app.schemas import ProgramCreate, ProgramResponse, ProgramUpdate
from app.models import (
    Program, Module, Topic, User, ProgramStatus, TopicStatus,
    ProgramTrainer, GroupProgram, StudentProgram, Grade, UserRole,
    Student, StudentStatus, GroupStudent, Group
)
from app.routers.action_log import log_action

router = APIRouter()


def check_topics_have_grades(db: Session, topic_ids: List[int]) -> bool:
    """Проверка наличия оценок по темам"""
    return db.query(Grade).filter(Grade.topic_id.in_(topic_ids)).count() > 0


def ensure_program_trainer(db: Session, program_id: int, trainer_id: int) -> None:
    """
    Ensure trainer is attached to program (ProgramTrainer row exists).
    Used to keep program visibility and grading consistent with group ownership.
    """
    existing = db.query(ProgramTrainer).filter(
        ProgramTrainer.program_id == program_id,
        ProgramTrainer.trainer_id == trainer_id
    ).first()
    if existing:
        return
    db.add(ProgramTrainer(program_id=program_id, trainer_id=trainer_id))


@router.post("/", response_model=ProgramResponse, status_code=status.HTTP_201_CREATED)
async def create_program(
    program: ProgramCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["admin"]))
):
    """Создание программы обучения"""
    db_program = Program(
        name=program.name,
        version=1,
        status=ProgramStatus.ACTIVE
    )
    db.add(db_program)
    db.commit()
    db.refresh(db_program)
    
    # Создание модулей и тем
    for module_data in program.modules:
        db_module = Module(
            program_id=db_program.id,
            name=module_data.name,
            order=module_data.order,
            status=ProgramStatus.ACTIVE
        )
        db.add(db_module)
        db.flush()
        
        for topic_data in module_data.topics:
            db_topic = Topic(
                module_id=db_module.id,
                name=topic_data.name,
                description=topic_data.description,
                final_result=topic_data.final_result,
                order=topic_data.order,
                status=TopicStatus.ACTIVE
            )
            db.add(db_topic)
    
    # Привязка тренеров
    if program.trainer_ids:
        for trainer_id in program.trainer_ids:
            program_trainer = ProgramTrainer(
                program_id=db_program.id,
                trainer_id=trainer_id
            )
            db.add(program_trainer)
    
    db.commit()
    db.refresh(db_program)
    
    log_action(db, current_user.id, "create", "program", db_program.id)
    return db_program


@router.get("/", response_model=List[ProgramResponse])
async def read_programs(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user)
):
    """Получение списка программ"""
    query = db.query(Program)

    # Гость видит только активные программы
    if current_user.role == UserRole.GUEST:
        query = query.filter(Program.status == ProgramStatus.ACTIVE)
        programs = query.offset(skip).limit(limit).all()
        return programs
    
    # Тренер видит только программы, к которым привязан
    if current_user.role == UserRole.TRAINER:
        query = query.join(ProgramTrainer).filter(
            ProgramTrainer.trainer_id == current_user.id
        )

    # Родитель видит только программы, назначенные его активным ученикам (напрямую или через группу)
    elif current_user.role == UserRole.PARENT:
        direct_program_ids = (
            db.query(StudentProgram.program_id)
            .join(Student, Student.id == StudentProgram.student_id)
            .filter(Student.parent_id == current_user.id, Student.status == StudentStatus.ACTIVE)
            .subquery()
        )
        group_program_ids = (
            db.query(GroupProgram.program_id)
            .join(GroupStudent, GroupStudent.group_id == GroupProgram.group_id)
            .join(Student, Student.id == GroupStudent.student_id)
            .filter(Student.parent_id == current_user.id, Student.status == StudentStatus.ACTIVE)
            .subquery()
        )
        query = query.filter(or_(Program.id.in_(direct_program_ids), Program.id.in_(group_program_ids))).distinct()
    
    programs = query.offset(skip).limit(limit).all()
    return programs


@router.get("/{program_id}", response_model=ProgramResponse)
async def read_program(
    program_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user)
):
    """Получение программы по ID"""
    program_query = db.query(Program).filter(Program.id == program_id)
    if current_user.role == UserRole.GUEST:
        program_query = program_query.filter(Program.status == ProgramStatus.ACTIVE)
    program = program_query.first()
    if program is None:
        raise HTTPException(status_code=404, detail="Program not found")

    # RBAC: тренер может читать только программы, к которым привязан
    if current_user.role == UserRole.TRAINER:
        has_access = db.query(ProgramTrainer).filter(
            ProgramTrainer.program_id == program_id,
            ProgramTrainer.trainer_id == current_user.id
        ).first()
        if not has_access:
            raise HTTPException(status_code=403, detail="Not enough permissions")

    # RBAC: родитель может читать только программы, назначенные его активным ученикам
    if current_user.role == UserRole.PARENT:
        has_direct = db.query(StudentProgram).join(Student).filter(
            StudentProgram.program_id == program_id,
            Student.parent_id == current_user.id,
            Student.status == StudentStatus.ACTIVE
        ).first()
        has_group = db.query(GroupProgram).join(GroupStudent, GroupStudent.group_id == GroupProgram.group_id).join(Student).filter(
            GroupProgram.program_id == program_id,
            Student.parent_id == current_user.id,
            Student.status == StudentStatus.ACTIVE
        ).first()
        if not has_direct and not has_group:
            raise HTTPException(status_code=403, detail="Not enough permissions")

    return program


@router.put("/{program_id}", response_model=ProgramResponse)
async def update_program(
    program_id: int,
    program_update: ProgramUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["admin"]))
):
    """Обновление программы (с версионированием при существенных изменениях)"""
    db_program = db.query(Program).filter(Program.id == program_id).first()
    if db_program is None:
        raise HTTPException(status_code=404, detail="Program not found")
    
    update_data = program_update.dict(exclude_unset=True)
    
    # Проверка на существенные изменения (добавление/удаление тем)
    needs_versioning = False
    if "modules" in update_data:
        # Получаем текущие темы
        current_topic_ids = set()
        for module in db_program.modules:
            for topic in module.topics:
                current_topic_ids.add(topic.id)
        
        # Получаем новые темы
        new_topic_ids = set()
        for module_data in update_data["modules"]:
            for topic_data in module_data.get("topics", []):
                if hasattr(topic_data, "id") and topic_data.id:
                    new_topic_ids.add(topic_data.id)
        
        # Если темы добавлены или удалены - нужна новая версия
        if current_topic_ids != new_topic_ids:
            needs_versioning = True
    
    if needs_versioning:
        # Создаем новую версию
        new_program = Program(
            name=update_data.get("name", db_program.name),
            version=db_program.version + 1,
            parent_program_id=db_program.id,
            status=ProgramStatus.ACTIVE
        )
        db.add(new_program)
        db.flush()

        # Для новой версии создаём модули/темы прямо из payload.
        # Раньше мы копировали старые модули, а потом удаляли и пересоздавали — из-за этого
        # в сессии оставались "висячие" объекты и возникали FK ошибки.
        modules_payload = update_data.get("modules") or []
        for module_data in modules_payload:
            new_module = Module(
                program_id=new_program.id,
                name=module_data["name"],
                order=module_data.get("order", 0),
                status=ProgramStatus.ACTIVE
            )
            db.add(new_module)
            db.flush()

            for topic_data in module_data.get("topics", []):
                db.add(Topic(
                    module=new_module,
                    name=topic_data["name"],
                    description=topic_data.get("description"),
                    final_result=topic_data.get("final_result"),
                    order=topic_data.get("order", 0),
                    status=TopicStatus.ACTIVE
                ))

        # Автоматически архивируем базовую (старую) версию
        db_program.status = ProgramStatus.ARCHIVED

        # Автоматически переключаем назначения групп/учеников на новую версию
        # (чтобы везде сразу использовалась обновлённая программа)
        db.query(GroupProgram).filter(GroupProgram.program_id == db_program.id).update(
            {"program_id": new_program.id}, synchronize_session=False
        )
        db.query(StudentProgram).filter(StudentProgram.program_id == db_program.id).update(
            {"program_id": new_program.id}, synchronize_session=False
        )

        # Переносим видимость для тренеров: копируем привязки ProgramTrainer со старой версии на новую
        old_trainer_ids = db.query(ProgramTrainer.trainer_id).filter(ProgramTrainer.program_id == db_program.id).distinct().all()
        for (tid,) in old_trainer_ids:
            if tid:
                ensure_program_trainer(db, new_program.id, tid)

        # Также гарантируем видимость новой версии для тренеров групп, которые были назначены на старую версию
        # (если ProgramTrainer раньше не использовался)
        group_trainer_ids = db.query(Group.trainer_id).join(GroupProgram, GroupProgram.group_id == Group.id).filter(
            GroupProgram.program_id == new_program.id
        ).distinct().all()
        for (tid,) in group_trainer_ids:
            if tid:
                ensure_program_trainer(db, new_program.id, tid)
        
        db.commit()
        db.refresh(new_program)
        
        log_action(db, current_user.id, "create_version", "program", new_program.id, {
            "parent_id": program_id,
            "version": new_program.version
        })
        return new_program
    else:
        # Обычное обновление
        if "name" in update_data:
            db_program.name = update_data["name"]
        
        db.commit()
        db.refresh(db_program)
        
        log_action(db, current_user.id, "update", "program", program_id, update_data)
        return db_program


@router.post("/{program_id}/archive-topic/{topic_id}")
async def archive_topic(
    program_id: int,
    topic_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["admin"]))
):
    """Архивация темы (удаление запрещено)"""
    topic = db.query(Topic).filter(
        Topic.id == topic_id,
        Topic.module.has(Module.program_id == program_id)
    ).first()
    
    if not topic:
        raise HTTPException(status_code=404, detail="Topic not found")

    # Жёсткая целостность: нельзя архивировать тему, если по ней уже есть оценки
    has_grades = db.query(Grade).filter(Grade.topic_id == topic_id).count() > 0
    if has_grades:
        raise HTTPException(
            status_code=400,
            detail="Нельзя архивировать тему: по ней уже выставлены оценки"
        )
    
    # Всегда архивируем. История оценок должна сохраняться.
    topic.status = TopicStatus.ARCHIVED
    db.commit()
    log_action(db, current_user.id, "archive", "topic", topic_id)
    return {"message": "Topic archived"}


@router.post("/{program_id}/unarchive-topic/{topic_id}")
async def unarchive_topic(
    program_id: int,
    topic_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["admin"]))
):
    """Разархивация темы"""
    topic = db.query(Topic).filter(
        Topic.id == topic_id,
        Topic.module.has(Module.program_id == program_id)
    ).first()

    if not topic:
        raise HTTPException(status_code=404, detail="Topic not found")

    topic.status = TopicStatus.ACTIVE
    db.commit()
    log_action(db, current_user.id, "unarchive", "topic", topic_id)
    return {"message": "Topic unarchived"}


@router.post("/{program_id}/archive-module/{module_id}")
async def archive_module(
    program_id: int,
    module_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["admin"]))
):
    """Архивация модуля и его тем (удаление запрещено)"""
    module = db.query(Module).filter(
        Module.id == module_id,
        Module.program_id == program_id
    ).first()

    if not module:
        raise HTTPException(status_code=404, detail="Module not found")

    # Жёсткая целостность: нельзя архивировать модуль, если по его темам уже есть оценки
    topic_ids = [t.id for t in module.topics]
    if topic_ids and check_topics_have_grades(db, topic_ids):
        raise HTTPException(
            status_code=400,
            detail="Нельзя архивировать модуль: по темам в этом модуле уже выставлены оценки"
        )

    module.status = ProgramStatus.ARCHIVED
    for t in module.topics:
        t.status = TopicStatus.ARCHIVED

    db.commit()
    log_action(db, current_user.id, "archive", "module", module_id, {"program_id": program_id})
    return {"message": "Module archived"}


@router.post("/{program_id}/unarchive-module/{module_id}")
async def unarchive_module(
    program_id: int,
    module_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["admin"]))
):
    """Разархивация модуля и его тем"""
    module = db.query(Module).filter(
        Module.id == module_id,
        Module.program_id == program_id
    ).first()

    if not module:
        raise HTTPException(status_code=404, detail="Module not found")

    module.status = ProgramStatus.ACTIVE
    for t in module.topics:
        t.status = TopicStatus.ACTIVE

    db.commit()
    log_action(db, current_user.id, "unarchive", "module", module_id, {"program_id": program_id})
    return {"message": "Module unarchived"}


@router.post("/{program_id}/assign-to-group/{group_id}")
async def assign_program_to_group(
    program_id: int,
    group_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["admin"]))
):
    """Назначение программы группе"""
    program = db.query(Program).filter(Program.id == program_id).first()
    from app.models import Group
    group = db.query(Group).filter(Group.id == group_id).first()
    
    if not program or not group:
        raise HTTPException(status_code=404, detail="Program or group not found")
    
    # Заменяем назначение (версионирование: явное переключение версии)
    db.query(GroupProgram).filter(GroupProgram.group_id == group_id).delete()
    
    group_program = GroupProgram(group_id=group_id, program_id=program_id)
    db.add(group_program)

    # Авто-привязка тренера группы к программе, чтобы тренер видел программу и мог работать по ней
    ensure_program_trainer(db, program_id, group.trainer_id)
    db.commit()
    
    log_action(db, current_user.id, "set_program", "group", group_id, {"program_id": program_id})
    return {"message": "Program set for group"}


@router.post("/{program_id}/assign-to-student/{student_id}")
async def assign_program_to_student(
    program_id: int,
    student_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_role(["admin"]))
):
    """Назначение программы ученику"""
    program = db.query(Program).filter(Program.id == program_id).first()
    from app.models import Student
    student = db.query(Student).filter(Student.id == student_id).first()
    
    if not program or not student:
        raise HTTPException(status_code=404, detail="Program or student not found")
    
    # Заменяем назначение (явное переключение версии)
    db.query(StudentProgram).filter(StudentProgram.student_id == student_id).delete()
    
    student_program = StudentProgram(student_id=student_id, program_id=program_id)
    db.add(student_program)

    # Авто-привязка всех тренеров групп ученика к программе (если ученик уже в группе)
    from app.models import Group
    trainer_ids = db.query(Group.trainer_id).join(GroupStudent).filter(
        GroupStudent.student_id == student_id
    ).distinct().all()
    for (tid,) in trainer_ids:
        if tid:
            ensure_program_trainer(db, program_id, tid)
    db.commit()
    
    log_action(db, current_user.id, "set_program", "student", student_id, {"program_id": program_id})
    return {"message": "Program set for student"}

