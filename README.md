# Hez

多端实时语音通话。Web 端注册登录，自建 LiveKit SFU 转发多人语音。

## 架构

```
apps/web      React + Vite + LiveKit Client（通话 UI）
apps/server   Express API（注册登录 / 房间 / LiveKit Token）
LiveKit       docker compose 自建 SFU
SQLite        本地用户与房间元数据
```

## 快速开始

### 1. 启动 LiveKit（需要 Docker）

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

## 功能

- 用户注册 / 登录（JWT）
- 创建房间、房间码加入
- 多人实时语音（LiveKit）
- 静音 / 挂断 / 说话人高亮

## 目录

```
Hez/
  apps/web/           前端
  apps/server/        业务 API
  docker-compose.yml  LiveKit
  livekit.yaml        LiveKit 配置
```

## 生产注意

- 更换 `JWT_SECRET`、`LIVEKIT_API_KEY/SECRET`
- LiveKit 需公网可达（TURN / 端口放行）
- HTTPS / WSS 部署 Web 与信令
