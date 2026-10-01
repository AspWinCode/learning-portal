"""Умные таблицы — Phase 1: workbooks/sheets CRUD + operations executor.

Permissions: owner/admin (платформенные роли) видят и редактируют всё;
остальные — по членству в smart_table_members (owner/editor/viewer).
Запись данных листа идёт только через OperationExecutor — см.
app/services/smart_tables/executor.py и docs/smart-tables-architecture.md.
"""
from typing import List, Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from fastapi.responses import Response
from sqlalchemy.orm import Session, joinedload

from app import auth
from app.database import get_db
from app.models import (
    SmartTableColumn,
    SmartTableMember,
    SmartTableRow,
    SmartTableSheet,
    SmartTableWorkbook,
    User,
    UserRole,
)
from app.schemas.smart_tables import (
    ColumnOut,
    MemberAdd,
    MemberResponse,
    OperationBatch,
    OperationLogEntry,
    OperationResult,
    RowOut,
    SheetCreate,
    SheetDetail,
    SheetSummary,
    WorkbookCreate,
    WorkbookResponse,
    WorkbookUpdate,
)
from app.services.smart_tables.executor import OperationError, OperationExecutor
from app.services.smart_tables.import_export import ImportError_, export_csv, export_xlsx, import_sheet, parse_upload

router = APIRouter()

_ALWAYS_FULL_ACCESS_ROLES = {UserRole.OWNER.value, UserRole.ADMIN.value}


# ── permissions ─────────────────────────────────────────────────

def _effective_role(user: User, db: Session, workbook: SmartTableWorkbook) -> Optional[str]:
    if auth.resolve_effective_role(user).value in _ALWAYS_FULL_ACCESS_ROLES or workbook.owner_id == user.id:
        return "owner"
    member = (
        db.query(SmartTableMember)
        .filter(SmartTableMember.workbook_id == workbook.id, SmartTableMember.user_id == user.id)
        .first()
    )
    return member.role if member else None


def _get_workbook_or_404(db: Session, workbook_id: int) -> SmartTableWorkbook:
    workbook = db.get(SmartTableWorkbook, workbook_id)
    if workbook is None:
        raise HTTPException(status_code=404, detail="Workbook не найден")
    return workbook


def _require_role(db: Session, user: User, workbook: SmartTableWorkbook, *, min_role: str) -> str:
    order = {"viewer": 0, "editor": 1, "owner": 2}
    role = _effective_role(user, db, workbook)
    if role is None or order[role] < order[min_role]:
        raise HTTPException(status_code=403, detail="Недостаточно прав на эту таблицу")
    return role


def _get_sheet_or_404(db: Session, sheet_id: int) -> SmartTableSheet:
    sheet = (
        db.query(SmartTableSheet)
        .options(joinedload(SmartTableSheet.columns_), joinedload(SmartTableSheet.rows))
        .filter(SmartTableSheet.id == sheet_id)
        .first()
    )
    if sheet is None:
        raise HTTPException(status_code=404, detail="Лист не найден")
    return sheet


# ── serialization ───────────────────────────────────────────────

def _sheet_detail(sheet: SmartTableSheet) -> SheetDetail:
    columns = sorted(sheet.columns_, key=lambda c: c.position)
    rows = sorted(sheet.rows, key=lambda r: r.position)
    return SheetDetail(
        sheet=SheetSummary.model_validate(sheet),
        columns=[ColumnOut.model_validate(c) for c in columns],
        rows=[
            RowOut(
                id=r.id,
                sheet_id=r.sheet_id,
                position=r.position,
                height=r.height,
                cells=r.cells_snapshot or {},
            )
            for r in rows
        ],
    )


# ── workbooks ───────────────────────────────────────────────────

@router.get("/workbooks", response_model=List[WorkbookResponse])
async def list_workbooks(
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    full_access = auth.resolve_effective_role(current_user).value in _ALWAYS_FULL_ACCESS_ROLES
    if full_access:
        workbooks = db.query(SmartTableWorkbook).order_by(SmartTableWorkbook.created_at.desc()).all()
        return [WorkbookResponse(**_to_dict(w), role="owner") for w in workbooks]

    owned = db.query(SmartTableWorkbook).filter(SmartTableWorkbook.owner_id == current_user.id).all()
    memberships = db.query(SmartTableMember).filter(SmartTableMember.user_id == current_user.id).all()
    member_map = {m.workbook_id: m.role for m in memberships}
    member_workbooks = (
        db.query(SmartTableWorkbook).filter(SmartTableWorkbook.id.in_(member_map.keys())).all()
        if member_map
        else []
    )
    seen = {}
    for w in owned:
        seen[w.id] = (w, "owner")
    for w in member_workbooks:
        seen.setdefault(w.id, (w, member_map.get(w.id, "viewer")))
    return [WorkbookResponse(**_to_dict(w), role=role) for w, role in seen.values()]


def _to_dict(w: SmartTableWorkbook) -> dict:
    return {"id": w.id, "name": w.name, "owner_id": w.owner_id, "created_at": w.created_at, "updated_at": w.updated_at}


@router.post("/workbooks", response_model=WorkbookResponse, status_code=status.HTTP_201_CREATED)
async def create_workbook(
    body: WorkbookCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    workbook = SmartTableWorkbook(name=body.name, owner_id=current_user.id)
    db.add(workbook)
    db.commit()
    db.refresh(workbook)
    return WorkbookResponse(**_to_dict(workbook), role="owner")


@router.patch("/workbooks/{workbook_id}", response_model=WorkbookResponse)
async def update_workbook(
    workbook_id: int,
    body: WorkbookUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    workbook = _get_workbook_or_404(db, workbook_id)
    role = _require_role(db, current_user, workbook, min_role="editor")
    if body.name is not None:
        workbook.name = body.name
    db.commit()
    db.refresh(workbook)
    return WorkbookResponse(**_to_dict(workbook), role=role)


@router.delete("/workbooks/{workbook_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_workbook(
    workbook_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    workbook = _get_workbook_or_404(db, workbook_id)
    _require_role(db, current_user, workbook, min_role="owner")
    db.delete(workbook)
    db.commit()


@router.post("/workbooks/{workbook_id}/members", response_model=MemberResponse, status_code=status.HTTP_201_CREATED)
async def add_member(
    workbook_id: int,
    body: MemberAdd,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    workbook = _get_workbook_or_404(db, workbook_id)
    _require_role(db, current_user, workbook, min_role="owner")
    if not db.get(User, body.user_id):
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    member = (
        db.query(SmartTableMember)
        .filter(SmartTableMember.workbook_id == workbook_id, SmartTableMember.user_id == body.user_id)
        .first()
    )
    if member is None:
        member = SmartTableMember(workbook_id=workbook_id, user_id=body.user_id, role=body.role)
        db.add(member)
    else:
        member.role = body.role
    db.commit()
    return MemberResponse.model_validate(member)


# ── sheets ──────────────────────────────────────────────────────

@router.get("/workbooks/{workbook_id}/sheets", response_model=List[SheetSummary])
async def list_sheets(
    workbook_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    workbook = _get_workbook_or_404(db, workbook_id)
    _require_role(db, current_user, workbook, min_role="viewer")
    sheets = (
        db.query(SmartTableSheet)
        .filter(SmartTableSheet.workbook_id == workbook_id)
        .order_by(SmartTableSheet.position)
        .all()
    )
    return [SheetSummary.model_validate(s) for s in sheets]


@router.post("/workbooks/{workbook_id}/sheets", response_model=SheetDetail, status_code=status.HTTP_201_CREATED)
async def create_sheet(
    workbook_id: int,
    body: SheetCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    workbook = _get_workbook_or_404(db, workbook_id)
    _require_role(db, current_user, workbook, min_role="editor")

    existing = db.query(SmartTableSheet).filter(SmartTableSheet.workbook_id == workbook_id).all()
    if body.after_sheet_id is not None:
        after = next((s for s in existing if s.id == body.after_sheet_id), None)
        if after is None:
            raise HTTPException(status_code=400, detail="after_sheet_id не найден в этом workbook")
        greater = sorted([s.position for s in existing if s.position > after.position])
        position = (after.position + greater[0]) / 2 if greater else after.position + 1.0
    else:
        position = (max((s.position for s in existing), default=-1.0)) + 1.0

    sheet = SmartTableSheet(workbook_id=workbook_id, name=body.name, position=position)
    db.add(sheet)
    db.flush()

    # базовый лист: 5 типовых текстовых колонок, 10 пустых строк — удобная стартовая точка
    for i, col_name in enumerate(["Колонка A", "Колонка B", "Колонка C"]):
        db.add(SmartTableColumn(sheet_id=sheet.id, name=col_name, position=float(i), type="text", config={}))
    for i in range(10):
        db.add(SmartTableRow(sheet_id=sheet.id, position=float(i), cells_snapshot={}))
    db.commit()

    sheet = _get_sheet_or_404(db, sheet.id)
    return _sheet_detail(sheet)


@router.post("/workbooks/{workbook_id}/import", response_model=SheetDetail, status_code=status.HTTP_201_CREATED)
async def import_file(
    workbook_id: int,
    file: UploadFile = File(...),
    sheet_name: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    """Импорт CSV/XLSX — создаёт новый лист в workbook (не трогает существующие),
    типы колонок определяются автоматически. См. services/smart_tables/import_export.py."""
    workbook = _get_workbook_or_404(db, workbook_id)
    _require_role(db, current_user, workbook, min_role="editor")

    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Файл пустой")
    try:
        headers, rows = parse_upload(file.filename or "", data)
        name = sheet_name or (file.filename.rsplit(".", 1)[0] if file.filename else "Импорт")
        sheet = import_sheet(db, workbook, name[:255], headers, rows)
        db.commit()
    except ImportError_ as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(exc))

    sheet = _get_sheet_or_404(db, sheet.id)
    return _sheet_detail(sheet)


@router.get("/sheets/{sheet_id}/export")
async def export_file(
    sheet_id: int,
    format: str = Query("csv", pattern="^(csv|xlsx)$"),
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    sheet = _get_sheet_or_404(db, sheet_id)
    workbook = _get_workbook_or_404(db, sheet.workbook_id)
    _require_role(db, current_user, workbook, min_role="viewer")

    columns = sorted(sheet.columns_, key=lambda c: c.position)
    rows = sorted(sheet.rows, key=lambda r: r.position)
    filename = f"{sheet.name or 'sheet'}.{format}".replace('"', "")

    if format == "xlsx":
        content = export_xlsx(sheet, columns, rows)
        media_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    else:
        content = export_csv(sheet, columns, rows)
        media_type = "text/csv"

    return Response(
        content=content,
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.patch("/sheets/{sheet_id}", response_model=SheetSummary)
async def rename_sheet(
    sheet_id: int,
    body: SheetCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    sheet = _get_sheet_or_404(db, sheet_id)
    workbook = _get_workbook_or_404(db, sheet.workbook_id)
    _require_role(db, current_user, workbook, min_role="editor")
    sheet.name = body.name
    db.commit()
    db.refresh(sheet)
    return SheetSummary.model_validate(sheet)


@router.delete("/sheets/{sheet_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_sheet(
    sheet_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    sheet = _get_sheet_or_404(db, sheet_id)
    workbook = _get_workbook_or_404(db, sheet.workbook_id)
    _require_role(db, current_user, workbook, min_role="owner")
    db.delete(sheet)
    db.commit()


@router.get("/sheets/{sheet_id}", response_model=SheetDetail)
async def get_sheet(
    sheet_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    sheet = _get_sheet_or_404(db, sheet_id)
    workbook = _get_workbook_or_404(db, sheet.workbook_id)
    _require_role(db, current_user, workbook, min_role="viewer")
    return _sheet_detail(sheet)


# ── operations ──────────────────────────────────────────────────

@router.post("/sheets/{sheet_id}/operations", response_model=OperationResult)
async def apply_operations(
    sheet_id: int,
    body: OperationBatch,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    sheet = _get_sheet_or_404(db, sheet_id)
    workbook = _get_workbook_or_404(db, sheet.workbook_id)
    _require_role(db, current_user, workbook, min_role="editor")

    executor = OperationExecutor(db, sheet, current_user.id)
    try:
        applied = executor.apply_batch(body.ops)
        db.commit()
    except OperationError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(exc))

    sheet = _get_sheet_or_404(db, sheet_id)
    return OperationResult(sheet=_sheet_detail(sheet), applied=applied)


@router.post("/sheets/{sheet_id}/undo", response_model=OperationResult)
async def undo(
    sheet_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    sheet = _get_sheet_or_404(db, sheet_id)
    workbook = _get_workbook_or_404(db, sheet.workbook_id)
    _require_role(db, current_user, workbook, min_role="editor")

    executor = OperationExecutor(db, sheet, current_user.id)
    try:
        did_undo = executor.undo_last()
        db.commit()
    except OperationError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(exc))

    if not did_undo:
        raise HTTPException(status_code=409, detail="Нечего отменять")

    sheet = _get_sheet_or_404(db, sheet_id)
    return OperationResult(sheet=_sheet_detail(sheet), applied=1)


@router.get("/sheets/{sheet_id}/operations", response_model=List[OperationLogEntry])
async def list_operations(
    sheet_id: int,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_active_user),
):
    sheet = _get_sheet_or_404(db, sheet_id)
    workbook = _get_workbook_or_404(db, sheet.workbook_id)
    _require_role(db, current_user, workbook, min_role="viewer")

    from app.models import SmartTableOperationLog

    entries = (
        db.query(SmartTableOperationLog)
        .filter(SmartTableOperationLog.sheet_id == sheet_id)
        .order_by(SmartTableOperationLog.id.desc())
        .limit(min(limit, 500))
        .all()
    )
    return [OperationLogEntry.model_validate(e) for e in entries]
