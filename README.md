# Портал управления обучением

Система управления обучением с ролями: Администратор, Тренер, Родитель, Гость.

## 🚀 Быстрый старт

**Для подробной инструкции по запуску см. [QUICK_START.md](QUICK_START.md)**

### Краткая инструкция:

1. **Установите зависимости:**
   - Python 3.8+
   - Node.js 16+
   - PostgreSQL 12+

2. **Настройте Backend:**
   ```bash
   cd backend
   python -m venv venv
   # Windows: venv\Scripts\activate
   # Linux/macOS: source venv/bin/activate
   pip install -r requirements.txt
   # Создайте .env файл (см. QUICK_START.md)
   uvicorn app.main:app --reload
   ```

3. **Настройте Frontend:**
   ```bash
   cd frontend
   npm install
   npm start
   ```

4. **Создайте первого администратора** (см. QUICK_START.md)

5. **Откройте http://localhost:3000** и войдите в систему

## 📚 Документация

- **[QUICK_START.md](QUICK_START.md)** - Подробная инструкция по установке и запуску
- **[SETUP.md](SETUP.md)** - Общая информация о проекте
- **[backend/README.md](backend/README.md)** - Документация Backend API
- **[frontend/README.md](frontend/README.md)** - Документация Frontend

## Структура проекта

- `backend/` - FastAPI приложение
- `frontend/` - React приложение с TypeScript

## Технологии

### Backend
- FastAPI
- SQLAlchemy (ORM)
- PostgreSQL
- JWT аутентификация
- Pydantic для валидации

### Frontend
- React 18
- TypeScript
- React Router
- Axios для API запросов
- Material-UI для компонентов

## Основной функционал

- ✅ Управление пользователями (Администратор, Тренер, Родитель)
- ✅ Управление учениками и группами
- ✅ Программы обучения с версионированием
- ✅ Проставление оценок тренерами
- ✅ Характеристики с согласованием
- ✅ Дашборд для родителей с аналитикой
- ✅ Отчетность и экспорт данных (XLSX/CSV)
- ✅ Глобальный поиск
- ✅ Журнал действий пользователей

## API Документация

После запуска backend доступна по адресу: http://localhost:8000/docs

## Поддержка

При возникновении проблем:
1. Проверьте [QUICK_START.md](QUICK_START.md) раздел "Решение проблем"
2. Проверьте логи в терминалах backend и frontend
3. Убедитесь, что все сервисы запущены (PostgreSQL, Backend, Frontend)

