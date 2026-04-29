# 极序测速 App

一个基于 React + Capacitor 的测速应用。

## 运行项目

### 前置条件
- Node.js
- Android Studio（用于 Android 构建）

### 本地开发

1. 安装依赖：
   ```bash
   npm install
   ```

2. 运行开发服务器：
   ```bash
   npm run dev
   ```

3. 构建生产版本：
   ```bash
   npm run build
   ```

### Android 构建

1. 确保已构建前端项目：
   ```bash
   npm run build
   ```

2. 更新 Capacitor 配置：
   ```bash
   npx cap sync android
   ```

3. 打开 Android Studio 构建 APK：
   ```bash
   npx cap open android
   ```

## CI/CD

项目已配置 GitHub Actions 自动构建。推送代码到 `main` 分支会自动触发 APK 构建流程。

## 项目结构

```
├── android/          # Android 原生代码
├── dist/             # 构建产物
├── src/              # 前端源代码
├── capacitor.config.ts   # Capacitor 配置
├── package.json      # 项目依赖
└── vite.config.ts    # Vite 配置
```
