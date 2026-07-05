#!/bin/bash

echo "正在启动 Alkaid 后端服务器..."

# 检查是否安装了 Node.js
if ! command -v node &> /dev/null; then
    echo "未安装 Node.js，请先安装"
    exit 1
fi

# 检查依赖是否已安装
if [ ! -d "node_modules" ]; then
    echo "检测到未安装依赖，正在安装..."
    npm install
fi

# 启动服务器
echo "✅ 依赖已就绪，启动中..."
node server.js
