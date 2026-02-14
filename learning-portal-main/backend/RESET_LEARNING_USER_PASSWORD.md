# Сброс пароля learning_user без знания пароля postgres

PostgreSQL можно на короткое время настроить так, чтобы на localhost не спрашивать пароль. Тогда вы подключитесь и зададите пароль `learning_user`.

---

## Шаг 1. Найти и открыть pg_hba.conf

Файл обычно здесь (подставьте свою версию, например 16 или 18):

```
C:\Program Files\PostgreSQL\18\data\pg_hba.conf
```

Откройте его **от имени администратора** (Блокнот: ПКМ → «Запуск от имени администратора», затем Файл → Открыть и укажите этот путь).

---

## Шаг 2. Сделать резервную копию

Скопируйте весь файл и сохраните как `pg_hba.conf.backup` в той же папке.

---

## Шаг 3. Временно разрешить вход без пароля

В начале файла найдите блок с такими строками:

```
# TYPE  DATABASE        USER            ADDRESS                 METHOD
host    all             all             127.0.0.1/32            scram-sha-256
host    all             all             ::1/128                 scram-sha-256
```

Или с `md5` вместо `scram-sha-256`.

**Замените** `scram-sha-256` (или `md5`) на **`trust`** только для этих двух строк:

```
host    all             all             127.0.0.1/32            trust
host    all             all             ::1/128                 trust
```

Сохраните файл.

---

## Шаг 4. Перезапустить PostgreSQL

Откройте PowerShell **от имени администратора** и выполните:

```powershell
Restart-Service postgresql-x64-18
```

(Если версия 16, то `postgresql-x64-16`. Имя службы можно посмотреть: `Get-Service *postgres*`.)

---

## Шаг 5. Задать пароль learning_user

В обычном PowerShell (уже не обязательно от администратора):

```powershell
cd "C:\Users\direc\Downloads\learning-portal-main\learning-portal-main\backend"
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -h localhost -c "ALTER USER learning_user WITH PASSWORD 'localdev123';"
```

Пароль запрашиваться не должен. Должно появиться сообщение `ALTER ROLE`.

---

## Шаг 6. Вернуть безопасность (обязательно)

Снова откройте `pg_hba.conf` от имени администратора и **верните** в тех же двух строках `trust` обратно на **`scram-sha-256`** (или как было — `md5`):

```
host    all             all             127.0.0.1/32            scram-sha-256
host    all             all             ::1/128                 scram-sha-256
```

Сохраните файл.

---

## Шаг 7. Снова перезапустить PostgreSQL

```powershell
Restart-Service postgresql-x64-18
```

---

## Шаг 8. Дальше — миграции и админ

В папке backend:

```powershell
.\venv\Scripts\Activate.ps1
alembic upgrade head
python create_admin_fixed.py
```

После этого можно заходить на http://localhost:3000 с логином `admin@example.com` и паролем `admin123`.
