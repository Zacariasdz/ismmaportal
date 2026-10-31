@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>&1
if errorlevel 1 (
  echo ERRO: O Node.js nao foi encontrado.
  echo Instale Node.js 24 LTS e tente novamente.
  pause
  exit /b 1
)
echo =============================================
echo    ISMMA - SISTEMA DE ATENDIMENTO ONLINE
echo =============================================
echo.
echo Abra no navegador: http://localhost:3000
node server.js
echo.
echo O servidor foi encerrado.
pause
