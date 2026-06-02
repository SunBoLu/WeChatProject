# 部署说明 - 坏来好修理小程序

## 1. 免费数据库部署（Supabase）

### 1.1 注册 Supabase
访问 https://supabase.com ，点击 **"Start for Free"**，使用 GitHub 账号登录。

### 1.2 创建数据库项目
1. 在 Dashboard 中点击 **"New Project"**
2. 选择组织（如无则创建）
3. 填写项目名称（如 `appliance-service`）
4. 数据库密码：设置一个强密码并**记下来**
5. **Region**：选择 **Tokyo（ap-northeast-1）** 或 **Singapore（ap-southeast-1）**（靠近中国）
6. 点击 **"Create Project"**，等待 2-3 分钟初始化

### 1.3 初始化数据库表结构
1. 在 Supabase Dashboard 左侧菜单 → **SQL Editor**
2. 点击 **"New Query"**
3. 复制 `backend/schema.sql` 的全部内容粘贴进去
4. 点击 **"Run"** 执行，创建所有表

### 1.4 获取连接字符串
1. 在 Supabase Dashboard → **Settings** → **Database**
2. 滚动到 **Connection Pooling** 区域
3. 切换到 **Session mode**（重要！Render 是 IPv4-only，必须用 Pooler）
4. 复制 Session mode 连接字符串，格式如下：
   ```
   postgresql://postgres.[PROJECT_REF]:[YOUR_PASSWORD]@aws-0-ap-northeast-1.pooler.supabase.co:5432/postgres
   ```

### 1.5 更新后端 .env 文件
将上一步复制的连接字符串替换到 `backend/.env` 中的 `DATABASE_URL`：

```env
DATABASE_URL=postgresql://postgres.xxxxx:your_password@aws-0-ap-northeast-1.pooler.supabase.co:5432/postgres
PORT=3000
NODE_ENV=production
ENCRYPTION_KEY=aes-256-cbc-key-32bytes-long!!
ENCRYPTION_IV=1234567890123456
```

## 2. 免费后端服务器部署（Render.com）

Render.com 提供免费 HTTPS 服务，完美支持微信小程序（微信要求 HTTPS + 备案域名）。

### 2.1 注册 Render 账号
访问 https://render.com ，使用 GitHub 账号注册登录。

### 2.2 准备工作
将整个项目推送到 GitHub 仓库（或 Render 支持的 Git 仓库）。

### 2.3 创建 Web Service
1. 点击 Dashboard 中的 **"New +"** → **"Web Service"**
2. 连接代码仓库
3. 配置如下：
   - **Name**: `appliance-service-api`
   - **Root Directory**: `backend`
   - **Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Region**: 选择 **Singapore**（靠近中国，延迟更低）
   - **Plan**: `Free`

### 2.4 配置环境变量
在 Render 的 Environment 标签中添加上面的所有环境变量（DATABASE_URL、ENCRYPTION_KEY、ENCRYPTION_IV 等）。

### 2.5 部署
点击 **"Create Web Service"**，Render 会自动部署。部署后 HTTPS 地址格式为：
`https://appliance-service-api.onrender.com`

### 2.6 更新小程序 API 地址
修改 `utils/api.js`：
```javascript
const API_BASE_URL = 'https://appliance-service-api.onrender.com/api';
```

### 2.7 微信小程序白名单配置
在微信小程序管理后台：
1. 进入 **开发** → **开发管理** → **开发设置** → **服务器域名**
2. 在 **request 合法域名** 中添加：`https://appliance-service-api.onrender.com`
3. 保存配置

## 3. 本地开发（ngrok 方案）

### 3.1 启动后端
```bash
cd backend
npm install
npm start
```

### 3.2 启动 ngrok 隧道
```bash
ngrok http 3000
```

### 3.3 切换 API 地址
```javascript
const API_BASE_URL = 'https://xxxx.ngrok-free.app/api';
```

## 4. Supabase 免费计划限制及对策

| 限制 | 数值 | 对策 |
|------|------|------|
| 数据库容量 | 500 MB | 图片以 base64 存入数据库，建议定期清理旧聊天图片 |
| 带宽 | 5 GB/月 | 正常使用不会超 |
| 项目暂停 | 7 天无活动 | 后端定期请求数据库即保持活跃 |
| 连接数 | 60 直连 / 200 池 | 使用 Session Pooler，绰绰有余 |
| 活跃项目 | 2 个 | 够用 |

## 5. 超级管理员收款二维码设置

1. 使用超级管理员账号登录管理后台
2. 进入 **管理员管理** 页面
3. 点击 **设置收款二维码**，上传微信收款二维码

## 6. 安全注意事项

1. 部署到 Render 后务必更换 `ENCRYPTION_KEY` 和 `ENCRYPTION_IV` 为随机字符串（32位和16位）
2. 不要将 `.env` 文件提交到 Git 仓库（已加入 `.gitignore`）
3. 数据库密码不要泄露