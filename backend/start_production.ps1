# ─── BD_SISTEMA — Servidor de producción (Waitress) ──────────────────────────
# Ejecutar desde: backend\  →  .\start_production.ps1
# Prerequisitos: pip install waitress whitenoise  +  npm run build en frontend/

Set-Location $PSScriptRoot

Write-Host "=== BD_SISTEMA Produccion ===" -ForegroundColor Cyan
Write-Host "SPA: http://10.8.153.227:8000/bd_sistema/" -ForegroundColor Green
Write-Host "Admin: http://10.8.153.227:8000/admin/" -ForegroundColor Green
Write-Host "Presiona Ctrl+C para detener." -ForegroundColor Yellow
Write-Host ""

python -m waitress --listen=0.0.0.0:8000 --threads=8 core.wsgi:application
