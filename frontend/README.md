# Frontend

React-приложение на TypeScript и Vite для портала управления обучением.

## Установка

1. Установите зависимости:
```bash
npm install
```

2. Создайте файл `.env` (опционально):
```
VITE_API_URL=http://localhost:8000
VITE_DEV_API_PROXY=http://localhost:8000
```

3. Запустите приложение:
```bash
npm start
```

Приложение будет доступно по адресу: http://localhost:3000

Для production-сборки:
```bash
npm run build
```

Сборка будет создана в директории `build/`.

## Структура

- `src/App.tsx` - главный компонент приложения
- `src/pages/` - страницы приложения
- `src/components/` - переиспользуемые компоненты
- `src/contexts/` - React контексты (AuthContext)
- `src/services/` - API клиенты
- `src/types/` - TypeScript типы

## Переменные окружения

- `VITE_API_URL` — базовый URL API для браузера.
- `VITE_DEV_API_PROXY` — proxy для локального dev-сервера Vite.
- `REACT_APP_API_URL` — legacy-совместимость со старым окружением, оставлена временно.

## Основные страницы

- `/login` - страница входа
- `/dashboard` - главная страница
- `/students` - управление учениками
- `/groups` - управление группами
- `/programs` - программы обучения
- `/grades` - оценки
- `/characteristics` - характеристики
- `/reports` - отчетность (только для администратора)
- `/parent-dashboard` - дашборд родителя

