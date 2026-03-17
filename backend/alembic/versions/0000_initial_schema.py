"""Initial schema (create all tables)

Revision ID: 0000_initial_schema
Revises:
Create Date: 2026-01-15
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "0000_initial_schema"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Enum types (PostgreSQL will create types automatically when used in columns)
    user_role = sa.Enum("admin", "trainer", "parent", "guest", name="userrole")
    student_status = sa.Enum("active", "archived", name="studentstatus")
    group_status = sa.Enum("active", "archived", name="groupstatus")
    program_status = sa.Enum("active", "archived", name="programstatus")
    topic_status = sa.Enum("active", "archived", name="topicstatus")
    characteristic_status = sa.Enum("draft", "pending", "approved", "rejected", name="characteristicstatus")

    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("email", sa.String(), nullable=False),
        sa.Column("hashed_password", sa.String(), nullable=False),
        sa.Column("full_name", sa.String(), nullable=False),
        sa.Column("role", user_role, nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("telegram_chat_id", sa.BigInteger(), nullable=True),
        sa.Column("telegram_link_code", sa.String(), nullable=True),
        sa.Column("telegram_link_code_expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("password_reset_code_hash", sa.String(), nullable=True),
        sa.Column("password_reset_expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("email", name="uq_users_email"),
    )
    op.create_index("ix_users_email", "users", ["email"])
    op.create_index("ix_users_telegram_chat_id", "users", ["telegram_chat_id"])
    op.create_index("ix_users_telegram_link_code", "users", ["telegram_link_code"])
    op.create_index("ix_users_password_reset_code_hash", "users", ["password_reset_code_hash"])

    op.create_table(
        "students",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("full_name", sa.String(), nullable=False),
        sa.Column("parent_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("status", student_status, nullable=True, server_default=sa.text("'active'")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_students_parent_id", "students", ["parent_id"])

    op.create_table(
        "groups",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("trainer_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("status", group_status, nullable=True, server_default=sa.text("'active'")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_groups_trainer_id", "groups", ["trainer_id"])

    op.create_table(
        "group_students",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("group_id", sa.Integer(), sa.ForeignKey("groups.id"), nullable=False),
        sa.Column("student_id", sa.Integer(), sa.ForeignKey("students.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
    )
    op.create_index("ix_group_students_group_id", "group_students", ["group_id"])
    op.create_index("ix_group_students_student_id", "group_students", ["student_id"])

    op.create_table(
        "programs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False, server_default=sa.text("1")),
        sa.Column("parent_program_id", sa.Integer(), sa.ForeignKey("programs.id"), nullable=True),
        sa.Column("status", program_status, nullable=True, server_default=sa.text("'active'")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_programs_parent_program_id", "programs", ["parent_program_id"])

    op.create_table(
        "modules",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("program_id", sa.Integer(), sa.ForeignKey("programs.id"), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("order", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("status", program_status, nullable=True, server_default=sa.text("'active'")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
    )
    op.create_index("ix_modules_program_id", "modules", ["program_id"])

    op.create_table(
        "topics",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("module_id", sa.Integer(), sa.ForeignKey("modules.id"), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("final_result", sa.Text(), nullable=True),
        sa.Column("order", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("status", topic_status, nullable=True, server_default=sa.text("'active'")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
    )
    op.create_index("ix_topics_module_id", "topics", ["module_id"])

    op.create_table(
        "program_trainers",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("program_id", sa.Integer(), sa.ForeignKey("programs.id"), nullable=False),
        sa.Column("trainer_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
    )
    op.create_index("ix_program_trainers_program_id", "program_trainers", ["program_id"])
    op.create_index("ix_program_trainers_trainer_id", "program_trainers", ["trainer_id"])

    op.create_table(
        "group_programs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("group_id", sa.Integer(), sa.ForeignKey("groups.id"), nullable=False),
        sa.Column("program_id", sa.Integer(), sa.ForeignKey("programs.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
    )
    op.create_index("ix_group_programs_group_id", "group_programs", ["group_id"])
    op.create_index("ix_group_programs_program_id", "group_programs", ["program_id"])

    op.create_table(
        "student_programs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("student_id", sa.Integer(), sa.ForeignKey("students.id"), nullable=False),
        sa.Column("program_id", sa.Integer(), sa.ForeignKey("programs.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
    )
    op.create_index("ix_student_programs_student_id", "student_programs", ["student_id"])
    op.create_index("ix_student_programs_program_id", "student_programs", ["program_id"])

    op.create_table(
        "lesson_attendance",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("group_id", sa.Integer(), sa.ForeignKey("groups.id"), nullable=False),
        sa.Column("lesson_date", sa.Date(), nullable=False),
        sa.Column("student_id", sa.Integer(), sa.ForeignKey("students.id"), nullable=False),
        sa.Column("attended", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("late", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("call_result", sa.String(32), nullable=True),
        sa.Column("call_result_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("absence_reason", sa.String(64), nullable=True),
        sa.Column("absence_comment", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.UniqueConstraint("group_id", "lesson_date", "student_id", name="uq_lesson_attendance_group_date_student"),
    )
    op.create_index("ix_lesson_attendance_group_id", "lesson_attendance", ["group_id"])
    op.create_index("ix_lesson_attendance_student_id", "lesson_attendance", ["student_id"])
    op.create_index("ix_lesson_attendance_lesson_date", "lesson_attendance", ["lesson_date"])

    op.create_table(
        "grades",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("student_id", sa.Integer(), sa.ForeignKey("students.id"), nullable=False),
        sa.Column("topic_id", sa.Integer(), sa.ForeignKey("topics.id"), nullable=False),
        sa.Column("trainer_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("grade", sa.Float(), nullable=False),
        sa.Column("comment", sa.Text(), nullable=True),
        sa.Column("date", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
    )
    op.create_index("ix_grades_student_id", "grades", ["student_id"])
    op.create_index("ix_grades_topic_id", "grades", ["topic_id"])
    op.create_index("ix_grades_trainer_id", "grades", ["trainer_id"])

    op.create_table(
        "characteristics",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("student_id", sa.Integer(), sa.ForeignKey("students.id"), nullable=False),
        sa.Column("trainer_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("month", sa.Integer(), nullable=False),
        sa.Column("year", sa.Integer(), nullable=False),
        sa.Column("data", sa.JSON(), nullable=False),
        sa.Column("status", characteristic_status, nullable=True, server_default=sa.text("'draft'")),
        sa.Column("admin_comment", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_characteristics_student_id", "characteristics", ["student_id"])
    op.create_index("ix_characteristics_trainer_id", "characteristics", ["trainer_id"])

    op.create_table(
        "characteristic_templates",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("fields", sa.JSON(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
    )

    op.create_table(
        "action_logs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("action_type", sa.String(), nullable=False),
        sa.Column("entity_type", sa.String(), nullable=False),
        sa.Column("entity_id", sa.Integer(), nullable=True),
        sa.Column("details", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
    )
    op.create_index("ix_action_logs_user_id", "action_logs", ["user_id"])


def downgrade() -> None:
    # Drop in reverse order
    op.drop_index("ix_action_logs_user_id", table_name="action_logs")
    op.drop_table("action_logs")

    op.drop_table("characteristic_templates")

    op.drop_index("ix_characteristics_trainer_id", table_name="characteristics")
    op.drop_index("ix_characteristics_student_id", table_name="characteristics")
    op.drop_table("characteristics")

    op.drop_index("ix_grades_trainer_id", table_name="grades")
    op.drop_index("ix_grades_topic_id", table_name="grades")
    op.drop_index("ix_grades_student_id", table_name="grades")
    op.drop_table("grades")

    op.drop_index("ix_lesson_attendance_lesson_date", table_name="lesson_attendance")
    op.drop_index("ix_lesson_attendance_student_id", table_name="lesson_attendance")
    op.drop_index("ix_lesson_attendance_group_id", table_name="lesson_attendance")
    op.drop_table("lesson_attendance")

    op.drop_index("ix_student_programs_program_id", table_name="student_programs")
    op.drop_index("ix_student_programs_student_id", table_name="student_programs")
    op.drop_table("student_programs")

    op.drop_index("ix_group_programs_program_id", table_name="group_programs")
    op.drop_index("ix_group_programs_group_id", table_name="group_programs")
    op.drop_table("group_programs")

    op.drop_index("ix_program_trainers_trainer_id", table_name="program_trainers")
    op.drop_index("ix_program_trainers_program_id", table_name="program_trainers")
    op.drop_table("program_trainers")

    op.drop_index("ix_topics_module_id", table_name="topics")
    op.drop_table("topics")

    op.drop_index("ix_modules_program_id", table_name="modules")
    op.drop_table("modules")

    op.drop_index("ix_programs_parent_program_id", table_name="programs")
    op.drop_table("programs")

    op.drop_index("ix_group_students_student_id", table_name="group_students")
    op.drop_index("ix_group_students_group_id", table_name="group_students")
    op.drop_table("group_students")

    op.drop_index("ix_groups_trainer_id", table_name="groups")
    op.drop_table("groups")

    op.drop_index("ix_students_parent_id", table_name="students")
    op.drop_table("students")

    op.drop_index("ix_users_password_reset_code_hash", table_name="users")
    op.drop_index("ix_users_telegram_link_code", table_name="users")
    op.drop_index("ix_users_telegram_chat_id", table_name="users")
    op.drop_index("ix_users_email", table_name="users")
    op.drop_table("users")

    # Drop enum types (PostgreSQL)
    characteristic_status = sa.Enum(name="characteristicstatus")
    topic_status = sa.Enum(name="topicstatus")
    program_status = sa.Enum(name="programstatus")
    group_status = sa.Enum(name="groupstatus")
    student_status = sa.Enum(name="studentstatus")
    user_role = sa.Enum(name="userrole")
    for e in [characteristic_status, topic_status, program_status, group_status, student_status, user_role]:
        try:
            e.drop(op.get_bind(), checkfirst=True)
        except Exception:
            pass


