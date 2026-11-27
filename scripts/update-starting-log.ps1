param(
  [string]$CloudflaredLog = "cloudflared.err.log",
  [string]$OutFile = "starting.log",
  [string]$Base = "http://localhost:8080"
)
$cf = ""
if (Test-Path $CloudflaredLog) {
  $m = Select-String -Path $CloudflaredLog -Pattern 'https://[-a-z0-9]+\.trycloudflare\.com' | Select-Object -Last 1
  if ($m) { $cf = $m.Matches.Value }
}
if (-not $cf) { $cf = "(not detected)" }
$admin = if ($cf -match '^https://') { "$cf/" } else { "$Base/" }
$redirect = if ($cf -match '^https://') { "$cf/api/auth/callback/google" } else { "$Base/api/auth/callback/google" }
@"
Admin Dashboard: $admin
Google OAuth Redirect URL: $redirect
Cloudflare URL: $cf
"@ | Set-Content -Path $OutFile -Encoding utf8
Get-Content $OutFile
