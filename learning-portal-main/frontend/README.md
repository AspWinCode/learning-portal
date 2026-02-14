# Frontend

React приложение с TypeScript для портала управления обучением.

## Установка

1. Установите зависимости:
```bash
npm install
```

2. Создайте файл `.env` (опционально):
```
REACT_APP_API_URL=http://localhost:8000
```

3. Запустите приложение:
```bash
npm start
```

Приложение будет доступно по адресу: http://localhost:3000

## Структура

- `src/App.tsx` - главный компонент приложения
- `src/pages/` - страницы приложения
- `src/components/` - переиспользуемые компоненты
- `src/contexts/` - React контексты (AuthContext)
- `src/services/` - API клиенты
- `src/types/` - TypeScript типы

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

