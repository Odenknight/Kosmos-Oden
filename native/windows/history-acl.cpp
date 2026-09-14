#define WIN32_LEAN_AND_MEAN
#define NOMINMAX
#include <windows.h>
#include <aclapi.h>
#include <sddl.h>
#include <cstddef>
#include <filesystem>
#include <iostream>
#include <stdexcept>
#include <string>
#include <vector>

static void need(bool yes) { if (!yes) throw std::runtime_error("unavailable"); }
struct Local { void* p=nullptr; ~Local(){if(p)LocalFree(p);} };
static std::wstring sidText(PSID sid) { LPWSTR value=nullptr; need(ConvertSidToStringSidW(sid,&value)!=0); Local holder;holder.p=value;return value; }
static std::wstring env(const wchar_t* key) { DWORD n=GetEnvironmentVariableW(key,nullptr,0);if(!n)return L"";std::vector<wchar_t> value(n);need(GetEnvironmentVariableW(key,value.data(),n)<n);return value.data(); }
static std::wstring user() {
 HANDLE token=nullptr;need(OpenProcessToken(GetCurrentProcess(),TOKEN_QUERY,&token)!=0);
 DWORD n=0;GetTokenInformation(token,TokenUser,nullptr,0,&n);std::vector<BYTE> bytes(n);
 BOOL ok=GetTokenInformation(token,TokenUser,bytes.data(),n,&n);CloseHandle(token);need(ok!=0);
 return sidText(reinterpret_cast<TOKEN_USER*>(bytes.data())->User.Sid);
}
static bool trusted(const std::wstring& sid,const std::wstring& own,bool ancestor) {
 return sid==own || sid==L"S-1-5-18" || sid==L"S-1-5-32-544" || (ancestor && sid==L"S-1-5-80-956008885-3418522649-1831038044-1853292631-2271478464");
}
static std::wstring inspect(const std::wstring& path,const std::wstring& own,bool ancestor) {
 PSID owner=nullptr;PACL acl=nullptr;PSECURITY_DESCRIPTOR descriptor=nullptr;
 constexpr SECURITY_INFORMATION sections=OWNER_SECURITY_INFORMATION|GROUP_SECURITY_INFORMATION|DACL_SECURITY_INFORMATION;
 DWORD status=GetNamedSecurityInfoW(path.c_str(),SE_FILE_OBJECT,sections,&owner,nullptr,&acl,nullptr,&descriptor);
 Local holder;holder.p=descriptor;need(status==ERROR_SUCCESS && owner && acl && IsValidAcl(acl));
 need(ancestor?trusted(sidText(owner),own,true):sidText(owner)==own);
 bool ownerFull=false;int order=0;
 for(DWORD i=0;i<acl->AceCount;i++) {
  void* value=nullptr;need(GetAce(acl,i,&value)!=0);auto header=static_cast<ACE_HEADER*>(value);
  // Filesystem grants must use standard allow/deny ACEs. Unknown ACE forms fail closed.
  need(header->AceType==ACCESS_ALLOWED_ACE_TYPE || header->AceType==ACCESS_DENIED_ACE_TYPE);
  auto ace=static_cast<ACCESS_ALLOWED_ACE*>(value);constexpr size_t offset=offsetof(ACCESS_ALLOWED_ACE,SidStart);
  need(header->AceSize>=offset+8);PSID sid=&ace->SidStart;need(IsValidSid(sid)!=0 && GetLengthSid(sid)<=header->AceSize-offset);
  bool allow=header->AceType==ACCESS_ALLOWED_ACE_TYPE;
  if(!ancestor) {int next=(header->AceFlags&INHERITED_ACE)?2:allow?1:0;need(next>=order);order=next;}
  if(!allow)continue;
  std::wstring principal=sidText(sid);
  if(ancestor) {if(!(header->AceFlags&INHERIT_ONLY_ACE))need(trusted(principal,own,true) || !(ace->Mask&0x100d0040UL));}
  else {need(trusted(principal,own,false));if(principal==own && (ace->Mask&FILE_ALL_ACCESS)==FILE_ALL_ACCESS)ownerFull=true;}
 }
 if(!ancestor)need(ownerFull);
 LPWSTR text=nullptr;need(ConvertSecurityDescriptorToStringSecurityDescriptorW(descriptor,SDDL_REVISION_1,sections,&text,nullptr)!=0);
 Local textHolder;textHolder.p=text;return text;
}
static std::string json(const std::wstring& value) {
 int n=WideCharToMultiByte(CP_UTF8,WC_ERR_INVALID_CHARS,value.data(),static_cast<int>(value.size()),nullptr,0,nullptr,nullptr);need(n>0);
 std::string utf8(static_cast<size_t>(n),'\0');need(WideCharToMultiByte(CP_UTF8,WC_ERR_INVALID_CHARS,value.data(),static_cast<int>(value.size()),&utf8[0],n,nullptr,nullptr)==n);
 std::string out="\"";for(unsigned char c:utf8){if(c=='\\'||c=='\"'){out+='\\';out+=static_cast<char>(c);}else {need(c>=32);out+=static_cast<char>(c);}}return out+'\"';
}
int main() {
 try {
  const auto root=env(L"KOSMOS_HISTORY_DIRECTORY"),file=env(L"KOSMOS_HISTORY_FILE"),own=user();need(!root.empty());
  std::vector<wchar_t> volume(32768);need(GetVolumePathNameW(root.c_str(),volume.data(),static_cast<DWORD>(volume.size()))!=0 && GetDriveTypeW(volume.data())==DRIVE_FIXED);
  std::vector<std::wstring> result;
  auto parent=std::filesystem::path(root).parent_path();while(!parent.empty()){result.push_back(inspect(parent.wstring(),own,true));auto next=parent.parent_path();if(next==parent)break;parent=next;}
  result.push_back(inspect(root,own,false));if(!file.empty()) {
   result.push_back(inspect(file,own,false));auto journal=file+L"-journal";
   if(GetFileAttributesW(journal.c_str())!=INVALID_FILE_ATTRIBUTES)inspect(journal,own,false);
   else {DWORD error=GetLastError();need(error==ERROR_FILE_NOT_FOUND || error==ERROR_PATH_NOT_FOUND);}
  }
  std::cout<<'[';for(size_t i=0;i<result.size();i++){if(i)std::cout<<',';std::cout<<json(result[i]);}std::cout<<"]\n";return 0;
 }catch(...){return 1;}
}
