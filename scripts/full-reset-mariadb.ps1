$ErrorActionPreference = 'Stop'

$principal = [Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()
$isAdmin = $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
  Write-Host 'This reset must run as Administrator.'
  Write-Host 'Right-click scripts\full-reset-mariadb.cmd and choose "Run as administrator".'
  Read-Host 'Press Enter to close'
  exit 1
}

$projectDir = Resolve-Path (Join-Path $PSScriptRoot '..')
$mariaHome = 'C:\Program Files\MariaDB 11.4'
$dataDir = Join-Path $mariaHome 'data'
$mysql = Join-Path $mariaHome 'bin\mysql.exe'
$installDb = Join-Path $mariaHome 'bin\mariadb-install-db.exe'
$serviceName = 'MariaDB'
$schemaSql = Join-Path $projectDir 'database\schema.sql'
$localUserSql = Join-Path $projectDir 'database\local-user.sql'

if (-not (Test-Path -LiteralPath $mysql)) {
  throw "mysql.exe was not found at $mysql"
}

if (-not (Test-Path -LiteralPath $installDb)) {
  throw "mariadb-install-db.exe was not found at $installDb"
}

if (-not (Test-Path -LiteralPath $schemaSql)) {
  throw "Project schema was not found at $schemaSql"
}

if (-not (Test-Path -LiteralPath $localUserSql)) {
  throw "Project local user script was not found at $localUserSql"
}

Write-Host ''
Write-Host 'FULL MARIADB RESET'
Write-Host 'This will stop MariaDB, move the current data folder to a backup, create a fresh data folder, and start MariaDB again.'
Write-Host ''
Write-Host 'Existing local database folders currently visible:'
if (Test-Path -LiteralPath $dataDir) {
  Get-ChildItem -LiteralPath $dataDir -Directory |
    Where-Object { $_.Name -notin @('mysql', 'performance_schema', 'sys') } |
    Select-Object -ExpandProperty Name |
    ForEach-Object { Write-Host "  - $_" }
} else {
  Write-Host '  none; data folder does not exist'
}

Write-Host ''
$confirm = Read-Host 'Type FULL RESET to delete/recreate MariaDB local data'
if ($confirm -ne 'FULL RESET') {
  Write-Host 'Cancelled.'
  Read-Host 'Press Enter to close'
  exit 1
}

Write-Host ''
$secureRootPassword = Read-Host 'Choose the NEW MariaDB root password' -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureRootPassword)
$rootPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)

if ([string]::IsNullOrWhiteSpace($rootPassword)) {
  throw 'Root password cannot be empty for this reset script.'
}

Write-Host ''
Write-Host 'Stopping MariaDB service...'
$service = Get-Service -Name $serviceName -ErrorAction Stop
if ($service.Status -ne 'Stopped') {
  Stop-Service -Name $serviceName -Force
  $service.WaitForStatus('Stopped', [TimeSpan]::FromSeconds(30))
}

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$backupDir = Join-Path $mariaHome "data.backup.$stamp"

if (Test-Path -LiteralPath $dataDir) {
  Write-Host "Moving old data folder to $backupDir ..."
  Rename-Item -LiteralPath $dataDir -NewName (Split-Path $backupDir -Leaf)
}

Write-Host 'Creating fresh data folder...'
New-Item -ItemType Directory -Path $dataDir | Out-Null

Write-Host 'Granting MariaDB service permissions on the fresh data folder...'
& icacls.exe $dataDir /grant 'NT SERVICE\MariaDB:(OI)(CI)F' | Out-Null
if ($LASTEXITCODE -ne 0) {
  throw 'Failed to grant data folder permissions to the MariaDB service.'
}

Write-Host 'Initializing MariaDB system tables...'
& $installDb "--datadir=$dataDir" "--password=$rootPassword" '--port=3306'
if ($LASTEXITCODE -ne 0) {
  throw 'mariadb-install-db failed.'
}

$myIni = Join-Path $dataDir 'my.ini'
$myIniContent = @"
[mysqld]
datadir=C:/Program Files/MariaDB 11.4/data
port=3306
innodb_buffer_pool_size=512M

[client]
port=3306
plugin-dir=C:\Program Files\MariaDB 11.4/lib/plugin
"@

Set-Content -LiteralPath $myIni -Value $myIniContent -Encoding ASCII

Write-Host 'Starting MariaDB service...'
Start-Service -Name $serviceName
$service = Get-Service -Name $serviceName
$service.WaitForStatus('Running', [TimeSpan]::FromSeconds(30))
Start-Sleep -Seconds 3

try {
  $env:MYSQL_PWD = $rootPassword

  Write-Host 'Checking fresh root login...'
  & $mysql -u root -e 'SELECT VERSION() AS version;'
  if ($LASTEXITCODE -ne 0) {
    throw 'Fresh root login failed.'
  }

  Write-Host 'Importing carpooling schema...'
  Get-Content -Raw -LiteralPath $schemaSql | & $mysql -u root
  if ($LASTEXITCODE -ne 0) {
    throw 'Importing schema.sql failed.'
  }

  Write-Host 'Creating carpool app user...'
  Get-Content -Raw -LiteralPath $localUserSql | & $mysql -u root
  if ($LASTEXITCODE -ne 0) {
    throw 'Importing local-user.sql failed.'
  }
} finally {
  Remove-Item Env:MYSQL_PWD -ErrorAction SilentlyContinue
}

Write-Host 'Testing carpool app user...'
& $mysql -u carpool_app '-pcarpool_password' carpooling_db -e 'SELECT 1 AS ok;'
if ($LASTEXITCODE -ne 0) {
  throw 'carpool_app login test failed.'
}

Write-Host ''
Write-Host 'Done. MariaDB is fresh and running.'
Write-Host "Old data backup: $backupDir"
Write-Host ''
Write-Host 'HeidiSQL connection:'
Write-Host '  Host: 127.0.0.1'
Write-Host '  User: carpool_app'
Write-Host '  Password: carpool_password'
Write-Host '  Database: carpooling_db'
Write-Host '  Port: 3306'
Write-Host ''
Read-Host 'Press Enter to close'
