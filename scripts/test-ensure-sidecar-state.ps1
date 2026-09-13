$ErrorActionPreference = 'Stop'
$root = Join-Path ([IO.Path]::GetTempPath()) ('kosmos-state-validation-' + [Guid]::NewGuid())
$ensure = Join-Path $PSScriptRoot 'ensure-private-sidecar-state.ps1'
& $ensure -LiteralPath $root
$leaf = Join-Path $root 'synthetic.marker'
[IO.File]::WriteAllText($leaf, 'synthetic-only-preserve')
$before = (Get-Acl -LiteralPath $leaf).Sddl
& $ensure -LiteralPath $root
if ((Get-Acl -LiteralPath $leaf).Sddl -ne $before -or [IO.File]::ReadAllText($leaf) -ne 'synthetic-only-preserve') {
    throw 'Validation changed existing state'
}
$acl = Get-Acl -LiteralPath $leaf
$acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new(
    [Security.Principal.SecurityIdentifier]::new('S-1-1-0'), 'Read', 'Allow'))
[IO.File]::SetAccessControl($leaf, $acl)
$unsafeBefore = (Get-Acl -LiteralPath $leaf).Sddl
$refused = $false
try { & $ensure -LiteralPath $root }
catch { if ($_.Exception.Message -match 'permissions require explicit repair') { $refused = $true } else { throw } }
if (-not $refused -or (Get-Acl -LiteralPath $leaf).Sddl -ne $unsafeBefore -or
    [IO.File]::ReadAllText($leaf) -ne 'synthetic-only-preserve') { throw 'Unsafe state was accepted or modified' }
Write-Output 'PASS: private creation, read-only reuse, unsafe existing leaf refusal with unchanged ACL and contents'

$restrictedRoot = Join-Path ([IO.Path]::GetTempPath()) ('kosmos-state-propagation-' + [Guid]::NewGuid())
& $ensure -LiteralPath $restrictedRoot
$directoryAcl = Get-Acl -LiteralPath $restrictedRoot
$principal = [Security.Principal.WindowsIdentity]::GetCurrent().User
$directoryAcl.SetAccessRule([Security.AccessControl.FileSystemAccessRule]::new(
    $principal, 'FullControl', 'ContainerInherit, ObjectInherit', 'NoPropagateInherit', 'Allow'))
[IO.Directory]::SetAccessControl($restrictedRoot, $directoryAcl)
$restrictedBefore = (Get-Acl -LiteralPath $restrictedRoot).Sddl
$refused = $false
try { & $ensure -LiteralPath $restrictedRoot }
catch { if ($_.Exception.Message -match 'permissions require explicit repair') { $refused = $true } else { throw } }
if (-not $refused -or (Get-Acl -LiteralPath $restrictedRoot).Sddl -ne $restrictedBefore) {
    throw 'Restricted inheritance was accepted or modified'
}
Write-Output 'PASS: nonstandard directory propagation refused without ACL mutation'
