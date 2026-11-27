param(
  [string]$CloudflaredLog = "cloudflared.err.log",
  [string]$OutFile = "starting.log",
  [string]$LocalBase = "http://localhost:8080"
)
$cf = ""
if (Test-Path $CloudflaredLog) {
  $m = Select-String -Path $CloudflaredLog -Pattern 'https://[-a-z0-9]+\.trycloudflare\.com' | Select-Object -Last 1
  if ($m) { $cf = $m.Matches.Value.TrimEnd('/') }
}
$local = $LocalBase.TrimEnd('/')
$cfLine = if ($cf) { $cf } else { "(not detected)" }
$cfAdmin = if ($cf) { "$cf/" } else { "(not detected)" }
$cfRedirect = if ($cf) { "$cf/api/auth/callback/google" } else { "(not detected - add after tunnel starts)" }

$content = @"
Admin Dashboard (Local): $local/
Admin Dashboard (Cloudflare): $cfAdmin
Google OAuth Redirect URL (Local): $local/api/auth/callback/google
Google OAuth Redirect URL (Cloudflare): $cfRedirect
Cloudflare URL: $cfLine
"@
$content | Set-Content -Path $OutFile -Encoding utf8
Get-Content $OutFile
