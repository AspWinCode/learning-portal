# 📦 Установка Node.js и npm на Windows

## Проблема: "npm не распознано как команда"

Если вы видите ошибку `npm : Имя "npm" не распознано`, это означает, что Node.js либо не установлен, либо не добавлен в PATH.

---

## ✅ Решение 1: Установка Node.js (если не установлен)

### Шаг 1: Скачайте Node.js

1. Перейдите на официальный сайт: https://nodejs.org/
2. Скачайте **LTS версию** (рекомендуется, например, 20.x.x)
   - Выберите "Windows Installer (.msi)" для 64-bit
   - Или прямую ссылку: https://nodejs.org/dist/v20.11.0/node-v20.11.0-x64.msi

### Шаг 2: Установка

1. **Запустите установщик** (например, `node-v20.11.0-x64.msi`)

2. **Следуйте мастеру установки:**
   - Нажмите "Next" на всех экранах
   - ✅ **ВАЖНО:** Убедитесь, что отмечена опция **"Add to PATH"** (добавить в PATH)
   - Принимайте значения по умолчанию

3. **Завершите установку:**
   - Нажмите "Install"
   - Дождитесь окончания
   - Нажмите "Finish"

### Шаг 3: Проверка установки

1. **Закройте и откройте PowerShell заново** (важно!)

2. **Проверьте версию Node.js:**
   ```powershell
   node --version
   ```
   Должно показать что-то вроде: `v20.11.0`

3. **Проверьте версию npm:**
   ```powershell
   npm --version
   ```
   Должно показать что-то вроде: `10.2.4`

4. **Если команды работают**, переходите к [Установке зависимостей проекта](#установка-зависимостей-проекта)

---

## ✅ Решение 2: Добавление в PATH (если Node.js установлен, но не в PATH)

### Вариант A: Через графический интерфейс

1. **Найдите путь к Node.js:**
   - Обычно: `C:\Program Files\nodejs\`
   - Или: `C:\Program Files (x86)\nodejs\`

2. **Добавьте в PATH:**
   - Нажмите `Win + R`
   - Введите: `sysdm.cpl` и нажмите Enter
   - Перейдите на вкладку "Дополнительно"
   - Нажмите "Переменные среды"
   - В разделе "Системные переменные" найдите `Path`
   - Нажмите "Изменить"
   - Нажмите "Создать"
   - Вставьте путь: `C:\Program Files\nodejs`
   - Нажмите "ОК" везде
   - **Перезапустите PowerShell**

3. **Проверьте:**
   ```powershell
   node --version
   npm --version
   ```

### Вариант B: Через PowerShell (временно для текущей сессии)

```powershell
# Добавить в PATH для текущей сессии
$env:Path += ";C:\Program Files\nodejs"

# Проверка
node --version
npm --version
```

### Вариант C: Через PowerShell (постоянно)

```powershell
# Добавить в PATH постоянно
[Environment]::SetEnvironmentVariable("Path", $env:Path + ";C:\Program Files\nodejs", "User")
```

**После этого закройте и откройте PowerShell заново.**

---

## ✅ Решение 3: Использование полного пути (без добавления в PATH)

Если не хотите добавлять в PATH, используйте полный путь:

```powershell
# Замените версию на вашу
& "C:\Program Files\nodejs\npm.cmd" install
```

---

## 📦 Установка зависимостей проекта

После того, как `npm` работает:

1. **Перейдите в директорию frontend:**
   ```powershell
   cd "C:\Users\direc\Downloads\new project\frontend"
   ```

2. **Установите зависимости:**
   ```powershell
   npm install
   ```

   Это может занять несколько минут. Дождитесь завершения.

3. **Проверьте, что установка прошла успешно:**
   - Должно появиться сообщение о завершении
   - Должна появиться папка `node_modules`

4. **Запустите проект:**
   ```powershell
   npm start
   ```

---

## 🔍 Проверка установки Node.js

Если не уверены, установлен ли Node.js:

1. **Проверьте через PowerShell:**
   ```powershell
   node --version
   npm --version
   ```

2. **Проверьте через Проводник:**
   - Откройте `C:\Program Files\nodejs\`
   - Должны быть файлы: `node.exe`, `npm.cmd`

3. **Проверьте через меню "Пуск":**
   - Найдите "Node.js command prompt"
   - Если есть - Node.js установлен

---

## ⚠️ Частые проблемы

### Проблема: "npm install" долго выполняется или падает

**Решение:**
1. Очистите кеш:
   ```powershell
   npm cache clean --force
   ```

2. Удалите `node_modules` и `package-lock.json`:
   ```powershell
   Remove-Item -Recurse -Force node_modules
   Remove-Item package-lock.json
   npm install
   ```

3. Используйте другой реестр (если проблемы с доступом):
   ```powershell
   npm config set registry https://registry.npmjs.org/
   ```

### Проблема: "Permission denied" или "Access denied"

**Решение:**
- Запустите PowerShell от имени администратора
- Или установите Node.js для текущего пользователя (не для всех)

### Проблема: Старая версия npm

**Решение:**
```powershell
# Обновление npm до последней версии
npm install -g npm@latest
```

### Проблема: Конфликт версий Node.js

**Решение:**
- Используйте менеджер версий Node.js (nvm-windows):
  - Скачайте: https://github.com/coreybutler/nvm-windows/releases
  - Установите и используйте для переключения версий

---

## 🎯 Альтернатива: Использование Yarn

Если npm не работает, можно использовать Yarn:

1. **Установите Yarn:**
   ```powershell
   npm install -g yarn
   ```

2. **Используйте вместо npm:**
   ```powershell
   yarn install    # вместо npm install
   yarn start      # вместо npm start
   ```

---

## ✅ Чек-лист

- [ ] Node.js установлен
- [ ] Команда `node --version` работает
- [ ] Команда `npm --version` работает
- [ ] Переход в `frontend` директорию выполнен
- [ ] Команда `npm install` выполнена успешно
- [ ] Папка `node_modules` создана
- [ ] Команда `npm start` запускает проект

---

## 📝 Следующие шаги

После успешной установки Node.js и npm:

1. Установите зависимости frontend: `npm install`
2. Запустите frontend: `npm start`
3. Frontend будет доступен на http://localhost:3000

**Готово! Теперь можно работать с frontend проектом.** 🎉

