@echo off
echo AI Workspace 시작 중...

start "Backend (3001)" cmd /k "cd /d %~dp0packages\backend && npx tsx src/server.ts"
timeout /t 2 /nobreak >nul
start "Frontend (3000)" cmd /k "cd /d %~dp0packages\frontend && npm run dev"

echo.
echo 백엔드: http://localhost:3001
echo 프론트: http://localhost:3000
echo.
echo 브라우저가 자동으로 열립니다...
timeout /t 3 /nobreak >nul
start http://localhost:3000
