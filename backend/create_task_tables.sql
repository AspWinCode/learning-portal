-- Таблицы таск-менеджера (если alembic upgrade head недоступен — выполните этот скрипт в вашей БД)
-- Подключитесь к нужной базе (learning_portal или той, что в DATABASE_URL) и выполните:

CREATE TABLE IF NOT EXISTS task_templates (
    id SERIAL PRIMARY KEY,
    name VARCHAR(512) NOT NULL,
    created_by_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_task_templates_created_by_id ON task_templates(created_by_id);

CREATE TABLE IF NOT EXISTS task_template_subtasks (
    id SERIAL PRIMARY KEY,
    template_id INTEGER NOT NULL REFERENCES task_templates(id) ON DELETE CASCADE,
    text VARCHAR(1024) NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS ix_task_template_subtasks_template_id ON task_template_subtasks(template_id);

CREATE TABLE IF NOT EXISTS task_template_students (
    template_id INTEGER NOT NULL REFERENCES task_templates(id) ON DELETE CASCADE,
    student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    PRIMARY KEY (template_id, student_id)
);

CREATE TABLE IF NOT EXISTS tasks (
    id SERIAL PRIMARY KEY,
    title VARCHAR(512) NOT NULL,
    template_id INTEGER REFERENCES task_templates(id) ON DELETE SET NULL,
    created_by_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    assigned_to_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE
);
CREATE INDEX IF NOT EXISTS ix_tasks_template_id ON tasks(template_id);
CREATE INDEX IF NOT EXISTS ix_tasks_created_by_id ON tasks(created_by_id);
CREATE INDEX IF NOT EXISTS ix_tasks_assigned_to_id ON tasks(assigned_to_id);
CREATE INDEX IF NOT EXISTS ix_tasks_status ON tasks(status);

CREATE TABLE IF NOT EXISTS task_subtasks (
    id SERIAL PRIMARY KEY,
    task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    text VARCHAR(1024) NOT NULL,
    completed BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS ix_task_subtasks_task_id ON task_subtasks(task_id);

CREATE TABLE IF NOT EXISTS task_students (
    task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    PRIMARY KEY (task_id, student_id)
);

-- Записать в alembic_version, чтобы alembic не пытался применить 0030 повторно (опционально):
-- INSERT INTO alembic_version (version_num) VALUES ('0030_task_manager') ON CONFLICT DO NOTHING;
