<#
.SYNOPSIS
  SessionMaster Sync Server - Windows 一键安装脚本
  自动安装 Node.js、后台运行、开机自启
.DESCRIPTION
  使用:
    # 简单模式（管理员终端）
    iex ((New-Object Net.WebClient).DownloadString('https://你的地址/sessionmaster-install.ps1'))
    
    # 或下载后运行
    .\sessionmaster-install.ps1
    
    # 自定义端口
    $env:PORT = "5790"; .\sessionmaster-install.ps1
#>

$ErrorActionPreference = "Stop"
$VERSION = "1.5.1"

# ========== 配置 ==========
$Script:InstallDir = Join-Path $env:LOCALAPPDATA "SessionMaster"
$Script:Port = if ($env:PORT) { $env:PORT } else { "5789" }
$Script:ServerJsUrl = "https://raw.githubusercontent.com/BenSongLab/session-master/main/src/server/server.js"
$Script:DataDir = Join-Path $Script:InstallDir "data"
$Script:LogFile = Join-Path $Script:DataDir "server.log"
$Script:ConfigFile = Join-Path $Script:DataDir "config.json"

# ========== 颜色输出函数 ==========
function Write-Info($msg) { Write-Host " [INFO] $msg" -ForegroundColor Green }
function Write-Warn($msg) { Write-Host " [WARN] $msg" -ForegroundColor Yellow }
function Write-Error($msg) { Write-Host " [ERROR] $msg" -ForegroundColor Red; throw $msg }
function Write-Step($title) { Write-Host "`n━━━ $title ━━━" -ForegroundColor Cyan }

# ========== 获取本机局域网 IP ==========
function Get-LocalIP {
    try {
        $adapter = Get-NetAdapter | Where-Object { $_.Status -eq "Up" -and $_.Virtual -eq $false } | Select-Object -First 1
        if ($adapter) {
            $ip = (Get-NetIPAddress -InterfaceIndex $adapter.ifIndex -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike "169.254.*" -and $_.IPAddress -notlike "127.*" } | Select-Object -First 1)
            if ($ip) { return $ip.IPAddress }
        }
    } catch {}
    return "127.0.0.1"
}

# ========== 提升管理员权限（如果需要）==========
function Test-Administrator {
    $currentUser = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($currentUser)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

# ========== 主流程 ==========
Write-Host ""
Write-Host "  ╔══════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "  ║   🔐 SessionMaster Sync Server      ║" -ForegroundColor Cyan
Write-Host "  ║   一键安装脚本 v$VERSION              ║" -ForegroundColor Cyan
Write-Host "  ╚══════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# 如果不是管理员，提示
if (-not (Test-Administrator)) {
    Write-Warn "建议以管理员身份运行（否则无法注册为 Windows 服务）"
    Write-Warn "请右键 PowerShell → 以管理员身份运行"
    $continue = Read-Host "`n是否继续？(Y/N，默认 N)"
    if ($continue -ne "Y") { exit 1 }
}

$LocalIP = Get-LocalIP
Write-Info "本机 IP: $LocalIP"

# ─── 步骤1: 检查 Node.js ───
Write-Step "1/4 检查 Node.js"

$nodePath = Get-Command "node" -ErrorAction SilentlyContinue
if (-not $nodePath) {
    Write-Warn "Node.js 未安装，正在下载..."
    
    # 检测系统架构
    if ([Environment]::Is64BitOperatingSystem) {
        $arch = "x64"
    } else {
        $arch = "x86"
    }
    
    $nodeVersion = "22.14.0"
    $nodeUrl = "https://nodejs.org/dist/v${nodeVersion}/node-v${nodeVersion}-win-${arch}.zip"
    $zipPath = Join-Path $env:TEMP "node.zip"
    $extractPath = Join-Path $Script:InstallDir "node"
    
    Write-Info "下载 Node.js v${nodeVersion}..."
    [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
    $webClient = New-Object Net.WebClient
    $webClient.DownloadFile($nodeUrl, $zipPath)
    
    Write-Info "解压中..."
    Expand-Archive -Path $zipPath -DestinationPath $extractPath -Force
    Remove-Item $zipPath -Force
    
    # 添加 node 到 PATH（当前会话）
    $nodeBin = Join-Path $extractPath "node-v${nodeVersion}-win-${arch}"
    $env:Path = "${nodeBin};${env:Path}"
    
    Write-Info "Node.js 已安装到 $extractPath"
} else {
    $nodeVer = & node -v
    Write-Info "Node.js 已安装: $nodeVer"
}

$nodeExe = (Get-Command "node").Source

# ─── 步骤2: 安装 server.js ───
Write-Step "2/4 下载同步服务器"

New-Item -ItemType Directory -Path $Script:DataDir -Force | Out-Null
$serverJsPath = Join-Path $Script:InstallDir "server.js"

Write-Info "从 GitHub 下载 server.js..."
try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
    $webClient = New-Object Net.WebClient
    $webClient.DownloadFile($Script:ServerJsUrl, $serverJsPath)
    Write-Info "server.js 已下载到 $serverJsPath"
} catch {
    Write-Warn "自动下载失败，请手动将 server.js 放入 $serverJsPath"
    $serverJsDir = Split-Path $serverJsPath -Parent
    Start-Process "explorer.exe" -ArgumentList $serverJsDir
    Read-Host "按回车继续..."
}

# ─── 步骤3: 配置后台运行 ───
Write-Step "3/4 配置后台服务"

# 尝试用 NSSM 注册为系统服务
$nssmPath = Join-Path $Script:InstallDir "nssm.exe"
$serviceName = "SessionMasterSync"

if (-not (Test-Administrator)) {
    # 非管理员：使用 Start-Transcript 后台任务
    Write-Info "以当前用户身份创建后台任务..."
    
    # 创建启动脚本
    $startScript = @"
`$env:PORT = "$($Script:Port)"
Start-Process -NoNewWindow -FilePath "$nodeExe" -ArgumentList "$serverJsPath $($Script:Port)" -RedirectStandardOutput "$LogFile" -RedirectStandardError "$LogFile"
"@
    $startScriptPath = Join-Path $Script:InstallDir "start.ps1"
    Set-Content -Path $startScriptPath -Value $startScript -Force

    # 创建计划任务实现开机自启
    $taskName = "SessionMasterSync"
    $action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-WindowStyle Hidden -File `"$startScriptPath`""
    $trigger = New-ScheduledTaskTrigger -AtStartup
    $principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -RunLevel Limited
    $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
    try {
        Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null
        Write-Info "开机自启任务已注册"
        Start-ScheduledTask -TaskName $taskName
        Write-Info "服务已启动"
    } catch {
        Write-Warn "计划任务注册失败，直接启动..."
        Start-Process -NoNewWindow -FilePath "$nodeExe" -ArgumentList "$serverJsPath $($Script:Port)"
    }
    $DaemonType = "task"
} else {
    # 管理员：下载 NSSM 注册真正的 Windows 服务
    Write-Info "下载 NSSM..."
    try {
        $nssmUrl = "https://nssm.cc/release/nssm-2.24.zip"
        $zipPath = Join-Path $env:TEMP "nssm.zip"
        $webClient = New-Object Net.WebClient
        $webClient.DownloadFile($nssmUrl, $zipPath)
        Expand-Archive -Path $zipPath -DestinationPath (Join-Path $env:TEMP "nssm") -Force
        Copy-Item (Join-Path $env:TEMP "nssm\nssm-2.24\win64\nssm.exe") $nssmPath -Force
        Remove-Item $zipPath -Force
        Remove-Item (Join-Path $env:TEMP "nssm") -Recurse -Force
    } catch {
        Write-Warn "NSSM 下载失败，使用计划任务代替..."
        # fallback 到计划任务
        $nssmPath = $null
    }
    
    if ($nssmPath -and (Test-Path $nssmPath)) {
        # 停止可能存在的旧服务
        & $nssmPath stop $serviceName 2>$null | Out-Null
        & $nssmPath remove $serviceName confirm 2>$null | Out-Null
        
        # 安装服务
        & $nssmPath install $serviceName $nodeExe "$serverJsPath $($Script:Port)"
        & $nssmPath set $serviceName AppEnvironmentExtra "PORT=$($Script:Port)"
        & $nssmPath set $serviceName AppDirectory $Script:InstallDir
        & $nssmPath set $serviceName AppStdout $LogFile
        & $nssmPath set $serviceName AppStderr $LogFile
        & $nssmPath set $serviceName Start SERVICE_AUTO_START
        & $nssmPath start $serviceName
        
        Write-Info "Windows 服务已注册: $serviceName"
        $DaemonType = "nssm"
    } else {
        # 回退：计划任务
        Write-Info "使用计划任务..."
        $taskName = "SessionMasterSync"
        $startScript = @"
`$env:PORT = "$($Script:Port)"
Start-Process -NoNewWindow -FilePath "$nodeExe" -ArgumentList "$serverJsPath $($Script:Port)" -RedirectStandardOutput "$LogFile" -RedirectStandardError "$LogFile"
"@
        $startScriptPath = Join-Path $Script:InstallDir "start.ps1"
        Set-Content -Path $startScriptPath -Value $startScript -Force
        $action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-WindowStyle Hidden -File `"$startScriptPath`""
        $trigger = New-ScheduledTaskTrigger -AtStartup
        $principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -RunLevel Highest
        $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
        Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null
        Start-ScheduledTask -TaskName $taskName
        $DaemonType = "task"
    }
}

# 等待启动
Write-Info "等待服务器启动..."
Start-Sleep -Seconds 3
$serverOk = $false
for ($i = 0; $i -lt 10; $i++) {
    try {
        $resp = Invoke-WebRequest -Uri "http://localhost:$($Script:Port)/api/health" -UseBasicParsing -TimeoutSec 2
        if ($resp.Content -match '"ok"') { $serverOk = $true; break }
    } catch {}
    Start-Sleep -Seconds 1
}

# ─── 步骤4: 配置文件 ───
Write-Step "4/4 写入本地配置"

$config = @{
    serverUrl    = "http://${LocalIP}:$($Script:Port)"
    port         = [int]$Script:Port
    localIP      = $LocalIP
    installTime  = (Get-Date -Format "yyyy-MM-ddTHH:mm:ssZ")
    version      = $VERSION
    daemonType   = $DaemonType
}
$config | ConvertTo-Json | Set-Content -Path $ConfigFile -Encoding UTF8
Write-Info "配置已写入 $ConfigFile"

# ─── 完成 ───
Write-Host ""
Write-Host "  ╔══════════════════════════════════════╗" -ForegroundColor Cyan
if ($serverOk) {
    Write-Host "  ║   ✅ 安装成功！                      ║" -ForegroundColor Green
} else {
    Write-Host "  ║   ⚠️  安装完成（服务未响应）          ║" -ForegroundColor Yellow
}
Write-Host "  ╚══════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""
Write-Host "  📍 服务器地址: http://${LocalIP}:$($Script:Port)" -ForegroundColor White
Write-Host "  📂 安装目录:   $Script:InstallDir" -ForegroundColor White
Write-Host "  📋 日志文件:   $LogFile" -ForegroundColor White
Write-Host ""
Write-Host "  🔧 管理命令:" -ForegroundColor Cyan

if ($DaemonType -eq "nssm") {
    Write-Host "     查看状态: & `"$nssmPath`" status $serviceName" -ForegroundColor Gray
    Write-Host "     停止:     & `"$nssmPath`" stop $serviceName" -ForegroundColor Gray
    Write-Host "     重启:     & `"$nssmPath`" restart $serviceName" -ForegroundColor Gray
    Write-Host "     卸载:     & `"$nssmPath`" remove $serviceName confirm" -ForegroundColor Gray
} else {
    Write-Host "     查看状态: Get-ScheduledTask -TaskName SessionMasterSync | fl" -ForegroundColor Gray
    Write-Host "     停止:     Stop-ScheduledTask -TaskName SessionMasterSync" -ForegroundColor Gray
    Write-Host "     查看日志: Get-Content '$LogFile' -Tail 20" -ForegroundColor Gray
}
Write-Host ""
Write-Host "  🌐 在插件中填入: http://${LocalIP}:$($Script:Port)" -ForegroundColor Green
Write-Host "  💡 插件会自动检测本机服务器，无需手动填写！" -ForegroundColor Green
Write-Host ""
