@echo off
title BD_SISTEMA — Iniciando servidores
color 0A

echo.
echo  ============================================
echo   BD SISTEMA — Servicio de Salud Osorno
echo  ============================================
echo.

REM --- Limpiar procesos anteriores para evitar acumulacion en puerto 8000 ---
echo [0/3] Limpiando procesos anteriores...

REM Cerrar ventanas Django/Vite que hayan quedado abiertas
taskkill /FI "WINDOWTITLE eq Django Backend" /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq Vite Frontend" /F >nul 2>&1

REM Matar procesos Python que ocupen el puerto 8000
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr ":8000 " ^| findstr "LISTENING"') do (
    taskkill /PID %%a /F >nul 2>&1
)

REM Matar procesos Node que ocupen el puerto 5173
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr ":5173 " ^| findstr "LISTENING"') do (
    taskkill /PID %%a /F >nul 2>&1
)

timeout /t 2 /nobreak >nul
echo  Limpieza OK

echo.

REM --- Verificar MySQL ---
echo [1/3] Verificando MySQL (XAMPP)...
netstat -ano 2>nul | findstr ":3306 " | findstr "LISTENING" >nul 2>&1
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

timeout /t 4 /nobreak >nul

echo.
echo [3/3] Iniciando Vite (frontend :5173)...
start "Vite Frontend" cmd /k "cd /d C:\Users\usuario\Desktop\BD_SISTEMA\frontend && npm run dev"

echo.
echo  ============================================
echo   Sistema iniciado correctamente
echo.
echo   Frontend: http://10.8.153.227:5173/gestion-sso/
echo   Backend:  http://10.8.153.227:8000/api/
echo  ============================================
echo.
echo  Cierra las ventanas de Django y Vite para detener los servidores.
echo.
pause
