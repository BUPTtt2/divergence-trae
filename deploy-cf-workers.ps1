# 演策后端部署脚本 — Cloudflare Workers
# 使用方法：在 PowerShell 中执行 .\deploy-cf-workers.ps1
# 前置：已 npx wrangler login

$ErrorActionPreference = "Stop"
Set-Location "$PSScriptRoot\worker"

Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "  演策 · 八卦推演引擎 — CF Workers 部署" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan

# 1. 安装依赖
Write-Host "`n[1/8] 安装后端依赖..." -ForegroundColor Yellow
npm install
if ($LASTEXITCODE -ne 0) { Write-Host "依赖安装失败" -ForegroundColor Red; exit 1 }

# 2. 检查登录状态
Write-Host "`n[2/8] 检查 wrangler 登录..." -ForegroundColor Yellow
npx wrangler whoami 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Host "未登录，启动浏览器登录..." -ForegroundColor Yellow
    npx wrangler login
    if ($LASTEXITCODE -ne 0) { Write-Host "登录失败" -ForegroundColor Red; exit 1 }
}

# 3. 创建 D1 数据库
Write-Host "`n[3/8] 创建 D1 数据库..." -ForegroundColor Yellow
$D1_OUTPUT = npx wrangler d1 create yance-bagua 2>&1
$D1_ID = ($D1_OUTPUT | Select-String -Pattern 'database_id = "([^"]+)"').Matches.Groups[1].Value
if (-not $D1_ID) {
    # 可能已存在，尝试从 list 获取
    $LIST_OUTPUT = npx wrangler d1 list 2>&1
    $D1_ID = ($LIST_OUTPUT | Select-String -Pattern 'yance-bagua\s+│\s+([a-f0-9-]+)').Matches.Groups[1].Value
}
if (-not $D1_ID) { Write-Host "D1 创建/获取失败：$D1_OUTPUT" -ForegroundColor Red; exit 1 }
Write-Host "D1 database_id = $D1_ID" -ForegroundColor Green

# 4. 创建 KV 命名空间
Write-Host "`n[4/8] 创建 KV 命名空间..." -ForegroundColor Yellow
$KV_OUTPUT = npx wrangler kv namespace create SESSIONS 2>&1
$KV_ID = ($KV_OUTPUT | Select-String -Pattern 'id = "([^"]+)"').Matches.Groups[1].Value
if (-not $KV_ID) {
    $LIST_OUTPUT = npx wrangler kv namespace list 2>&1 | ConvertFrom-Json
    $KV_NS = $LIST_OUTPUT | Where-Object { $_.title -eq "SESSIONS" }
    if ($KV_NS) { $KV_ID = $KV_NS.id }
}
if (-not $KV_ID) { Write-Host "KV 创建/获取失败：$KV_OUTPUT" -ForegroundColor Red; exit 1 }
Write-Host "KV id = $KV_ID" -ForegroundColor Green

# 5. 更新 wrangler.toml
Write-Host "`n[5/8] 更新 wrangler.toml..." -ForegroundColor Yellow
$TOML = Get-Content "wrangler.toml" -Raw
$TOML = $TOML -replace 'REPLACE_WITH_YOUR_D1_ID', $D1_ID
$TOML = $TOML -replace 'REPLACE_WITH_YOUR_KV_ID', $KV_ID
Set-Content "wrangler.toml" $TOML -NoNewline
Write-Host "wrangler.toml 已更新" -ForegroundColor Green

# 6. 执行数据库迁移
Write-Host "`n[6/8] 执行 D1 数据库迁移..." -ForegroundColor Yellow
npx wrangler d1 execute yance-bagua --remote --file=./migrations/0001_init.sql
if ($LASTEXITCODE -ne 0) { Write-Host "迁移失败" -ForegroundColor Red; exit 1 }

# 7. 设置 Secrets
Write-Host "`n[7/8] 设置 Workers Secrets..." -ForegroundColor Yellow
$JWT_SECRET = -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 32 | ForEach-Object {[char]$_})
$JWT_SECRET | npx wrangler secret put JWT_SECRET
if ($LASTEXITCODE -ne 0) { Write-Host "JWT_SECRET 设置失败" -ForegroundColor Red; exit 1 }

Write-Host "`n请输入豆包 LLM API Key（按回车跳过）： " -ForegroundColor Yellow -NoNewline
$LLM_KEY = Read-Host
if ($LLM_KEY) {
    $LLM_KEY | npx wrangler secret put LLM_API_KEY
}

# 8. 部署
Write-Host "`n[8/8] 部署到 Cloudflare Workers..." -ForegroundColor Yellow
$DEPLOY_OUTPUT = npx wrangler deploy 2>&1
Write-Host $DEPLOY_OUTPUT

# 提取部署 URL
$WORKER_URL = ($DEPLOY_OUTPUT | Select-String -Pattern '(https://[a-z0-9-]+\.workers\.dev)').Matches.Groups[1].Value | Select-Object -First 1
if (-not $WORKER_URL) {
    Write-Host "`n无法自动提取 Worker URL，请从上方输出中找到 *.workers.dev 域名" -ForegroundColor Yellow
} else {
    Write-Host "`n==================================================" -ForegroundColor Green
    Write-Host "  部署成功！" -ForegroundColor Green
    Write-Host "  Worker URL: $WORKER_URL" -ForegroundColor Green
    Write-Host "  健康检查: $WORKER_URL/health" -ForegroundColor Green
    Write-Host "==================================================" -ForegroundColor Green

    # 自动更新前端配置
    Write-Host "`n是否更新前端 api-config.js 指向此 URL？(Y/n) " -ForegroundColor Yellow -NoNewline
    $confirm = Read-Host
    if ($confirm -ne 'n' -and $confirm -ne 'N') {
        $configPath = "$PSScriptRoot\public\api-config.js"
        $config = Get-Content $configPath -Raw
        $config = $config -replace "const DEFAULT_API = '[^']+'", "const DEFAULT_API = '$WORKER_URL'"
        Set-Content $configPath $config -NoNewline
        Write-Host "public/api-config.js 已更新" -ForegroundColor Green

        # 更新 .env.production
        $envPath = "$PSScriptRoot\.env.production"
        $env = Get-Content $envPath -Raw
        $env = $env -replace 'VITE_API_BASE=[^\r\n]+', "VITE_API_BASE=$WORKER_URL"
        Set-Content $envPath $env -NoNewline
        Write-Host ".env.production 已更新" -ForegroundColor Green

        Write-Host "`n接下来在前端目录执行：" -ForegroundColor Cyan
        Write-Host "  npm run build" -ForegroundColor White
        Write-Host "  npx surge dist yance-bagua.surge.sh" -ForegroundColor White
    }
}

Write-Host "`n部署流程结束。" -ForegroundColor Cyan
Set-Location $PSScriptRoot
