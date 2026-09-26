import os
from typing import Dict

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import require_sales_admin_owner
from app.routers.action_log import log_action
from app.services.tax_deduction_pdf import (
    PYPDF_AVAILABLE,
    REPORTLAB_AVAILABLE,
    build_tax_deduction_pdf_from_template,
    build_tax_deduction_pdf_knd,
    knd_template_path,
)

router = APIRouter()


@router.get("/tax-deduction-certificate/status")
async def tax_deduction_certificate_status(
    current_user=Depends(require_sales_admin_owner),
):
    template_path = knd_template_path()
    return {
        "template_path": template_path,
        "template_exists": os.path.isfile(template_path),
        "pypdf_available": PYPDF_AVAILABLE,
        "will_use_template": PYPDF_AVAILABLE and os.path.isfile(template_path),
    }


@router.post("/tax-deduction-certificate")
async def generate_tax_deduction_certificate(
    body: Dict,
    db: Session = Depends(get_db),
    current_user=Depends(require_sales_admin_owner),
):
    if not REPORTLAB_AVAILABLE:
        raise HTTPException(status_code=503, detail="Генерация PDF недоступна (reportlab не установлен)")
    template_path = knd_template_path()
    use_template = PYPDF_AVAILABLE and os.path.isfile(template_path)
    if use_template:
        pdf_bytes = build_tax_deduction_pdf_from_template(template_path, body)
    else:
        pdf_bytes = build_tax_deduction_pdf_knd(body)
    headers = {
        "Content-Disposition": 'attachment; filename="spravka_KND_1151158.pdf"',
        "X-Spravka-Source": "template" if use_template else "generated",
    }
    log_action(
        db, current_user.id, "generate", "tax_deduction_certificate", None,
        {"source": "template" if use_template else "generated", "parent_name": body.get("parent_name") or body.get("fio")},
    )
    return Response(content=pdf_bytes, media_type="application/pdf", headers=headers)
