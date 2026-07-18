@echo off
title ZYNHOPE - Manajemen Aset
cd /d "%~dp0"
echo.
echo =============================================
echo   ZYNHOPE - Manajemen Aset Baju
echo =============================================
echo.
echo Menjalankan server...
echo.
start http://localhost:3000
node server.js
pause