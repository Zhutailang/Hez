# Hez

多端实时语音通话。Web 端注册登录，自建 LiveKit SFU 转发多人语音。

## 架构

```
apps/web      React + Vite + LiveKit Client（通话 UI）
apps/server   Express API（注册登录 / 房间 / LiveKit Token）
LiveKit       docker compose 自建 SFU
SQLite        本地用户与房间元数据
```

## 快速开始（正式本地）

### 1. 启动 LiveKit

**Windows 本地推荐（避免 Docker UDP 问题）：**

```bash
npm run livekit
```

可选 Docker（仅 Linux/macOS 或已确认 UDP 正常时）：

```bash
docker compose up -d
```

默认地址：`ws://localhost:7880`  
密钥见 `livekit.yaml` / `.env.example`。

### 2. 安装依赖

```bash
npm install
```

### 3. 配置环境变量

```bash
copy .env.example apps\server\.env
```

### 4. 启动服务

```bash
# 终端 1
npm run dev:server

# 终端 2
npm run dev:web
```

打开 http://localhost:5173

## 本地 Demo（假数据库）

不想起空库、想用现成账号测大厅/房间时：

```bash
# 终端 1：API + 假 SQLite（apps/server/data/hez-demo.db）
npm run demo:server

# 终端 2：前端
npm run dev:web
```

或一条命令（Windows）：

```bash
npm run demo
```

预置账号（密码均为 `demo123`）：

| 用户 | 显示名 |
|------|--------|
| alice | Alice |
| bob | Bob |
| carol | Carol |

预置房间码：`DEMO01`、`DEMO02`、`LAB777`

登录页在 Demo 模式下会显示一键填充按钮。

### UI Lab（无需 API / LiveKit）

纯前端假数据页，用来看气泡、历史侧栏、关闭接听、群聊样式：

http://localhost:5173/lab

## 功能

- 用户注册 / 登录（JWT）
- 创建房间、房间码加入
- 多人实时语音（LiveKit）
- 静音 / 关闭听筒 / 关闭接听
- 房间历史侧栏 + QQ 风格群聊
- 本地 Demo 假库 + `/lab` UI 预览

## 目录

```
Hez/
  apps/web/           前端（含 /lab）
  apps/server/        业务 API（含 seedDemo / demo 入口）
  docker-compose.yml  LiveKit
  livekit.yaml        LiveKit 配置
  scripts/            本地启动脚本
```

## 生产注意

- 更换 `JWT_SECRET`、`LIVEKIT_API_KEY/SECRET`
- **不要**在生产开启 `HEZ_DEMO=1`
- LiveKit 需公网可达（TURN / 端口放行）
- HTTPS / WSS 部署 Web 与信令
