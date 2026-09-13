param([Parameter(Mandatory = $true)][string]$LiteralPath)
$ErrorActionPreference = 'Stop'
if (-not ('SidecarFileIdentity' -as [type])) {
    Add-Type -Path (Join-Path $PSScriptRoot 'SidecarFileIdentity.cs')
}
$principal = [Security.Principal.WindowsIdentity]::GetCurrent().User
function Assert-PrivateAcl($acl, [bool]$Directory) {
    $rules = @($acl.GetAccessRules($true, $true, [Security.Principal.SecurityIdentifier]))
    $inheritance = if ($Directory) { [Security.AccessControl.InheritanceFlags]'ContainerInherit, ObjectInherit' } else { [Security.AccessControl.InheritanceFlags]::None }
    if ($acl.GetOwner([Security.Principal.SecurityIdentifier]) -ne $principal -or
        $rules.Count -ne 1 -or $rules[0].IdentityReference -ne $principal -or
        $rules[0].AccessControlType -ne [Security.AccessControl.AccessControlType]::Allow -or
        $rules[0].FileSystemRights -ne [Security.AccessControl.FileSystemRights]::FullControl -or
        $rules[0].InheritanceFlags -ne $inheritance -or
        $rules[0].PropagationFlags -ne [Security.AccessControl.PropagationFlags]::None -or
        ($Directory -and -not $acl.AreAccessRulesProtected)) {
        throw 'Sidecar state permissions require explicit repair'
    }
}

$directoryHandle = if ([IO.Directory]::Exists($LiteralPath)) {
    [SidecarFileIdentity]::OpenDirectory($LiteralPath)
} else {
    [SidecarFileIdentity]::CreatePrivateDirectory($LiteralPath)
}
try {
    Assert-PrivateAcl ([SidecarFileIdentity]::ReadDirectoryAcl($directoryHandle)) $true
    $children = @(Get-ChildItem -LiteralPath $LiteralPath -Force | Select-Object -First 257)
    if ($children.Count -gt 256) { throw 'Sidecar state exceeds the inspection bound' }
    foreach ($child in $children) {
        if ($child.PSIsContainer -or ($child.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
            throw 'Sidecar state child type is unsupported'
        }
        $leaf = [IO.File]::Open($child.FullName, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::Read)
        try {
            [SidecarFileIdentity]::Validate($leaf, $child.FullName)
            Assert-PrivateAcl ($leaf.GetAccessControl()) $false
        } finally { $leaf.Dispose() }
    }
} finally { $directoryHandle.Dispose() }
