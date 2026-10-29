@echo off
title Tessera Launcher - Gerar .exe
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js nao encontrado. Instale em https://nodejs.org e tente de novo.
  pause
  exit /b 1
)

rem O VS Code define ELECTRON_RUN_AS_NODE, que atrapalha o gerador
set ELECTRON_RUN_AS_NODE=

if exist dist rmdir /s /q dist
if not exist node_modules call npm install
call npm run build
if errorlevel 1 goto falhou

echo.
echo Pronto! Os arquivos .exe estao na pasta "dist".
start "" dist
pause
exit /b 0

:falhou
echo.
echo O build falhou. Veja a mensagem de erro acima.
pause
exit /b 1
