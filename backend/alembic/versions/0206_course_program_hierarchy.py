"""Add module/submodule/topic hierarchy to course studio courses.

Revision ID: 0206
Revises: 0205
Create Date: 2026-09-27

Методист должен иметь возможность импортировать готовую программу обучения
(модуль -> подмодуль [опционально] -> тема -> занятия) из .docx-файла вместо
создания уроков по одному. Существующая модель курса (CourseContent ->
CourseLesson) была плоской, поэтому добавляем три новые таблицы и необязательную
привязку урока к теме, не трогая существующие "плоские" уроки.
"""
from alembic import op
import sqlalchemy as sa


revision = "0206"
down_revision = "0205"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "course_modules",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("course_id", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=256), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["course_id"], ["course_contents.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_course_modules_course_id"), "course_modules", ["course_id"])

    op.create_table(
        "course_submodules",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("module_id", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=256), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["module_id"], ["course_modules.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_course_submodules_module_id"), "course_submodules", ["module_id"])

    op.create_table(
        "course_topics",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("module_id", sa.Integer(), nullable=False),
        sa.Column("submodule_id", sa.Integer(), nullable=True),
        sa.Column("title", sa.String(length=256), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["module_id"], ["course_modules.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["submodule_id"], ["course_submodules.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_course_topics_module_id"), "course_topics", ["module_id"])
    op.create_index(op.f("ix_course_topics_submodule_id"), "course_topics", ["submodule_id"])

    op.add_column("course_lessons", sa.Column("topic_id", sa.Integer(), nullable=True))
    op.create_index(op.f("ix_course_lessons_topic_id"), "course_lessons", ["topic_id"])
    op.create_foreign_key(
        "fk_course_lessons_topic_id",
        "course_lessons",
        "course_topics",
        ["topic_id"],
        ["id"],
        ondelete="CASCADE",
    )


def downgrade() -> None:
    op.drop_constraint("fk_course_lessons_topic_id", "course_lessons", type_="foreignkey")
    op.drop_index(op.f("ix_course_lessons_topic_id"), table_name="course_lessons")
    op.drop_column("course_lessons", "topic_id")

    op.drop_index(op.f("ix_course_topics_submodule_id"), table_name="course_topics")
    op.drop_index(op.f("ix_course_topics_module_id"), table_name="course_topics")
    op.drop_table("course_topics")

    op.drop_index(op.f("ix_course_submodules_module_id"), table_name="course_submodules")
    op.drop_table("course_submodules")

    op.drop_index(op.f("ix_course_modules_course_id"), table_name="course_modules")
    op.drop_table("course_modules")
