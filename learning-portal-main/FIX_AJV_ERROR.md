# 🔧 Решение ошибки: "Cannot find module 'ajv/dist/compile/codegen'"

## Проблема

Ошибка `Cannot find module 'ajv/dist/compile/codegen'` возникает из-за несовместимости или отсутствия правильной версии пакета `ajv`.

---

## ✅ Решение 1: Переустановка зависимостей (Рекомендуется)

### Шаг 1: Удалите node_modules и package-lock.json

```powershell
# Удаление node_modules
Remove-Item -Recurse -Force node_modules -ErrorAction SilentlyContinue

# Удаление package-lock.json
Remove-Item package-lock.json -ErrorAction SilentlyContinue
```

### Шаг 2: Очистите npm кеш

```powershell
npm cache clean --force
```

### Шаг 3: Переустановите зависимости

```powershell
npm install --legacy-peer-deps
```

### Шаг 4: Попробуйте запустить снова

```powershell
npm start
```

---

## ✅ Решение 2: Установка ajv вручную

Я уже добавил `ajv` в `package.json`. Теперь выполните:

```powershell
# Установка ajv
npm install ajv@^8.12.0 --save-dev --legacy-peer-deps

# Или переустановите все зависимости
npm install --legacy-peer-deps
```

---

## ✅ Решение 3: Исправление версий зависимостей

Если проблема сохраняется, попробуйте зафиксировать версии:

```powershell
# Установка конкретных версий
npm install ajv@8.12.0 ajv-keywords@5.1.0 --save-dev --legacy-peer-deps
```

---

## ✅ Решение 4: Использование резолюции зависимостей

Создайте или обновите файл `package.json`, добавив секцию `overrides` (для npm 8.3+):

```json
{
  "overrides": {
    "ajv": "^8.12.0"
  }
}
```

Или используйте `resolutions` (для yarn):

```json
{
  "resolutions": {
    "ajv": "^8.12.0"
  }
}
```

---

## 🔍 Что было исправлено

Я добавил `ajv` версии `^8.12.0` в `devDependencies` в `package.json`. Это должно решить проблему.

Теперь выполните:

```powershell
npm install --legacy-peer-deps
npm start
```

---

## 🎯 Полная последовательность команд

```powershell
# 1. Удаление старых зависимостей
Remove-Item -Recurse -Force node_modules -ErrorAction SilentlyContinue
Remove-Item package-lock.json -ErrorAction SilentlyContinue

# 2. Очистка кеша
npm cache clean --force

# 3. Установка зависимостей
npm install --legacy-peer-deps

# 4. Запуск проекта
npm start
```

---

## ⚠️ Если проблема сохраняется

### Вариант 1: Обновление react-scripts

```powershell
npm install react-scripts@latest --save-dev --legacy-peer-deps
```

### Вариант 2: Использование yarn вместо npm

```powershell
# Установка yarn
npm install -g yarn

# Использование yarn
yarn install
yarn start
```

### Вариант 3: Проверка версии Node.js

Убедитесь, что используется совместимая версия Node.js:

```powershell
node --version
```

Для `react-scripts@5.0.1` рекомендуется Node.js 14+ или 16+.

---

## 📋 Понимание проблемы

### Что такое ajv?

`ajv` (Another JSON Schema Validator) - это библиотека для валидации JSON схем. Она используется `webpack-dev-server` и другими инструментами сборки.

### Почему возникает ошибка?

- Несовместимость версий между `ajv` и `ajv-keywords`
- Неполная установка зависимостей
- Конфликты версий из-за использования `--legacy-peer-deps`

### Решение

Добавление явной зависимости `ajv@^8.12.0` гарантирует, что правильная версия будет установлена.

---

## ✅ Чек-лист

- [ ] `ajv` добавлен в `package.json` (уже сделано)
- [ ] `node_modules` удален
- [ ] `package-lock.json` удален
- [ ] npm кеш очищен
- [ ] Зависимости переустановлены с `--legacy-peer-deps`
- [ ] `npm start` запускается без ошибок

---

## 🚀 После исправления

После успешной установки проект должен запуститься:

```powershell
npm start
```

Вы должны увидеть:
```
Compiled successfully!

You can now view learning-portal-frontend in the browser.

  Local:            http://localhost:3000
```

---

**Попробуйте переустановку зависимостей сейчас!** 🎯

