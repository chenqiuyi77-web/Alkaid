#!/bin/bash

echo "🌙 正在启动 Alkaid..."

# 进入项目目录
cd ~/Alkaid

# 启动后端 (Node.js)
if ! pgrep -f "node server.js" > /dev/null; then
    echo "🚀 启动后端服务 (端口 3190)..."
    node server.js &
    sleep 2
else
    echo "✅ 后端已运行"
fi

# 启动 Nginx (前端)
if ! pgrep nginx > /dev/null; then
    echo "🚀 启动 Nginx (端口 8080)..."
    nginx
    sleep 1
else
    echo "✅ Nginx 已运行"
fi

# 打开浏览器
echo "🌐 打开浏览器..."
am start -a android.intent.action.VIEW -d http://localhost:8080

echo "✅ Alkaid 已启动！"
echo "📍 后端: http://localhost:3190"
echo "📍 前端: http://localhost:8080"
