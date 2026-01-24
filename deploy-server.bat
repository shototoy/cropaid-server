@echo off
echo ==========================================
echo   CropAid Server Deployment Script
echo ==========================================

REM 1. Check Prereqs
node -v >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed! Please install Node.js first.
    pause
    exit /b
)

REM 2. Install Dependencies
echo [INFO] Installing dependencies...
call npm install --omit=dev

REM 3. Clean Setup Check
if not exist .env (
    echo [WARNING] .env file not found! creating default...
    echo DB_HOST=localhost>> .env
    echo DB_USER=root>> .env
    echo DB_PASSWORD=>> .env
    echo DB_NAME=cropaid>> .env
    echo PORT=3000>> .env
    echo JWT_SECRET=change_this_secret_in_production>> .env
    echo [INFO] Created basic .env. Please edit it if your DB password is not empty.
    notepad .env
)

REM 4. Database Setup
echo.
echo ==========================================
echo Database Initialization
echo ==========================================
echo Do you want to RESET/INITIALIZE the database?
echo This will DROP the 'cropaid' database and re-create it with static data.
set /p RESET_DB="Type 'yes' to proceed, or press Enter to skip: "

if /i "%RESET_DB%"=="yes" (
    echo [INFO] Running Setup and Simulation...
    call npm run reset
    if %errorlevel% neq 0 (
        echo [ERROR] Database setup failed. Check your DB credentials in .env
        pause
    )
) else (
    echo [INFO] Skipping database setup.
)

REM 5. Start Server
echo.
echo ==========================================
echo Starting Server
echo ==========================================
echo Choose startup method:
echo 1. Simple (Keep this window open)
echo 2. PM2 Service + Autorun (Background & Start on Boot)
set /p START_METHOD="Enter 1 or 2: "

if "%START_METHOD%"=="2" (
    echo [INFO] Installing PM2 and Windows Startup Utility...
    call npm install -g pm2 pm2-windows-startup
    
    echo [INFO] Starting 'cropaid-server'...
    REM Stop old instances if any
    call pm2 stop cropaid-server >nul 2>&1
    call pm2 delete cropaid-server >nul 2>&1
    
    call pm2 start index.js --name "cropaid-server"
    call pm2 save
    
    echo [INFO] Configuring Autorun on Boot...
    call pm2-startup install
    
    echo [SUCCESS] Server running in background and Auto-Start enabled!
) else (
    echo [INFO] Starting server... (Press Ctrl+C to stop)
    node index.js
)

pause
