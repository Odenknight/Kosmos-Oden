import {DatabaseSync} from "node:sqlite";
import {closeSync, lstatSync, openSync, realpathSync} from "node:fs";
import {join, resolve} from "node:path";
import {execFileSync} from "node:child_process";

const WINDOWS_PRIVATE = `
$ErrorActionPreference='Stop'
$sid=[System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$result=@()
if(([System.IO.DriveInfo]::new([System.IO.Path]::GetPathRoot($env:KOSMOS_HISTORY_DIRECTORY))).DriveType -ne 'Fixed'){throw 'remote'}
$trusted=@($sid,'S-1-5-18','S-1-5-32-544','S-1-5-80-956008885-3418522649-1831038044-1853292631-2271478464')
# Delete-child, delete, change-DACL, change-owner, or generic-all on an ancestor.
$unsafeParentRights=0x100d0040
$parent=[System.IO.Directory]::GetParent($env:KOSMOS_HISTORY_DIRECTORY)
while($null -ne $parent) {
  $acl=Get-Acl -LiteralPath $parent.FullName
  if($acl.GetOwner([System.Security.Principal.SecurityIdentifier]).Value -notin $trusted){throw 'parent-owner'}
  foreach($rule in $acl.GetAccessRules($true,$true,[System.Security.Principal.SecurityIdentifier])) {
    if($rule.AccessControlType -ne 'Allow' -or ($rule.PropagationFlags -band [System.Security.AccessControl.PropagationFlags]::InheritOnly)){continue}
    if($rule.IdentityReference.Value -notin $trusted -and ([long]$rule.FileSystemRights -band $unsafeParentRights)){throw 'parent-access'}
  }
  $result+=$acl.GetSecurityDescriptorSddlForm([System.Security.AccessControl.AccessControlSections]::Access -bor [System.Security.AccessControl.AccessControlSections]::Owner -bor [System.Security.AccessControl.AccessControlSections]::Group)
  $parent=$parent.Parent
}
$checked=@($env:KOSMOS_HISTORY_DIRECTORY,$env:KOSMOS_HISTORY_FILE)
$journal=$env:KOSMOS_HISTORY_FILE+'-journal'
if($env:KOSMOS_HISTORY_FILE -and (Test-Path -LiteralPath $journal)){$checked+=$journal}
foreach($path in $checked) {
  if(!$path){continue}
  $acl=Get-Acl -LiteralPath $path
  if($acl.GetOwner([System.Security.Principal.SecurityIdentifier]).Value -ne $sid){throw 'owner'}
  if(!$acl.AreAccessRulesCanonical){throw 'acl'}
  $own=$false
  foreach($rule in $acl.GetAccessRules($true,$true,[System.Security.Principal.SecurityIdentifier])) {
    if($rule.AccessControlType -ne 'Allow'){continue}
    $principal=$rule.IdentityReference.Value
    if($principal -notin @($sid,'S-1-5-18','S-1-5-32-544')){throw 'shared'}
    if($principal -eq $sid -and ($rule.FileSystemRights -band [System.Security.AccessControl.FileSystemRights]::FullControl) -eq [System.Security.AccessControl.FileSystemRights]::FullControl){$own=$true}
  }
  if(!$own){throw 'access'}
  $sections=[System.Security.AccessControl.AccessControlSections]::Access -bor [System.Security.AccessControl.AccessControlSections]::Owner -bor [System.Security.AccessControl.AccessControlSections]::Group
  if($path -ne $journal){$result+=$acl.GetSecurityDescriptorSddlForm($sections)}
}
ConvertTo-Json -Compress -InputObject $result
`;

function permissions(directory: string, file?: string): string {
  if (process.platform === "win32") {
    if (!process.env.SystemRoot) throw Error("HISTORY_STORAGE_UNAVAILABLE");
    return execFileSync(join(process.env.SystemRoot,"System32","WindowsPowerShell","v1.0","powershell.exe"),
      ["-NoProfile","-NonInteractive","-EncodedCommand",Buffer.from(WINDOWS_PRIVATE,"utf16le").toString("base64")],
      {encoding:"utf8",windowsHide:true,timeout:5000,maxBuffer:16384,stdio:["ignore","pipe","pipe"],
        env:{...Object.fromEntries(Object.entries(process.env).filter(([key])=>key.toLowerCase()!=="psmodulepath")),KOSMOS_HISTORY_DIRECTORY:directory,KOSMOS_HISTORY_FILE:file ?? ""}}).trim();
  }
  throw Error("HISTORY_STORAGE_UNAVAILABLE");
}

/** Windows native-only local file capability. Other platforms remain unavailable. Never derive directory or ownerCurrent
 * from renderer input. Does not select a retention policy or initialize a schema.
 */
export function openNativeHistoryDatabase(directory: string, name: "observations.sqlite" | "denials.sqlite",
  ownerCurrent: () => boolean, initialize = false) {
  let invalidated = false, opened = false;
  try {
    if (typeof directory !== "string" || !["observations.sqlite","denials.sqlite"].includes(name) ||
        typeof ownerCurrent !== "function" || ownerCurrent() !== true) throw Error();
    const root = resolve(directory), path = join(root,name);
    const rootStat = lstatSync(root,{bigint:true});
    if (root.startsWith("\\\\") || !rootStat.isDirectory() || rootStat.isSymbolicLink() || realpathSync(root) !== root) throw Error();
    permissions(root);
    if (initialize) {
      if (ownerCurrent() !== true) throw Error();
      closeSync(openSync(path,"wx",0o600));
    }
    const fileStat = lstatSync(path,{bigint:true});
    if (!fileStat.isFile() || fileStat.isSymbolicLink() || fileStat.nlink !== 1n ||
        fileStat.size > 256n * 1024n * 1024n || !initialize && fileStat.size === 0n || realpathSync(path) !== path) throw Error();
    const sidecars = () => {
      for (const suffix of ["-journal","-wal","-shm"]) {
        try {
          const sidecar = path + suffix, stat = lstatSync(sidecar,{bigint:true});
          if (suffix !== "-journal" || !stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1n ||
              stat.size > 256n * 1024n * 1024n || realpathSync(sidecar) !== sidecar) throw Error("HISTORY_STORAGE_UNAVAILABLE");
        } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
      }
    };
    sidecars();
    const access = permissions(root,path);
    const current = () => {
      if (invalidated) return false;
      try {
        sidecars();
        const dirNow = lstatSync(root,{bigint:true}), fileNow = lstatSync(path,{bigint:true});
        if (ownerCurrent() !== true || !dirNow.isDirectory() || dirNow.isSymbolicLink() || !fileNow.isFile() ||
            fileNow.isSymbolicLink() || fileNow.nlink !== 1n || fileNow.size > 256n * 1024n * 1024n ||
            dirNow.dev !== rootStat.dev || dirNow.ino !== rootStat.ino || dirNow.birthtimeNs !== rootStat.birthtimeNs ||
            fileNow.dev !== fileStat.dev || fileNow.ino !== fileStat.ino || fileNow.birthtimeNs !== fileStat.birthtimeNs ||
            realpathSync(root) !== root || realpathSync(path) !== path || permissions(root,path) !== access || ownerCurrent() !== true) invalidated = true;
      } catch { invalidated = true; }
      return !invalidated;
    };
    if (!current()) throw Error();
    return Object.freeze({current, openDatabase: () => {
      if (opened || !current()) throw Error("HISTORY_STORAGE_UNAVAILABLE");
      opened = true;
      const db = new DatabaseSync(path);
      if (!current()) { db.close(); throw Error("HISTORY_STORAGE_UNAVAILABLE"); }
      return db;
    }, close: () => { invalidated = true; }});
  } catch { throw Error("HISTORY_STORAGE_UNAVAILABLE"); }
}
