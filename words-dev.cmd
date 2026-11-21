@echo off
chcp 65001 >nul
rem Abre Words en modo desarrollo (recarga en vivo).
rem Para detenerlo: Ctrl+C en esta ventana, o "Salir" en el icono de la bandeja (junto al wifi).
cd /d "%~dp0"
if not exist node_modules (
  echo Instalando dependencias, solo la primera vez...
  call npm install
  if errorlevel 1 exit /b 1
)
netstat -ano | findstr /R /C:":1420 .*LISTENING" >nul
if not errorlevel 1 (
  echo El puerto 1420 ya esta en uso: probablemente Words ya se esta ejecutando.
  echo Abrela desde el icono de la bandeja ^(junto al wifi^) o cierra el otro proceso y vuelve a intentar.
  pause
  exit /b 1
)
call npm run tauri dev
pause
