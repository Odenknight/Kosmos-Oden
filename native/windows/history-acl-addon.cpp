// Share the exact live ACL implementation with the command-line helper.
#define KOSMOS_HISTORY_NODE
#include "history-acl.cpp"
#include <cstring>
#define NAPI_VERSION 8
#include "node-api-v22.22.1/node_api.h"

// Node and Electron expose Node-API on Windows from their main executable.
// Resolve those official ABI signatures directly; no version-specific import library is needed.
template<class T> static T resolveApi(const char* name) {
 auto p=GetProcAddress(GetModuleHandleW(nullptr),name);need(p!=nullptr);
 T result;static_assert(sizeof(result)==sizeof(p));memcpy(&result,&p,sizeof(p));return result;
}
struct NodeApi {
 decltype(&::napi_get_cb_info) napi_get_cb_info=resolveApi<decltype(&::napi_get_cb_info)>("napi_get_cb_info");
 decltype(&::napi_get_value_string_utf16) napi_get_value_string_utf16=resolveApi<decltype(&::napi_get_value_string_utf16)>("napi_get_value_string_utf16");
 decltype(&::napi_create_string_utf8) napi_create_string_utf8=resolveApi<decltype(&::napi_create_string_utf8)>("napi_create_string_utf8");
 decltype(&::napi_create_function) napi_create_function=resolveApi<decltype(&::napi_create_function)>("napi_create_function");
 decltype(&::napi_set_named_property) napi_set_named_property=resolveApi<decltype(&::napi_set_named_property)>("napi_set_named_property");
 decltype(&::napi_throw_error) napi_throw_error=resolveApi<decltype(&::napi_throw_error)>("napi_throw_error");
};
static const NodeApi& api(){static const NodeApi value;return value;}
static napi_value check(napi_env context,napi_callback_info info) {
 try {
  const auto& a=api();size_t count=3;napi_value args[3];
  need(a.napi_get_cb_info(context,info,&count,args,nullptr,nullptr)==napi_ok && count==2);
  std::wstring values[2];
  for(size_t i=0;i<2;i++){
   size_t n=0;need(a.napi_get_value_string_utf16(context,args[i],nullptr,0,&n)==napi_ok && n<32768);
   std::vector<char16_t> text(n+1);size_t written=0;
   need(a.napi_get_value_string_utf16(context,args[i],text.data(),text.size(),&written)==napi_ok && written==n);
   values[i].assign(text.begin(),text.begin()+n);need(values[i].find(L'\0')==std::wstring::npos);
  }
  auto result=permissions(values[0],values[1]);napi_value output;
  need(a.napi_create_string_utf8(context,result.data(),result.size(),&output)==napi_ok);return output;
 }catch(...){try{api().napi_throw_error(context,nullptr,"HISTORY_STORAGE_UNAVAILABLE");}catch(...){}return nullptr;}
}
NAPI_MODULE_INIT() {
 try {const auto& a=api();napi_value fn;need(a.napi_create_function(env,"check",5,check,nullptr,&fn)==napi_ok);
 need(a.napi_set_named_property(env,exports,"check",fn)==napi_ok);return exports;
 }catch(...){try{api().napi_throw_error(env,nullptr,"HISTORY_STORAGE_UNAVAILABLE");}catch(...){}return nullptr;}
}
