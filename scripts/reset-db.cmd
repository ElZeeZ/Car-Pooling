@echo off
setlocal

set "PROJECT_DIR=%~dp0.."
set "MYSQL=C:\Program Files\MariaDB 11.4\bin\mysql.exe"

if not exist "%MYSQL%" (
  echo MariaDB mysql.exe was not found at:
  echo %MYSQL%
  echo.
  echo Edit this script and set MYSQL to your MariaDB bin path.
  pause
  exit /b 1
)

cd /d "%PROJECT_DIR%"

echo This will delete and recreate only the carpooling_db database.
echo It will also reset the local app user: carpool_app / carpool_password
echo.
set /p CONFIRM=Type RESET and press Enter to continue: 
if /I not "%CONFIRM%"=="RESET" (
  echo Cancelled.
  pause
  exit /b 1
)

echo.
echo Dropping old carpooling_db if it exists...
"%MYSQL%" -u root -p -e "DROP DATABASE IF EXISTS carpooling_db;"
if errorlevel 1 goto failed

echo.
echo Creating schema...
"%MYSQL%" -u root -p < "database\schema.sql"
if errorlevel 1 goto failed

echo.
echo Resetting local app user...
"%MYSQL%" -u root -p < "database\local-user.sql"
if errorlevel 1 goto failed

echo.
echo Testing app login...
"%MYSQL%" -u carpool_app -pcarpool_password carpooling_db -e "SELECT 1 AS ok;"
if errorlevel 1 goto failed

echo.
echo Done. HeidiSQL can now connect with:
echo Host: 127.0.0.1
echo User: carpool_app
echo Password: carpool_password
echo Database: carpooling_db
pause
exit /b 0

:failed
echo.
echo Reset failed. Check the error above. Most likely the MariaDB root password was wrong.
pause
exit /b 1

