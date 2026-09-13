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
$directoryHandle = [SidecarFileIdentity]::OpenDirectory($fixture)
$movedDirectory = $fixture + '-moved'
try {
    $directoryRenameDenied = $false
    try { [IO.Directory]::Move($fixture, $movedDirectory) }
    catch [IO.IOException] { $directoryRenameDenied = $true }
    if (-not $directoryRenameDenied) { throw 'Held ACL directory could be renamed' }
    $directoryAcl = [SidecarFileIdentity]::ReadDirectoryAcl($directoryHandle)
    [SidecarFileIdentity]::WriteDirectoryAcl($directoryHandle, $directoryAcl)
    if ([SidecarFileIdentity]::ReadDirectoryAcl($directoryHandle).Sddl -ne $directoryAcl.Sddl) {
        throw 'Directory handle ACL readback changed'
    }
} finally { $directoryHandle.Dispose() }
[IO.Directory]::Move($fixture, $movedDirectory)
[IO.Directory]::Move($movedDirectory, $fixture)
& (Join-Path $PSScriptRoot 'protect-sidecar-state.ps1') -LiteralPath $leaf
if ([IO.File]::ReadAllText($leaf) -ne 'synthetic-only-no-credential') { throw 'Payload changed' }
$newLeaf = Join-Path $fixture 'new.synthetic'
[IO.File]::WriteAllText($newLeaf, 'new synthetic bytes')
$rules = @((Get-Acl -LiteralPath $newLeaf).GetAccessRules($true, $true, [Security.Principal.SecurityIdentifier]))
$principal = [Security.Principal.WindowsIdentity]::GetCurrent().User
if ($rules.Count -ne 1 -or $rules[0].IdentityReference -ne $principal) { throw 'New file inherited unexpected access' }
& (Join-Path $PSScriptRoot 'protect-sidecar-state.ps1') -LiteralPath $leaf
$before = (Get-Acl -LiteralPath $leaf).Sddl
$held = [IO.FileStream]::new($leaf, [IO.FileMode]::Open,
    [Security.AccessControl.FileSystemRights]'Read, ChangePermissions, TakeOwnership',
    [IO.FileShare]::Read, 4096, [IO.FileOptions]::None)
$moved = Join-Path $fixture 'moved.synthetic'
try {
    [SidecarFileIdentity]::Validate($held, $leaf)
    $mismatchDenied = $false
    try { [SidecarFileIdentity]::Validate($held, $moved) }
    catch { if ($_.Exception.Message -match 'path does not match') { $mismatchDenied = $true } else { throw } }
    if (-not $mismatchDenied) { throw 'Opened identity accepted the wrong path' }
    $renameDenied = $false
    try { [IO.File]::Move($leaf, $moved) } catch [IO.IOException] { $renameDenied = $true }
    if (-not $renameDenied) { throw 'Held ACL target could be renamed' }
    $writeDenied = $false
    try { [IO.File]::WriteAllText($leaf, 'unexpected mutation') } catch [IO.IOException] { $writeDenied = $true }
    if (-not $writeDenied) { throw 'Held ACL target could be overwritten' }
    $held.SetAccessControl($held.GetAccessControl())
} finally { $held.Dispose() }
[IO.File]::Move($leaf, $moved)
[IO.File]::Move($moved, $leaf)
if ([IO.File]::ReadAllText($leaf) -ne 'synthetic-only-no-credential') { throw 'Held target bytes changed' }
$hardLink = Join-Path $fixture 'hardlink.synthetic'
$null = New-Item -ItemType HardLink -Path $hardLink -Target $leaf
$linkedHandle = [IO.File]::Open($leaf, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::Read)
try {
    $linkedDenied = $false
    try { [SidecarFileIdentity]::Validate($linkedHandle, $leaf) }
    catch { if ($_.Exception.Message -match 'single-link regular file') { $linkedDenied = $true } else { throw } }
    if (-not $linkedDenied) { throw 'Handle identity accepted a multiply linked file' }
} finally { $linkedHandle.Dispose() }
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
