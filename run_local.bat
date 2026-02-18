@echo off
chcp 65001 >nul
echo === Learning Portal: локальный запуск ===
echo.
echo Запуск backend в новом окне...
start "Backend 8000" cmd /k "cd /d %~dp0backend && if exist venv\Scripts\activate.bat call venv\Scripts\activate.bat && uvicorn app.main:app --reload --host 127.0.0.1 --port 8000"
timeout /t 3 /nobreak >nul
echo Запуск frontend в новом окне...
start "Frontend 3000" cmd /k "cd /d %~dp0frontend && npm start"
echo.
echo Должны открыться 2 окна. Backend: http://127.0.0.1:8000  Frontend: http://localhost:3000
echo Если порты 8000 или 3000 заняты — закройте старые окна с uvicorn или npm.
pause
