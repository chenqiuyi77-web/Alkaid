@echo off
echo 正在启动 Alkaid 后端服务器...

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo 未安装 Node.js，请先安装
    pause
    exit /b 1
)

if not exist "node_modules" (
    echo 检测到未安装依赖，正在安装...
    call npm install
)

echo ✅ 依赖已就绪，启动中...
node server.js
pause
