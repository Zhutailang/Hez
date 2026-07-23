# Hez — 项目设计文档

> 本文档供 LLM 快速理解项目全貌。包含技术栈、部署架构、设计思路、目录结构等关键信息。
> 最后更新：2026-07-23

---

## 一、项目概述

Hez 是一个**多人实时语音通话**应用，类似 Discord 语音频道，但更轻量。核心特点：

- 基于自托管 **LiveKit SFU** 实现 WebRTC 语音
- 支持**多区域节点**（首尔 + 国内），管理员可在运行时切换
- 内置 QQ 风格**群聊**（通过 LiveKit DataChannel，非独立聊天服务）
- 中文界面，中文错误提示

**正式域名：** `https://hez.zhutairo.top`（首尔主服务器）
**国内 LiveKit 节点：** 国内辅服务器（延迟优化）

---

## 二、技术栈

### 前端 (`apps/web/`)

| 项目 | 技术 |
|------|------|
| 框架 | **React 19** + TypeScript |
| 构建工具 | **Vite 6** |
| 路由 | react-router-dom v7 |
| 状态管理 | React Context API（无 Redux） |
| UI 框架 | 无组件库，纯 **Tailwind CSS 3.4** |
| 语音 SDK | `livekit-client` ^2.9.1 |
| 字体 | Fraunces（标题） + DM Sans（正文） |
| 主题色 | `ink`（深蓝）、`pulse`（青绿）、`sand`（暖米色） |

### 后端 (`apps/server/`)

| 项目 | 技术 |
|------|------|
| 框架 | **Express 4** |
| 运行时 | Node.js >= 20（ESM 模块） |
| 数据库 | **SQLite**（better-sqlite3 ^11.7.0） |
| ORM | **无**，直接 SQL prepared statements |
| 认证 | JWT（jsonwebtoken） + bcryptjs |
| 校验 | zod ^3.24.1 |
| LiveKit SDK | `livekit-server-sdk` ^2.9.1 |
| 远程控制 | `ssh2`（SSH 控制远程服务器） |

### 基础设施

| 项目 | 技术 |
|------|------|
| 语音服务 | **LiveKit SFU**（自托管，Docker 容器） |
| 反向代理 | **Nginx**（TLS 终结、WebSocket 代理） |
| TLS | Let's Encrypt（certbot） |
| 容器化 | Docker Compose |
| 包管理 | npm workspaces（monorepo） |

---

## 三、目录结构

```
Hez/
├── apps/
│   ├── web/                    # 前端
│   │   ├── src/
│   │   │   ├── components/     # UI 组件
│   │   │   │   ├── PeerField.tsx        # 房间内用户头像网格
│   │   │   │   ├── StatusIcons.tsx      # 听筒/静音状态图标
│   │   │   │   ├── CallAudioControls.tsx # 降噪按钮
│   │   │   │   ├── MobileRoomTabs.tsx   # 移动端 Tab 栏
│   │   │   │   ├── BrandMark.tsx        # Logo
│   │   │   │   ├── AudioWave.tsx        # 音频波形
│   │   │   │   └── WaveField.tsx        # 波场背景
│   │   │   ├── pages/
│   │   │   │   ├── LabPage.tsx          # UI 实验室（纯前端假数据）
│   │   │   │   ├── RoomPage.tsx         # 真实语音房间（LiveKit）
│   │   │   │   ├── LobbyPage.tsx        # 大厅（创建/加入房间）
│   │   │   │   ├── AdminPage.tsx        # 管理后台
│   │   │   │   ├── LoginPage.tsx        # 登录
│   │   │   │   └── RegisterPage.tsx     # 注册
│   │   │   ├── api.ts          # 后端 API 封装（typed fetch）
│   │   │   ├── auth.tsx         # AuthContext（JWT + localStorage）
│   │   │   ├── chatHistory.ts   # 聊天记录本地持久化
│   │   │   ├── roomHistory.ts   # 房间历史本地持久化
│   │   │   ├── notifySounds.ts  # 进入/离开/消息音效
│   │   │   └── index.css        # 全局样式（含滑条样式）
│   │   ├── tailwind.config.js
│   │   ├── vite.config.ts
│   │   └── package.json
│   └── server/                 # 后端
│       ├── src/
│       │   ├── index.ts         # Express 路由定义 + 启动
│       │   ├── db.ts            # SQLite 连接 + Schema
│       │   ├── auth.ts          # JWT 签发/验证 + 中间件
│       │   ├── livekit.ts       # LiveKit Token + Room Service API
│       │   ├── livekitControl.ts # SSH 远程控制 LiveKit 节点
│       │   ├── settings.ts      # 服务器设置 CRUD
│       │   ├── seedAdmin.ts     # 管理员账户初始化
│       │   ├── seedDemo.ts      # 演示账户初始化
│       │   └── demo.ts          # 演示模式入口
│       └── package.json
├── scripts/                    # 部署和运维脚本
├── tools/livekit/              # LiveKit 原生二进制（本地开发用）
├── docker-compose.yml          # LiveKit Docker（本地开发）
├── docker-compose.app.yml      # API 容器（旧主机兼容）
├── docker-compose.cloud.yml    # LiveKit 容器（云端 Linux）
├── livekit.yaml                # LiveKit 本地配置
├── livekit.cloud.yaml          # LiveKit 云端配置
├── .env.example                # 环境变量模板
└── package.json                # npm workspaces 根
```

---

## 四、数据库设计

**引擎：** SQLite（WAL 模式，外键开启）
**文件路径：** `DATABASE_PATH` 环境变量，默认 `./data/hez.db`

```sql
-- 用户表
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  role TEXT NOT NULL DEFAULT 'user'   -- 'user' | 'admin'
);

-- 房间表
CREATE TABLE rooms (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,          -- 6 位房间码
  name TEXT NOT NULL,
  host_id TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 设置表（键值对）
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

---

## 五、API 接口

| 方法 | 路径 | 认证 | 说明 |
|------|------|------|------|
| GET | `/api/health` | 无 | 健康检查 |
| GET | `/api/runtime` | 无 | 运行时配置（LiveKit URL、演示模式等） |
| POST | `/api/auth/register` | 无 | 注册 |
| POST | `/api/auth/login` | 无 | 登录，返回 JWT |
| GET | `/api/auth/me` | requireAuth | 当前用户信息 |
| GET | `/api/admin/settings` | requireAdmin | 管理设置 |
| PUT | `/api/admin/settings` | requireAdmin | 更新设置（LiveKit 节点切换） |
| POST | `/api/rooms` | requireAuth | 创建房间（返回 6 位码） |
| GET | `/api/rooms` | requireAuth | 房间列表 |
| GET | `/api/rooms/participants` | requireAuth | 各房间在线人数 |
| GET | `/api/rooms/:code` | requireAuth | 房间详情 |
| POST | `/api/rooms/:code/token` | requireAuth | 获取 LiveKit Token |

---

## 六、认证机制

- **JWT**，7 天过期，payload：`{ sub, username, displayName, role }`
- **密码：** bcrypt（salt rounds 10）
- **客户端存储：** `localStorage` key `hez.auth`（存 `{ token, user }`）
- **中间件：**
  - `requireAuth` — 从 `Authorization: Bearer <token>` 提取并验证
  - `requireAdmin` — 在 requireAuth 基础上从 DB 实时查 role（确保即时生效）
- **管理员引导：** 启动时从环境变量 `HEZ_ADMIN_USERNAME` / `HEZ_ADMIN_PASSWORD` 创建/提升管理员

---

## 七、LiveKit 集成架构

```
浏览器 (livekit-client)
    │
    ├── WSS ──→ Nginx /rtc ──→ Seoul LiveKit (:17880)
    │
    └── WSS ──→ Nginx /lk-cn ──→ China LiveKit (:7880, 自签名证书)
```

- **Token 权限：** `roomJoin`, `canPublish`, `canSubscribe`, `canPublishData`，TTL 2 小时
- **房间上限：** 16 人/房间
- **群聊：** 通过 LiveKit DataChannel 实现（非独立服务）
- **节点切换：** 管理员在 AdminPage 切换节点 → 后端 SSH 到目标服务器执行 `docker compose up/down`

---

## 八、部署架构

### 服务器

| 角色 | 域名 | 服务 |
|------|------|------|
| 首尔（主） | hez.zhutairo.top | Nginx + API + LiveKit(seoul) + 静态前端 |
| 国内（辅） | — | LiveKit(cn) |

### Nginx 路由（首尔）

```
:443 SSL
  /rtc        → 127.0.0.1:17880  (Seoul LiveKit WebSocket)
  /lk-cn/     → 国内服务器:7880   (China LiveKit, proxy_ssl_verify off)
  /twirp/     → LiveKit Room Service
  /api/       → 127.0.0.1:3001   (Express API)
  /           → apps/web/dist     (静态文件 + SPA fallback)
```

### 部署方式

```bash
# 两台服务器都从 GitHub 拉取最新代码并重新构建
python scripts/deploy_pull_both.py

# 或手动：SSH 进入服务器后
cd /opt/hez && git fetch origin && git reset --hard origin/main
npm install && npm run build --workspace=@hez/server && npm run build --workspace=@hez/web
systemctl restart hez-api && nginx -t && systemctl reload nginx
```

### 服务管理

- API 和 LiveKit 都运行在 **Docker 容器**中（`restart: unless-stopped`）
- 无 systemd service 文件，通过 `docker compose` 管理

---

## 九、本地开发

```bash
# 安装依赖
npm install

# 启动后端（端口 3001）
npm run dev:server

# 启动前端（端口 5173，代理 /api 到 3001）
npm run dev:web

# 启动 LiveKit（需要本地二进制）
npm run livekit

# 一键演示模式（前端 + 后端 + LiveKit）
npm run demo

# UI 实验室（无需后端/LiveKit）
# 访问 http://localhost:5173/lab
```

---

## 十、关键设计思路

1. **Monorepo + npm workspaces**：前后端在同一仓库，共享 TypeScript 配置
2. **SQLite 替代外部数据库**：零依赖、单文件、WAL 模式够用，适合中小规模
3. **无 ORM**：直接 SQL，更可控，better-sqlite3 是同步 API 无需 async
4. **自托管 LiveKit**：不依赖 LiveKit Cloud，完全自主可控
5. **多区域节点**：首尔 + 国内双节点，通过 Nginx 路由分流，管理员可在 UI 切换
6. **Lab 页面**：所有 UI 改动先在 `/lab` 用假数据验证，确认后再同步到 RoomPage
7. **PeerField 自适应缩放**：卡片尺寸随容器大小动态缩放，基准 y=120px（1.2x），最小 0.5y=60px，最大 2y=240px；卡片间距 GAP=12px 为说话放大动画留白；状态图标（听筒 h-4/w-4、静音 h-4/w-4）和音量滑条（xs 档 0.3rem 轨道 + 0.75rem 滑块）适度放大保证小卡片可读性
7. **DataChannel 群聊**：复用 LiveKit 信道，无需额外聊天服务
8. **JWT + 角色控制**：admin 角色从 DB 实时查询，修改即时生效
9. **中文优先**：所有界面和错误提示使用中文

---

## 十一、环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PORT` | 3001 | API 端口 |
| `JWT_SECRET` | dev secret | JWT 签名密钥 |
| `DATABASE_PATH` | `./data/hez.db` | SQLite 文件路径 |
| `LIVEKIT_URL` | `ws://localhost:7880` | LiveKit WebSocket URL |
| `LIVEKIT_API_KEY` | `APIhezdevkey` | LiveKit API Key |
| `LIVEKIT_API_SECRET` | (见 .env.example) | LiveKit API Secret |
| `CORS_ORIGIN` | `http://localhost:5173` | CORS 允许源（逗号分隔） |
| `HEZ_ADMIN_USERNAME` | Admin | 管理员用户名 |
| `HEZ_ADMIN_PASSWORD` | liwei0.123 | 管理员密码 |
| `HEZ_ADMIN_RESET` | — | 设为 `1` 重置管理员密码 |
| `HEZ_DEMO` | — | 设为 `1` 启用演示模式 |
| `HEZ_LK_LOCAL_DIR` | `/opt/hez` | 本地 LiveKit 项目目录 |
| `HEZ_LK_CN_HOST` | — | 国内服务器 IP |
| `HEZ_LK_CN_USER` | root | 国内服务器 SSH 用户 |
| `HEZ_LK_CN_PASSWORD` | — | 国内服务器 SSH 密码 |
| `HEZ_LK_CN_DIR` | `/opt/hez` | 国内服务器项目目录 |
