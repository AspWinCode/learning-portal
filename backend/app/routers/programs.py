from typing import List
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi_cache.decorator import cache
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import or_
from app.cache import CACHE_NS_PROGRAMS, invalidate_namespace, user_role_key_builder
from app.database import get_db
from app import auth
from app.schemas.programs import ProgramCreate, ProgramListResponse, ProgramResponse, ProgramUpdate
from app.models import (
    Program, Module, Topic, User, ProgramStatus, TopicStatus,
    ProgramTrainer, GroupProgram, StudentProgram, Grade, UserRole,
    Student, StudentStatus, GroupStudent, Group, GroupStatus,
    StudentProgramLinkStatus,
)
from app.routers.action_log import log_action

router = APIRouter()

def _get_program_family_ids(db: Session, any_version_id: int) -> List[int]:
    """
    Return all program IDs in the same version family (root + all descendants).
    Family is defined by parent_program_id chain.
    """
    # Find root
    root_id = any_version_id
    while True:
        parent_id = db.query(Program.parent_program_id).filter(Program.id == root_id).scalar()
        if parent_id is None:
            break
        root_id = parent_id

    seen = {root_id}
    frontier = [root_id]
    while frontier:
        child_ids = [cid for (cid,) in db.query(Program.id).filter(Program.parent_program_id.in_(frontier)).all()]
        frontier = []
        for cid in child_ids:
            if cid not in seen:
                seen.add(cid)
                frontier.append(cid)
    return list(seen)


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
    current_user: User = Depends(auth.require_permission("programs.create"))
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
    await invalidate_namespace(CACHE_NS_PROGRAMS)
    return db_program


@router.get("/", response_model=List[ProgramResponse])
@cache(expire=120, namespace=CACHE_NS_PROGRAMS, key_builder=user_role_key_builder)
async def read_programs(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user)
):
    """Получение списка программ"""
    auth.ensure_permission(current_user, "programs.access")
    effective_role = auth.resolve_effective_role(current_user)
    query = db.query(Program)

    # Гость видит только активные программы
    if effective_role == UserRole.GUEST:
        query = query.filter(Program.status == ProgramStatus.ACTIVE)
        programs = query.offset(skip).limit(limit).all()
        return programs
    
    # Тренер видит:
    # - программы, к которым привязан (ProgramTrainer)
    # - программы, назначенные его активным группам (GroupProgram)
    if effective_role == UserRole.TRAINER:
        program_ids_from_groups = (
            db.query(GroupProgram.program_id)
            .join(Group, Group.id == GroupProgram.group_id)
            .filter(Group.trainer_id == current_user.id, Group.status == GroupStatus.ACTIVE)
            .subquery()
        )
        program_ids_from_links = (
            db.query(ProgramTrainer.program_id)
            .filter(ProgramTrainer.trainer_id == current_user.id)
            .subquery()
        )
        query = query.filter(or_(Program.id.in_(program_ids_from_groups), Program.id.in_(program_ids_from_links))).distinct()

    # Родитель видит только программы, назначенные его активным ученикам (напрямую или через группу)
    elif effective_role == UserRole.PARENT:
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


@router.get("/paginated", response_model=ProgramListResponse)
async def read_programs_paginated(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    auth.ensure_permission(current_user, "programs.access")
    effective_role = auth.resolve_effective_role(current_user)
    query = db.query(Program)

    if effective_role == UserRole.GUEST:
        query = query.filter(Program.status == ProgramStatus.ACTIVE)
    elif effective_role == UserRole.TRAINER:
        program_ids_from_groups = (
            db.query(GroupProgram.program_id)
            .join(Group, Group.id == GroupProgram.group_id)
            .filter(Group.trainer_id == current_user.id, Group.status == GroupStatus.ACTIVE)
            .subquery()
        )
        program_ids_from_links = (
            db.query(ProgramTrainer.program_id)
            .filter(ProgramTrainer.trainer_id == current_user.id)
            .subquery()
        )
        query = query.filter(or_(Program.id.in_(program_ids_from_groups), Program.id.in_(program_ids_from_links))).distinct()
    elif effective_role == UserRole.PARENT:
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

    total = query.order_by(None).count()
    programs = query.offset(skip).limit(limit).all()
    return {
        "total": total,
        "items": programs,
        "skip": skip,
        "limit": limit,
    }


@router.get("/{program_id}", response_model=ProgramResponse)
async def read_program(
    program_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user)
):
    """Получение программы по ID"""
    auth.ensure_permission(current_user, "programs.access")
    effective_role = auth.resolve_effective_role(current_user)
    program_query = db.query(Program).options(
        joinedload(Program.modules).joinedload(Module.topics)
    ).filter(Program.id == program_id)
    # Гости видят только активные программы
    if effective_role == UserRole.GUEST:
        program_query = program_query.filter(Program.status == ProgramStatus.ACTIVE)
    program = program_query.first()
    if program is None:
        raise HTTPException(status_code=404, detail="Program not found")
    
    # Для тренеров и родителей разрешаем доступ к архивированным программам (для чтения)
    # если они назначены их группам/ученикам

    # RBAC: тренер может читать только программы, к которым привязан
    if effective_role == UserRole.TRAINER:
        has_access = db.query(ProgramTrainer).filter(
            ProgramTrainer.program_id == program_id,
            ProgramTrainer.trainer_id == current_user.id
        ).first()
        if not has_access:
            # Фолбэк: если программа назначена группе тренера, разрешаем доступ
            # Проверяем как активные, так и неактивные группы (на случай архивации)
            has_group_access = db.query(GroupProgram).join(Group).filter(
                GroupProgram.program_id == program_id,
                Group.trainer_id == current_user.id
            ).first()
            if not has_group_access:
                # Дополнительная проверка: программа может быть назначена ученику через группу тренера
                has_student_access = db.query(GroupProgram).join(Group).join(GroupStudent).filter(
                    GroupProgram.program_id == program_id,
                    Group.trainer_id == current_user.id
                ).first()
                if not has_student_access:
                    raise HTTPException(status_code=403, detail="Not enough permissions")

            # И авто-привязываем тренера к программе, чтобы последующие запросы/оценки работали консистентно
            ensure_program_trainer(db, program_id, current_user.id)
            db.commit()

    # RBAC: родитель может читать только программы, назначенные его активным ученикам
    if effective_role == UserRole.PARENT:
        has_direct = db.query(StudentProgram).join(Student).filter(
            StudentProgram.program_id == program_id,
            StudentProgram.status == StudentProgramLinkStatus.ACTIVE,
            Student.parent_id == current_user.id,
            Student.status == StudentStatus.ACTIVE,
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
    current_user: User = Depends(auth.require_permission("programs.edit"))
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

        # Автоматически архивируем ВСЕ предыдущие версии в семействе (активной остаётся только новая).
        family_ids = _get_program_family_ids(db, db_program.id)
        if family_ids:
            db.query(Program).filter(
                Program.id.in_(family_ids),
                Program.id != new_program.id
            ).update({"status": ProgramStatus.ARCHIVED}, synchronize_session=False)

            # Автоматически переключаем назначения групп/учеников на новую версию
            db.query(GroupProgram).filter(GroupProgram.program_id.in_(family_ids)).update(
                {"program_id": new_program.id}, synchronize_session=False
            )
            db.query(StudentProgram).filter(
                StudentProgram.program_id.in_(family_ids),
                StudentProgram.status == StudentProgramLinkStatus.ACTIVE,
            ).update({"program_id": new_program.id}, synchronize_session=False)

            # Переносим видимость для тренеров: копируем привязки ProgramTrainer со всех старых версий на новую
            old_trainer_ids = db.query(ProgramTrainer.trainer_id).filter(
                ProgramTrainer.program_id.in_(family_ids)
            ).distinct().all()
            for (tid,) in old_trainer_ids:
                if tid:
                    ensure_program_trainer(db, new_program.id, tid)

            # Гарантируем видимость новой версии для тренеров групп, которым назначена новая версия
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
        await invalidate_namespace(CACHE_NS_PROGRAMS)
        return db_program


@router.post("/{program_id}/archive-topic/{topic_id}")
async def archive_topic(
    program_id: int,
    topic_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.require_permission("programs.edit"))
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
    current_user: User = Depends(auth.require_permission("programs.edit"))
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
    current_user: User = Depends(auth.require_permission("programs.edit"))
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
    current_user: User = Depends(auth.require_permission("programs.edit"))
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
    current_user: User = Depends(auth.require_permission("programs.assign"))
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
    current_user: User = Depends(auth.require_permission("programs.assign"))
):
    """Добавление программы ученику (у одного ученика может быть несколько программ)"""
    program = db.query(Program).filter(Program.id == program_id).first()
    from app.models import Student
    student = db.query(Student).filter(Student.id == student_id).first()

    if not program or not student:
        raise HTTPException(status_code=404, detail="Program or student not found")

    if program.status != ProgramStatus.ACTIVE:
        raise HTTPException(status_code=400, detail="Cannot assign archived program to student")

    existing = db.query(StudentProgram).filter(
        StudentProgram.student_id == student_id,
        StudentProgram.program_id == program_id,
    ).first()
    if existing:
        if existing.status == StudentProgramLinkStatus.ACTIVE:
            return {"message": "Program already assigned to student"}
        # Реактивация архивированной связи
        existing.status = StudentProgramLinkStatus.ACTIVE
        db.commit()
        log_action(db, current_user.id, "add_program", "student", student_id, {"program_id": program_id})
        return {"message": "Program added to student (reactivated)"}

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

    log_action(db, current_user.id, "add_program", "student", student_id, {"program_id": program_id})
    return {"message": "Program added to student"}

