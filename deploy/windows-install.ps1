param([string]$ServerAddress, [string]$ServerUser)
$ErrorActionPreference = 'Stop'
$archivePath = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\rental-notes.zip'))
if (-not (Test-Path -LiteralPath $archivePath)) { throw '找不到安装包 rental-notes.zip，请先运行项目中的 package.py。' }
if (-not $ServerAddress) { $ServerAddress = Read-Host '服务器公网 IPv4' }
if (-not $ServerUser) { $ServerUser = Read-Host 'SSH 登录用户名（如 root 或 ubuntu）' }
$parsedAddress = $null
if (-not [Net.IPAddress]::TryParse($ServerAddress, [ref]$parsedAddress) -or $parsedAddress.AddressFamily -ne [Net.Sockets.AddressFamily]::InterNetwork) { throw '请输入有效的 IPv4 地址。' }
if ($ServerUser -notmatch '^[a-z_][a-z0-9_-]*$') { throw '登录用户名格式不正确。' }
$remoteAccount = "$ServerUser@$ServerAddress"
$uploadName = 'rental-notes-' + (Get-Date -Format 'yyyyMMddHHmmss')
Write-Host '即将上传安装包并安装个人看房工具。需要输入 SSH / sudo 密码及新的工具登录密码。'
& scp $archivePath "${remoteAccount}:$uploadName.zip"
if ($LASTEXITCODE -ne 0) { throw '上传未完成。' }
$remoteCommand = "set -e`npython3 -m zipfile -e $uploadName.zip $uploadName`ncd $uploadName`nsudo bash deploy/install.sh"
& ssh -t $remoteAccount $remoteCommand
if ($LASTEXITCODE -ne 0) { throw '安装未完成，请保留并反馈终端输出。' }
Write-Host '安装完成。在另一个 PowerShell 窗口执行下列命令并保持窗口打开：'
Write-Host "ssh -N -L 8877:127.0.0.1:8877 $remoteAccount"
Write-Host '然后用本机浏览器打开 http://127.0.0.1:8877'
