#!/bin/bash

echo "🔄 正在更新 Alkaid..."

cd ~/Alkaid

# 拉取最新代码
git pull

# 安装依赖（如果有新增）
npm install

# 复制前端文件到 Nginx
cp *.html *.css *.js $PREFIX/share/nginx/html/

# 重启 Nginx
nginx -s stop 2>/dev/null
nginx

# 重启后端
pkill -f "node server.js" 2>/dev/null
node server.js &

echo "✅ 更新完成！"
echo "🌐 请刷新浏览器"
