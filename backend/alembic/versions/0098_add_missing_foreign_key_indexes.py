"""add missing foreign key indexes

Revision ID: 0098_add_missing_foreign_key_indexes
Revises: 0097_owner_workspace_counterparties
Create Date: 2026-05-26
"""

from alembic import op


revision = "0098_add_missing_foreign_key_indexes"
down_revision = "0097_owner_workspace_counterparties"
branch_labels = None
depends_on = None


INDEXES = [
    ("ix_students_parent_id", "students", "parent_id"),
    ("ix_students_abonement_id", "students", "abonement_id"),
    ("ix_leads_abonement_id", "leads", "abonement_id"),
    ("ix_group_students_group_id", "group_students", "group_id"),
    ("ix_group_students_student_id", "group_students", "student_id"),
    ("ix_group_schedules_group_id", "group_schedules", "group_id"),
    ("ix_lesson_attendance_group_id", "lesson_attendance", "group_id"),
    ("ix_lesson_attendance_student_id", "lesson_attendance", "student_id"),
    ("ix_finance_recognition_rules_target_id", "finance_recognition_rules", "target_id"),
    ("ix_finance_recognition_rules_article_id", "finance_recognition_rules", "article_id"),
    ("ix_modules_program_id", "modules", "program_id"),
    ("ix_topics_module_id", "topics", "module_id"),
    ("ix_program_trainers_program_id", "program_trainers", "program_id"),
    ("ix_program_trainers_trainer_id", "program_trainers", "trainer_id"),
    ("ix_group_programs_group_id", "group_programs", "group_id"),
    ("ix_group_programs_program_id", "group_programs", "program_id"),
    ("ix_student_programs_student_id", "student_programs", "student_id"),
    ("ix_student_programs_program_id", "student_programs", "program_id"),
    ("ix_grades_student_id", "grades", "student_id"),
    ("ix_grades_topic_id", "grades", "topic_id"),
    ("ix_grades_trainer_id", "grades", "trainer_id"),
    ("ix_characteristics_student_id", "characteristics", "student_id"),
    ("ix_characteristics_trainer_id", "characteristics", "trainer_id"),
]


def upgrade():
    for index_name, table_name, column_name in INDEXES:
        op.execute(f'CREATE INDEX IF NOT EXISTS "{index_name}" ON "{table_name}" ("{column_name}")')


def downgrade():
    for index_name, _, _ in reversed(INDEXES):
        op.execute(f'DROP INDEX IF EXISTS "{index_name}"')
