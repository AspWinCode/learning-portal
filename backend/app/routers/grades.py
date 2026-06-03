from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload
from app.database import get_db
from app import auth
from app.schemas.grades import GradeCreate, GradeResponse, GradeUpdate
from app.models import (
    Grade, User, UserRole, Topic, TopicStatus, Student, StudentStatus, GroupStudent, Group,
    ProgramTrainer, StudentProgram, GroupProgram, Program, ProgramStatus, Module,
    StudentProgramLinkStatus,
)
from app.routers.action_log import log_action
from app.services.telegram import notify_user
from app.services.student_activity import log_student_activity

router = APIRouter()


def _grades_effective_role(current_user: User) -> UserRole:
    return auth.resolve_effective_role(current_user)


def ensure_program_trainer(db: Session, program_id: int, trainer_id: int) -> None:
    """
    Ensure trainer is attached to program (ProgramTrainer row exists).
    Used to keep program visibility and grading consistent.
    """
    existing = db.query(ProgramTrainer).filter(
        ProgramTrainer.program_id == program_id,
        ProgramTrainer.trainer_id == trainer_id
    ).first()
    if existing:
        return
    db.add(ProgramTrainer(program_id=program_id, trainer_id=trainer_id))


@router.post("/", response_model=GradeResponse, status_code=status.HTTP_201_CREATED)
async def create_grade(
    grade: GradeCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user)
):
    """Проставление оценки (тренер)"""
    # Проверка прав доступа
    auth.ensure_permission(current_user, "grades.manage")
    if _grades_effective_role(current_user) != UserRole.TRAINER:
        raise HTTPException(status_code=403, detail="Only trainers can create grades")

    # 1. Студент существует?
    student = db.query(Student).filter(Student.id == grade.student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    # 2. Тренер имеет доступ к ученику (состоит в одной группе)?
    has_access = db.query(GroupStudent).join(Group).filter(
        GroupStudent.student_id == grade.student_id,
        Group.trainer_id == current_user.id
    ).first()
    if not has_access:
        raise HTTPException(status_code=403, detail="No access to this student")

    if student.status != StudentStatus.ACTIVE:
        raise HTTPException(status_code=400, detail="Cannot grade archived student")

    # 3. Тема существует?
    topic = db.query(Topic).filter(Topic.id == grade.topic_id).first()
    if not topic:
        raise HTTPException(status_code=404, detail="Topic not found")

    # Программа темы (Topic -> Module -> Program)
    try:
        program_id = topic.module.program_id  # type: ignore[attr-defined]
    except Exception:
        program_id = None
    if not program_id:
        raise HTTPException(status_code=400, detail="Topic is not attached to a program")

    # Проверка: тема относится к программе, назначенной ученику (напрямую или через группу тренера)
    has_direct_program = db.query(StudentProgram).filter(
        StudentProgram.student_id == grade.student_id,
        StudentProgram.program_id == program_id,
        StudentProgram.status == StudentProgramLinkStatus.ACTIVE,
    ).first()

    has_group_program = db.query(GroupProgram).join(Group).join(GroupStudent).filter(
        GroupStudent.student_id == grade.student_id,
        GroupProgram.program_id == program_id,
        Group.trainer_id == current_user.id
    ).first()

    if not has_direct_program and not has_group_program:
        raise HTTPException(status_code=400, detail="Topic is not in student's assigned program")

    # Проверка/авто-привязка: тренер привязан к этой программе
    trainer_attached = db.query(ProgramTrainer).filter(
        ProgramTrainer.program_id == program_id,
        ProgramTrainer.trainer_id == current_user.id
    ).first()
    if not trainer_attached:
        # Если программа назначена группе тренера (или ученику, к которому у тренера есть доступ),
        # то безопасно автопривязать тренера к программе.
        ensure_program_trainer(db, program_id, current_user.id)
        db.commit()
    
    # Запрет оценки по архивированной теме
    if topic.status == TopicStatus.ARCHIVED:
        raise HTTPException(
            status_code=400,
            detail="Cannot grade archived topic"
        )
    
    # Проверка, что тема активна или уже была оценена
    if topic.status != TopicStatus.ACTIVE:
        # Проверяем, есть ли уже оценки по этой теме
        existing_grade = db.query(Grade).filter(
            Grade.student_id == grade.student_id,
            Grade.topic_id == grade.topic_id
        ).first()
        
        if not existing_grade:
            raise HTTPException(
                status_code=400,
                detail="Cannot grade inactive topic without existing grades"
            )
    
    db_grade = Grade(
        student_id=grade.student_id,
        topic_id=grade.topic_id,
        trainer_id=current_user.id,
        grade=grade.grade,
        comment=grade.comment,
        date=grade.date
    )
    db.add(db_grade)
    log_student_activity(
        db,
        student_id=grade.student_id,
        activity_type="grade_added",
        title="Добавлена оценка",
        description=f"Тема: {topic.name}. Оценка: {grade.grade}",
        created_by=current_user.id,
        payload_json={"topic_id": topic.id, "topic_name": topic.name, "grade": grade.grade},
    )
    db.commit()
    db.refresh(db_grade)
    
    log_action(db, current_user.id, "create", "grade", db_grade.id)

    # Telegram уведомление родителю (если привязан)
    try:
        if student and student.parent_id:
            await notify_user(
                db,
                student.parent_id,
                f"Новая оценка\n"
                f"Ученик: {student.full_name}\n"
                f"Тема: {topic.name}\n"
                f"Оценка: {grade.grade}\n"
                f"Комментарий: {grade.comment or '—'}"
            )
    except Exception:
        # не мешаем основному процессу
        pass
    return db_grade


@router.get("/", response_model=List[GradeResponse])
async def read_grades(
    student_id: int = None,
    topic_id: int = None,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user)
):
    """Получение списка оценок"""
    query = db.query(Grade)
    
    # Родитель видит только оценки своих активных учеников
    auth.ensure_permission(current_user, "grades.access")
    effective_role = _grades_effective_role(current_user)
    if effective_role == UserRole.PARENT:
        student_ids = db.query(Student.id).filter(
            Student.parent_id == current_user.id,
            Student.status == StudentStatus.ACTIVE
        ).subquery()
        query = query.filter(Grade.student_id.in_(student_ids))
    
    # Тренер видит только оценки учеников из своих групп
    elif effective_role == UserRole.TRAINER:
        query = query.filter(Grade.trainer_id == current_user.id)
    
    if student_id:
        query = query.filter(Grade.student_id == student_id)
    if topic_id:
        query = query.filter(Grade.topic_id == topic_id)
    
    grades = query.offset(skip).limit(limit).all()
    return grades


@router.get("/{grade_id}", response_model=GradeResponse)
async def read_grade(
    grade_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user)
):
    """Получение оценки по ID"""
    grade = db.query(Grade).filter(Grade.id == grade_id).first()
    if grade is None:
        raise HTTPException(status_code=404, detail="Grade not found")
    
    # Проверка прав доступа
    auth.ensure_permission(current_user, "grades.access")
    effective_role = _grades_effective_role(current_user)
    if effective_role == UserRole.PARENT:
        if grade.student.parent_id != current_user.id or grade.student.status != StudentStatus.ACTIVE:
            raise HTTPException(status_code=403, detail="Not enough permissions")
    elif effective_role == UserRole.TRAINER:
        if grade.trainer_id != current_user.id:
            raise HTTPException(status_code=403, detail="Not enough permissions")
    
    return grade


@router.put("/{grade_id}", response_model=GradeResponse)
async def update_grade(
    grade_id: int,
    grade_update: GradeUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user)
):
    """Обновление оценки (только тренер, который её поставил)"""
    db_grade = db.query(Grade).filter(Grade.id == grade_id).first()
    if db_grade is None:
        raise HTTPException(status_code=404, detail="Grade not found")
    
    auth.ensure_permission(current_user, "grades.manage")
    if _grades_effective_role(current_user) != UserRole.TRAINER or db_grade.trainer_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not enough permissions")
    
    update_data = grade_update.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(db_grade, field, value)
    
    db.commit()
    db.refresh(db_grade)
    
    log_action(db, current_user.id, "update", "grade", grade_id, update_data)

    # Telegram уведомление родителю (если привязан) об изменении оценки
    try:
        student = db_grade.student
        topic = db_grade.topic
        if student and student.parent_id and student.status == StudentStatus.ACTIVE:
            await notify_user(
                db,
                student.parent_id,
                f"Оценка обновлена\n"
                f"Ученик: {student.full_name}\n"
                f"Тема: {topic.name if topic else db_grade.topic_id}\n"
                f"Оценка: {db_grade.grade}\n"
                f"Комментарий: {db_grade.comment or '—'}"
            )
    except Exception:
        pass

    return db_grade


@router.get("/student/{student_id}/progress")
async def get_student_progress(
    student_id: int,
    program_id: int = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user)
):
    """Получение прогресса ученика (процент оцененных тем)"""
    # Проверка прав доступа
    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    
    auth.ensure_permission(current_user, "grades.access")
    effective_role = _grades_effective_role(current_user)
    if effective_role == UserRole.PARENT:
        if student.parent_id != current_user.id or student.status != StudentStatus.ACTIVE:
            raise HTTPException(status_code=403, detail="Not enough permissions")
    elif effective_role == UserRole.TRAINER:
        if student.status != StudentStatus.ACTIVE:
            raise HTTPException(status_code=403, detail="Not enough permissions")
        has_access = db.query(GroupStudent).join(Group).filter(
            GroupStudent.student_id == student_id,
            Group.trainer_id == current_user.id
        ).first()
        if not has_access:
            raise HTTPException(status_code=403, detail="Not enough permissions")
    
    # Получаем программу ученика (или программы группы, если студенту напрямую не назначено)
    # Используем eager loading для модулей и тем
    if program_id:
        program = db.query(Program).options(
            joinedload(Program.modules).joinedload(Module.topics)
        ).filter(Program.id == program_id).first()
    else:
        student_program = db.query(StudentProgram).filter(
            StudentProgram.student_id == student_id,
            StudentProgram.status == StudentProgramLinkStatus.ACTIVE,
        ).first()
        if student_program:
            # Загружаем программу с модулями и темами
            program = db.query(Program).options(
                joinedload(Program.modules).joinedload(Module.topics)
            ).filter(Program.id == student_program.program_id).first()
        else:
            # Фолбэк: берём программу группы (первую), если ученик состоит в группе с назначенной программой.
            # В SQLAlchemy 2.x нужно явно указывать условие join, иначе возникает
            # "Don't know how to join to Mapper; use select_from / explicit ON".
            # Строим запрос явно через select_from(GroupStudent),
            # чтобы SQLAlchemy точно знал, с какой таблицы начинается join.
            gp = (
                db.query(GroupProgram)
                .select_from(GroupStudent)
                .join(GroupProgram, GroupProgram.group_id == GroupStudent.group_id)
                .filter(GroupStudent.student_id == student_id)
                .order_by(GroupProgram.created_at.desc())
                .first()
            )
            if not gp:
                raise HTTPException(status_code=404, detail="No program assigned to student")
            # Загружаем программу с модулями и темами
            program = db.query(Program).options(
                joinedload(Program.modules).joinedload(Module.topics)
            ).filter(Program.id == gp.program_id).first()
    
    if not program:
        raise HTTPException(status_code=404, detail="Program not found")
    
    # Проверяем, что программа активна (не архивирована)
    # Но разрешаем доступ к архивированным программам для тренеров/родителей,
    # если они назначены их группам/ученикам (для обратной совместимости)
    if program.status != ProgramStatus.ACTIVE:
        # Для тренеров и родителей разрешаем доступ к архивированным программам
        # если они назначены их группам/ученикам
        effective_role = _grades_effective_role(current_user)
        if effective_role == UserRole.TRAINER or effective_role == UserRole.PARENT:
            # Проверяем, что программа назначена группе/ученику тренера/родителя
            if effective_role == UserRole.TRAINER:
                has_access = db.query(GroupProgram).join(Group).filter(
                    GroupProgram.program_id == program.id,
                    Group.trainer_id == current_user.id
                ).first()
            else:  # PARENT
                has_access = db.query(StudentProgram).join(Student).filter(
                    StudentProgram.program_id == program.id,
                    StudentProgram.status == StudentProgramLinkStatus.ACTIVE,
                    Student.parent_id == current_user.id,
                    Student.status == StudentStatus.ACTIVE,
                ).first()
                if not has_access:
                    has_access = db.query(GroupProgram).join(GroupStudent).join(Student).filter(
                        GroupProgram.program_id == program.id,
                        Student.parent_id == current_user.id,
                        Student.status == StudentStatus.ACTIVE
                    ).first()
            
            if not has_access:
                raise HTTPException(status_code=400, detail="Program is archived. Please contact administrator.")
        else:
            raise HTTPException(status_code=400, detail="Program is archived. Please contact administrator.")
    
    # Подсчет тем
    total_topics = 0
    graded_topics = 0
    
    for module in program.modules:
        for topic in module.topics:
            if topic.status == TopicStatus.ACTIVE:
                total_topics += 1
                has_grade = db.query(Grade).filter(
                    Grade.student_id == student_id,
                    Grade.topic_id == topic.id
                ).first()
                if has_grade:
                    graded_topics += 1
    
    progress = (graded_topics / total_topics * 100) if total_topics > 0 else 0
    
    return {
        "student_id": student_id,
        "program_id": program.id,
        "total_topics": total_topics,
        "graded_topics": graded_topics,
        "progress_percent": round(progress, 2)
    }

