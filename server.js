const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3190;

// 中间件
app.use(cors());
app.use(express.json({ limit: '50mb' })); // 支持大文件（图片/语音）

// 数据存储目录
const DATA_DIR = path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');

// 确保 data 目录存在
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR);
}

// 用户数据管理
function getUsers() {
    if (fs.existsSync(USERS_FILE)) {
        try {
            return JSON.parse(fs.readFileSync(USERS_FILE));
        } catch {
            return {};
        }
    }
    return {};
}

function saveUsers(users) {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

// ============ API 路由 ============

// 健康检查
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', message: 'Alkaid 后端运行中' });
});

// 获取所有用户列表
app.get('/api/users', (req, res) => {
    try {
        const users = getUsers();
        res.json({ success: true, users: Object.keys(users) });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 创建/更新用户数据
app.post('/api/save', (req, res) => {
    try {
        const { userId, data } = req.body;
        if (!userId) {
            return res.status(400).json({ error: '缺少 userId' });
        }
        
        const users = getUsers();
        users[userId] = {
            ...users[userId],
            ...data,
            lastUpdated: new Date().toISOString()
        };
        saveUsers(users);
        
        res.json({ success: true, message: `用户 ${userId} 数据保存成功` });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 读取用户数据
app.get('/api/load/:userId', (req, res) => {
    try {
        const userId = req.params.userId;
        const users = getUsers();
        
        if (users[userId]) {
            res.json({ success: true, data: users[userId] });
        } else {
            res.json({ success: true, data: {} });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 删除用户数据
app.delete('/api/delete/:userId', (req, res) => {
    try {
        const userId = req.params.userId;
        const users = getUsers();
        
        if (users[userId]) {
            delete users[userId];
            saveUsers(users);
            res.json({ success: true, message: `用户 ${userId} 已删除` });
        } else {
            res.status(404).json({ error: '用户不存在' });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============ 启动服务器 ============
app.listen(PORT, () => {
    console.log('Alkaid 后端服务已启动');
    console.log(`地址: http://localhost:${PORT}`);
    console.log(`数据存储: ${DATA_DIR}`);
    console.log('前端需要配置 API_BASE_URL 为 http://localhost:3190');
});
