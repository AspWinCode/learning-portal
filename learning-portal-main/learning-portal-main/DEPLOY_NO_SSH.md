# Деплой без SSH доступа

## Текущая ситуация
- Сервер: `80.87.201.25`
- Docker: используется
- SSH: нет доступа
- GitHub: https://github.com/AspWinCode/learning-portal.git

## ✅ Что уже готово в коде
Все 4 задачи выполнены и закоммичены:
1. ✅ Увеличен сеанс до 8 часов (480 минут)
2. ✅ Редактирование оценок разрешено
3. ✅ Оценки за прошедшие даты разрешены
4. ✅ Архивация аккаунтов добавлена

Код в GitHub: коммит `56aa6ea`

---

## 🚀 Варианты деплоя

### Вариант 1: Через панель управления хостингом

Если у хостинга есть веб-панель (Portainer, Webmin, ISPmanager, etc.):

1. Откройте панель управления хостингом
2. Найдите раздел "Терминал" или "Console"
3. Выполните команды:

```bash
cd /root/learning-portal  # или путь к проекту
git pull origin main
docker compose build
docker compose up -d
```

4. Обновите `.env` файл (добавьте `ACCESS_TOKEN_EXPIRE_MINUTES=480`)

---

### Вариант 2: Через Portainer (если установлен)

1. Откройте Portainer: `http://80.87.201.25:9000` (или ваш порт)
2. Перейдите в "Stacks" → найдите `learning-portal`
3. Нажмите "Editor" → обновите `docker-compose.yml` (если нужно)
4. Нажмите "Update the stack"
5. Или через "Containers" → остановите и пересоздайте контейнеры

---

### Вариант 3: GitHub Actions с Webhook (автоматический)

**На сервере нужно настроить один раз:**

1. Установить webhook listener (через панель или попросить админа):

```bash
# Способ 1: через webhook (Node.js)
npm install -g webhook
webhook -hooks /root/learning-portal/hooks.json -verbose -port 9001

# Способ 2: через Python
pip install flask
# создать простой Flask сервер на порту 9001
```

2. Загрузить файлы на сервер:
   - `deploy.sh` (скрипт деплоя)
   - `hooks.json` (конфигурация webhook)

3. Сделать `deploy.sh` исполняемым:
```bash
chmod +x /root/learning-portal/deploy.sh
```

4. Настроить GitHub webhook:
   - GitHub → Repository → Settings → Webhooks
   - Payload URL: `http://80.87.201.25:9001/hooks/learning-portal-deploy`
   - Content type: `application/json`
   - Secret: (ваш секретный ключ)
   - Events: "Just the push event"

**После настройки:** каждый `git push` будет автоматически деплоить на сервер!

---

### Вариант 4: Watchtower (автоматическое обновление Docker образов)

Если на сервере есть Watchtower:

```bash
# Добавить в docker-compose.yml:
watchtower:
  image: containrrr/watchtower
  volumes:
    - /var/run/docker.sock:/var/run/docker.sock
  command: --interval 300 --cleanup
```

Watchtower будет автоматически проверять и обновлять контейнеры каждые 5 минут.

---

### Вариант 5: Попросить админа сервера

Отправьте администратору сервера эти команды:

```bash
cd /root/learning-portal
git pull origin main
docker compose down
docker compose build
docker compose up -d

# Опционально: очистка старых образов
docker system prune -f
```

И обновить `.env`:
```bash
echo "ACCESS_TOKEN_EXPIRE_MINUTES=480" >> /root/learning-portal/backend/.env
docker compose restart backend
```

---

## 📋 Checklist после деплоя

После успешного деплоя проверьте:

- [ ] Backend доступен: `http://80.87.201.25:8000/docs`
- [ ] Frontend доступен: `http://80.87.201.25` (или ваш домен)
- [ ] Тест сеанса: войдите и подождите 10+ минут (не должно выкидывать)
- [ ] Тест редактирования оценок: поставьте оценку → попробуйте отредактировать
- [ ] Тест прошедших дат: поставьте оценку за вчера
- [ ] Тест архивации: попробуйте архивировать sales manager

---

## 🆘 Если ничего не работает

Свяжитесь с администратором сервера или предоставьте:
- Доступ к панели управления хостингом
- Либо временный SSH доступ для настройки автодеплоя
- Либо настройте VPN/туннель для удаленного доступа

---

## 📝 Примечание

Текущие изменения в коде **не требуют миграций БД**, поэтому запускать `alembic upgrade head` не нужно. Достаточно просто пересобрать контейнеры.
