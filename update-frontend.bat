@echo off
chcp 65001 >nul
echo =================================================
echo   更新前端 API 地址
echo =================================================
echo.
set /p url="请输入后端部署地址 (如 https://xxx.vercel.app): "

echo 正在更新 api-config.js...
echo // 演策后端 API 地址配置> dist\api-config.js
echo // 部署后修改此文件为后端实际地址，无需重新构建前端>> dist\api-config.js
echo window.__API_BASE__ = '%url%';>> dist\api-config.js

echo 正在部署到 surge.sh...
npx surge dist yance-bagua-engine.surge.sh

echo.
echo 完成！前端已指向 %url%
pause
