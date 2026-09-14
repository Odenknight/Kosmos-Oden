import {DatabaseSync} from "node:sqlite";
import {closeSync, lstatSync, openSync, readFileSync, realpathSync} from "node:fs";
import {basename, dirname, join, resolve} from "node:path";
import {createHash} from "node:crypto";
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

export interface HistoryAclHelper {path: string; sha256: string; kind?: "node-api";}

// Hold native function identities, never permission results. A different artifact at a loaded path
// is refused. Content-addressed filenames keep new builds separate from old mapped machine code.
const loadedHelpers = new Map<string, {identity: string; check: (directory: string, file: string) => unknown}>();
function helperIdentity(helper: Readonly<HistoryAclHelper>): string {
  const stat = lstatSync(helper.path,{bigint:true});
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1n || stat.size > 4n * 1024n * 1024n ||
      realpathSync(helper.path) !== helper.path || "sha256:" + createHash("sha256").update(readFileSync(helper.path)).digest("hex") !== helper.sha256)
    throw Error("HISTORY_STORAGE_UNAVAILABLE");
  return `${helper.sha256}:${stat.dev}:${stat.ino}:${stat.birthtimeNs}`;
}
function nativePermissions(helper: Readonly<HistoryAclHelper>, identity: string, directory: string, file: string): string {
  let loaded = loadedHelpers.get(helper.path);
  if (!loaded) {
    // Establish private installation permissions before executing any new machine code.
    // This one-time check uses the existing independent Windows checker.
    permissions(dirname(helper.path),helper.path);
    if (helperIdentity(helper) !== identity) throw Error("HISTORY_STORAGE_UNAVAILABLE");
    // Bypass require.cache so unrelated JavaScript exports cannot stand in for native code.
    const module = {exports: {}} as NodeModule;
    process.dlopen(module,helper.path);
    const check = (module.exports as {check?: unknown}).check;
    if (helperIdentity(helper) !== identity || typeof check !== "function") throw Error("HISTORY_STORAGE_UNAVAILABLE");
    loaded = {identity,check:check as (directory: string, file: string) => unknown};
    loadedHelpers.set(helper.path,loaded);
  }
  if (loaded.identity !== identity) throw Error("HISTORY_STORAGE_UNAVAILABLE");
  const result = loaded.check(directory,file);
  if (typeof result !== "string" || Buffer.byteLength(result,"utf8") > 16384 || helperIdentity(helper) !== identity)
    throw Error("HISTORY_STORAGE_UNAVAILABLE");
  return result;
}

function permissions(directory: string, file?: string, helper?: Readonly<HistoryAclHelper>): string {
  if (process.platform === "win32") {
    if (helper) {
      const identity = helperIdentity(helper);
      if (helper.kind === "node-api") return nativePermissions(helper,identity,directory,file ?? "");
      return execFileSync(helper.path,[],{encoding:"utf8",windowsHide:true,timeout:5000,maxBuffer:16384,stdio:["ignore","pipe","pipe"],
        env:{...process.env,KOSMOS_HISTORY_DIRECTORY:directory,KOSMOS_HISTORY_FILE:file ?? ""}}).trim();
    }
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
  ownerCurrent: () => boolean, initialize = false, aclHelper?: HistoryAclHelper) {
  let invalidated = false, opened = false;
  try {
    if (typeof directory !== "string" || !["observations.sqlite","denials.sqlite"].includes(name) ||
        typeof ownerCurrent !== "function" || ownerCurrent() !== true) throw Error();
    const helper = aclHelper ? Object.freeze({path:aclHelper.path,sha256:aclHelper.sha256,kind:aclHelper.kind}) : undefined;
    if (helper && (helper.kind !== undefined && helper.kind !== "node-api" || typeof helper.path !== "string" || resolve(helper.path) !== helper.path ||
        typeof helper.sha256 !== "string" || !/^sha256:[0-9a-f]{64}$/.test(helper.sha256) || helper.kind === "node-api" && basename(helper.path) !== `history-acl-${helper.sha256.slice(7)}.node`)) throw Error();
    const root = resolve(directory), path = join(root,name);
    const rootStat = lstatSync(root,{bigint:true});
    if (root.startsWith("\\\\") || !rootStat.isDirectory() || rootStat.isSymbolicLink() || realpathSync(root) !== root) throw Error();
    permissions(root,undefined,helper);
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
    const access = permissions(root,path,helper);
    const current = () => {
      if (invalidated) return false;
      try {
        sidecars();
        const dirNow = lstatSync(root,{bigint:true}), fileNow = lstatSync(path,{bigint:true});
        if (ownerCurrent() !== true || !dirNow.isDirectory() || dirNow.isSymbolicLink() || !fileNow.isFile() ||
            fileNow.isSymbolicLink() || fileNow.nlink !== 1n || fileNow.size > 256n * 1024n * 1024n ||
            dirNow.dev !== rootStat.dev || dirNow.ino !== rootStat.ino || dirNow.birthtimeNs !== rootStat.birthtimeNs ||
            fileNow.dev !== fileStat.dev || fileNow.ino !== fileStat.ino || fileNow.birthtimeNs !== fileStat.birthtimeNs ||
            realpathSync(root) !== root || realpathSync(path) !== path || permissions(root,path,helper) !== access || ownerCurrent() !== true) invalidated = true;
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
