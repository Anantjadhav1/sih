@echo off
rem One-click start for the Land Governance platform on Windows.
rem   First run : sets up Python and website packages (a few minutes, needs internet).
rem   Later runs: starts straight away.
rem   To stop   : close the two server windows this opens.
setlocal
cd /d "%~dp0"

rem --- Python. Prefer the "py" launcher: it always finds a normal Windows Python.
rem     A bare "python" can be MSYS2/mingw, whose packages fail to install.
where py >nul 2>nul && (set "PY=py -3") || (set "PY=python")
%PY% -c "import sys; sys.exit(sys.version_info < (3, 10))" >nul 2>nul
if errorlevel 1 (
  echo Python 3.10 or newer is needed. Install it from https://www.python.org/downloads/
  goto :fail
)

where npm >nul 2>nul
if errorlevel 1 (
  echo Node.js 18 or newer is needed. Install it from https://nodejs.org/
  goto :fail
)

rem --- Backend packages, in their own environment. Reinstalled only when
rem     requirements.txt changes since the last successful install.
set "VENV=backend\.venv"
if not exist "%VENV%\Scripts\python.exe" (
  echo Creating the Python environment...
  %PY% -m venv "%VENV%" || goto :fail
)
fc /b backend\requirements.txt "%VENV%\installed.txt" >nul 2>nul
if errorlevel 1 (
  echo Installing backend packages...
  "%VENV%\Scripts\python.exe" -m pip install --disable-pip-version-check -r backend\requirements.txt || goto :fail
  copy /y backend\requirements.txt "%VENV%\installed.txt" >nul
)

rem --- Website packages
if not exist frontend\node_modules (
  echo Installing website packages...
  pushd frontend
  call npm install || (popd & goto :fail)
  popd
)
if not exist frontend\.env.local copy frontend\.env.local.example frontend\.env.local >nul

rem --- Start both servers in their own windows
echo Starting the backend on http://localhost:8000
start "Land Governance - backend (close to stop)" /d "%~dp0backend" cmd /k .venv\Scripts\python.exe -m uvicorn main:app --port 8000
echo Starting the website on http://localhost:3000
start "Land Governance - website (close to stop)" /d "%~dp0frontend" cmd /k npm run dev

rem --- Open the browser once the website answers. The first request also
rem     compiles the page, so it can take up to a minute.
echo Waiting for the website to be ready...
rem     (ping is the pause: "timeout" refuses to run when input is redirected)
where curl >nul 2>nul
if errorlevel 1 (
  ping -n 26 127.0.0.1 >nul
  goto :open
)
for /l %%i in (1,1,60) do (
  curl -s -o nul -m 180 http://localhost:3000 && goto :open
  ping -n 3 127.0.0.1 >nul
)
:open
start "" http://localhost:3000
echo.
echo Ready at http://localhost:3000 - demo sign-ins are listed on the first screen.
echo To stop, close the two server windows. This window can be closed now.
timeout /t 15 >nul 2>nul
exit /b 0

:fail
echo.
echo Setup did not finish - see the messages above.
pause
exit /b 1
