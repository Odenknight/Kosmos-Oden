param([Parameter(Mandatory = $true)][string]$LiteralPath)
$ErrorActionPreference = 'Stop'

# Host-only path. Do not pass renderer/tool-request paths to this helper.
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = $identity.User
$item = Get-Item -LiteralPath $LiteralPath -Force
if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
    throw 'Sidecar state reparse points are unsupported'
}
$acl = Get-Acl -LiteralPath $item.FullName
$owner = $acl.GetOwner([Security.Principal.SecurityIdentifier])
if ($owner -ne $principal -and $owner -ne $identity.Owner) {
    throw 'Sidecar state has a foreign owner'
}

if ($owner -ne $principal) { $acl.SetOwner($principal) }
$acl.SetAccessRuleProtection($true, $false)
foreach ($rule in @($acl.GetAccessRules($true, $false, [Security.Principal.SecurityIdentifier]))) {
    $acl.RemoveAccessRuleSpecific($rule)
}
$inheritance = [Security.AccessControl.InheritanceFlags]::None
if ($item.PSIsContainer) {
    $inheritance = [Security.AccessControl.InheritanceFlags]'ContainerInherit, ObjectInherit'
}
$rule = [Security.AccessControl.FileSystemAccessRule]::new(
    $principal, [Security.AccessControl.FileSystemRights]::FullControl,
    $inheritance, [Security.AccessControl.PropagationFlags]::None,
    [Security.AccessControl.AccessControlType]::Allow)
$acl.AddAccessRule($rule)
if ($item.PSIsContainer) {
    [IO.Directory]::SetAccessControl($item.FullName, $acl)
} else {
    [IO.File]::SetAccessControl($item.FullName, $acl)
}

$verified = Get-Acl -LiteralPath $item.FullName
$rules = @($verified.GetAccessRules($true, $true, [Security.Principal.SecurityIdentifier]))
if (-not $verified.AreAccessRulesProtected -or
    $verified.GetOwner([Security.Principal.SecurityIdentifier]) -ne $principal -or
    $rules.Count -ne 1 -or $rules[0].IdentityReference -ne $principal -or
    $rules[0].AccessControlType -ne [Security.AccessControl.AccessControlType]::Allow -or
    $rules[0].FileSystemRights -ne [Security.AccessControl.FileSystemRights]::FullControl -or
    $rules[0].InheritanceFlags -ne $inheritance -or $rules[0].IsInherited) {
    throw 'Sidecar state ACL verification failed'
}
