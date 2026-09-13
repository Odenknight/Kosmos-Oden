$ErrorActionPreference = 'Stop'
$fixture = Join-Path ([IO.Path]::GetTempPath()) ('kosmos-acl-' + [Guid]::NewGuid())
$null = New-Item -ItemType Directory -Path $fixture
$leaf = Join-Path $fixture 'synthetic.token'
[IO.File]::WriteAllText($leaf, 'synthetic-only-no-credential')
$everyone = [Security.Principal.SecurityIdentifier]::new('S-1-1-0')
$acl = Get-Acl -LiteralPath $leaf
$acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new(
    $everyone, 'Read', 'Allow'))
Set-Acl -LiteralPath $leaf -AclObject $acl

& (Join-Path $PSScriptRoot 'protect-sidecar-state.ps1') -LiteralPath $fixture
& (Join-Path $PSScriptRoot 'protect-sidecar-state.ps1') -LiteralPath $leaf
if ([IO.File]::ReadAllText($leaf) -ne 'synthetic-only-no-credential') { throw 'Payload changed' }
$newLeaf = Join-Path $fixture 'new.synthetic'
[IO.File]::WriteAllText($newLeaf, 'new synthetic bytes')
$rules = @((Get-Acl -LiteralPath $newLeaf).GetAccessRules($true, $true, [Security.Principal.SecurityIdentifier]))
$principal = [Security.Principal.WindowsIdentity]::GetCurrent().User
if ($rules.Count -ne 1 -or $rules[0].IdentityReference -ne $principal) { throw 'New file inherited unexpected access' }
& (Join-Path $PSScriptRoot 'protect-sidecar-state.ps1') -LiteralPath $leaf
$before = (Get-Acl -LiteralPath $leaf).Sddl
$hardLink = Join-Path $fixture 'hardlink.synthetic'
$null = New-Item -ItemType HardLink -Path $hardLink -Target $leaf
$parentBefore = (Get-Acl -LiteralPath $fixture).Sddl
$parentRefused = $false
try { & (Join-Path $PSScriptRoot 'protect-sidecar-state.ps1') -LiteralPath $fixture }
catch { if ($_.Exception.Message -match 'child aliases or directories are unsupported') { $parentRefused = $true } else { throw } }
if (-not $parentRefused -or (Get-Acl -LiteralPath $fixture).Sddl -ne $parentBefore -or
    (Get-Acl -LiteralPath $leaf).Sddl -ne $before) { throw 'Parent alias refusal failed or changed ACLs' }
$junction = Join-Path $fixture 'junction.synthetic'
$target = Join-Path $fixture 'target.synthetic'
$null = New-Item -ItemType Directory -Path $target
$targetLeaf = Join-Path $target 'nested.synthetic'
[IO.File]::WriteAllText($targetLeaf, 'nested synthetic bytes')
$targetBefore = (Get-Acl -LiteralPath $targetLeaf).Sddl
$null = New-Item -ItemType Junction -Path $junction -Target $target
foreach ($alias in @($hardLink, $junction, (Join-Path $junction 'nested.synthetic'))) {
    $refused = $false
    try { & (Join-Path $PSScriptRoot 'protect-sidecar-state.ps1') -LiteralPath $alias }
    catch { if ($_.Exception.Message -match 'links are unsupported|points are unsupported') { $refused = $true } else { throw } }
    if (-not $refused) { throw 'Alias was not refused' }
}
if ((Get-Acl -LiteralPath $leaf).Sddl -ne $before -or (Get-Acl -LiteralPath $targetLeaf).Sddl -ne $targetBefore) {
    throw 'Rejected alias changed target ACL'
}
$overflow = Join-Path $fixture 'overflow.synthetic'
$null = New-Item -ItemType Directory -Path $overflow
for ($i = 0; $i -lt 257; $i++) { [IO.File]::WriteAllText((Join-Path $overflow "$i.synthetic"), '') }
$overflowBefore = (Get-Acl -LiteralPath $overflow).Sddl
$overflowRefused = $false
try { & (Join-Path $PSScriptRoot 'protect-sidecar-state.ps1') -LiteralPath $overflow }
catch { if ($_.Exception.Message -match 'exceeds the inspection bound') { $overflowRefused = $true } else { throw } }
if (-not $overflowRefused -or (Get-Acl -LiteralPath $overflow).Sddl -ne $overflowBefore) { throw 'Inspection bound failed' }
Write-Output 'PASS: directory, existing/new leaves, repeat, payload, parent/leaf aliases and bounded inspection without rejected ACL changes'
# Retain the small synthetic fixture for inspection; no recursive deletion.
