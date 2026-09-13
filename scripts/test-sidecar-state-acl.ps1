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
Write-Output 'PASS: protected directory, existing broad-access leaf, new inherited leaf, repeat application, unchanged payload'
# Retain the small synthetic fixture for inspection; no recursive deletion.
