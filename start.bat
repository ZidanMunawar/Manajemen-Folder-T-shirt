@echo off
title ZYNHOPE - Server
color 0A
cd /d "%~dp0"

cls
echo.
echo   ----------------------------------------
echo    ZYNHOPE - Manajemen Aset Baju v4.0
echo   ----------------------------------------
echo.
echo    [*] Starting server...
echo.
timeout /t 2 /nobreak >nul

:: Jalankan Chrome/Edge dalam app mode (window terpisah)
:: Pilih salah satu, hapus :: di depannya

:: Untuk Chrome:
start "" chrome --app=http://localhost:3000 --window-size=1400,900

:: Untuk Edge (alternatif):
:: start "" msedge --app=http://localhost:3000 --window-size=1400,900

echo    [*] App window opened!
echo.
echo   ----------------------------------------
echo    Server  : http://localhost:3000
echo    Pass    : 020608
echo   ----------------------------------------
echo.
echo    Press CTRL+C to stop
echo.
echo   ----------------------------------------
echo.

node server.js

echo.
echo   Server stopped.
pause >nul