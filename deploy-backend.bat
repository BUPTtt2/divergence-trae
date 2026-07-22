@echo off
chcp 65001 >nul
echo =================================================
echo   演策后端部署脚本
echo =================================================
echo.
echo 请选择部署方式：
echo   1. Vercel（推荐，免费，国内可访问）
echo   2. Railway（需要 Railway 账号）
echo   3. 本地运行（开发测试用）
echo.
set /p choice="请输入选项 (1/2/3): "

if "%choice%"=="1" goto vercel
if "%choice%"=="2" goto railway
if "%choice%"=="3" goto local
echo 无效选项
pause
exit /b

:vercel
echo.
echo === 部署到 Vercel ===
echo 步骤 1: 登录 Vercel（会打开浏览器）
cd server
npx vercel login
echo.
echo 步骤 2: 部署（首次会问几个问题，全部回车用默认值）
npx vercel --prod
echo.
echo 部署完成后，你会得到一个 URL（如 https://xxx.vercel.app）
echo 请运行 update-frontend.bat 更新前端 API 地址
pause
exit /b

:railway
echo.
echo === 重新部署到 Railway ===
echo 项目: yance-bagua-engine (production)
echo 域名: https://yance-bagua-engine-production.up.railway.app
echo.
cd server
echo 正在部署...
railway up
echo.
echo 部署完成！域名: https://yance-bagua-engine-production.up.railway.app
echo 如需设置环境变量:
echo   railway variables set ZHIPU_API_KEY=xxx
echo   railway variables set DEEPSEEK_API_KEY=xxx
echo   railway variables set MODELSCOPE_API_KEY=xxx
echo   railway variables set SIGNING_SECRET=xxx
echo   railway variables set CORS_ORIGIN=https://your-frontend-domain.surge.sh
echo.
pause
exit /b

:local
echo.
echo === 本地运行后端 ===
cd server
npm install
npm start
pause
exit /b
