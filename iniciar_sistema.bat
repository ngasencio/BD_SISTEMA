@echo off
title BD_SISTEMA — Iniciando servidores
color 0A

echo.
echo  ============================================
echo   BD SISTEMA — Servicio de Salud Osorno
echo  ============================================
echo.

REM Verificar que MySQL este corriendo
echo [1/3] Verificando MySQL (XAMPP)...
"C:\xampp\mysql\bin\mysql.exe" -u bd_sistema_app -pBdSistema2025# -e "SELECT 1;" >nul 2>&1
IF ERRORLEVEL 1 (
    echo  ERROR: MySQL no esta corriendo.
    echo  Abre XAMPP Control Panel e inicia MySQL primero.
    echo.
    pause
    exit /b 1
)
echo  MySQL OK

echo.
echo [2/3] Iniciando Django (backend :8000)...
start "Django Backend" cmd /k "cd /d C:\Users\usuario\Desktop\BD_SISTEMA\backend && python manage.py runserver 0.0.0.0:8000"

timeout /t 3 /nobreak >nul

echo.
echo [3/3] Iniciando Vite (frontend :5173)...
start "Vite Frontend" cmd /k "cd /d C:\Users\usuario\Desktop\BD_SISTEMA\frontend && npm run dev"

echo.
echo  ============================================
echo   Sistema iniciado correctamente
echo.
echo   Frontend: http://10.8.153.227:5173/bd_sistema/
echo   Backend:  http://10.8.153.227:8000/api/
echo  ============================================
echo.
echo  Cierra las ventanas de Django y Vite para detener los servidores.
echo.
pause
