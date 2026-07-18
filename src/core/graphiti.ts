/**
 * Kosmos Governed Context Projection (KGCP) — Graphiti 0.29 adapter.
 * Source notes remain authoritative. These episodes are a derived,
 * non-authoritative memory projection and are safe to discard/rebuild.
 */
import { contentHash } from "./paths";
import type { GraphitiEpisode, KosmosGraph, KosmosNode, OkfRelation } from "./types";

export const GRAPHITI_CORE_VERSION = "0.29.0";
export const GRAPHITI_ADAPTER_SCHEMA = "okf-plus-graphiti/2.3.0";
export const DEFAULT_GRAPHITI_CONTENT_CHARS = 20_000;
export const DEFAULT_GRAPHITI_ATTRIBUTE_CHARS = 250;

export interface GraphitiOptions {
  vault?: string;
  vaultIdentity?: string;
  groupId?: string;
  corpusId?: string;
  maxContentChars?: number;
  maxAttributeChars?: number;
  combinedExtraction?: boolean;
  sagaMapping?: boolean;
  processingTime?: string;
}

export interface GraphitiIngestionProfile {
  adapter: "Kosmos Governed Context Projection";
  adapterSchema: typeof GRAPHITI_ADAPTER_SCHEMA;
  testedGraphitiCore: typeof GRAPHITI_CORE_VERSION;
  combinedExtraction: boolean;
  combinedExtractionSurface: "disabled" | "graphiti-0.29-low-level-utility";
  publicAddEpisodeSupportsCombinedExtraction: false;
  episodeMetadataTransport: "adapter-envelope-and-episode-body";
  attributeMaxChars: number;
  readiness: { acceptedIsSearchable: false; statusCheckRequired: true; terminalStates: string[] };
  benchmark: { required: boolean; metrics: string[] };
}

export interface GraphitiExtractionMetrics { tokenCost: number | null; ingestionDurationMs: number; entityRecall: number | null; edgeAccuracy: number | null; expectedEdges: number; extractedEdges: number }
export interface ExtractedFactTriple { subject: string; predicate: string; object: string }

/** Compare a measured Graphiti run with authored fact_triple fixtures. Null is
 * returned when there is no denominator; missing evidence is never invented. */
export function measureGraphitiExtraction(episodes:GraphitiEpisode[],extracted:ExtractedFactTriple[],ingestionDurationMs:number,tokenCost:number|null=null):GraphitiExtractionMetrics{
  const norm=(v:string)=>v.trim().toLowerCase(); const expected:ExtractedFactTriple[]=[];
  for(const e of episodes)if(e.source==="fact_triple")try{const b=JSON.parse(e.episode_body);expected.push({subject:String(b.subject),predicate:String(b.predicate),object:String(b.object_ref)});}catch{}
  const key=(x:ExtractedFactTriple)=>`${norm(x.subject)}\0${norm(x.predicate)}\0${norm(x.object)}`; const expectedKeys=new Set(expected.map(key)),extractedKeys=new Set(extracted.map(key));
  const correct=[...extractedKeys].filter((k)=>expectedKeys.has(k)).length; const expectedEntities=new Set(expected.flatMap((x)=>[norm(x.subject),norm(x.object)])); const extractedEntities=new Set(extracted.flatMap((x)=>[norm(x.subject),norm(x.object)])); const foundEntities=[...expectedEntities].filter((x)=>extractedEntities.has(x)).length;
  return {tokenCost:Number.isFinite(tokenCost as number)?tokenCost:null,ingestionDurationMs:Math.max(0,ingestionDurationMs),entityRecall:expectedEntities.size?foundEntities/expectedEntities.size:null,edgeAccuracy:extractedKeys.size?correct/extractedKeys.size:null,expectedEdges:expectedKeys.size,extractedEdges:extractedKeys.size};
}

const slug = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "vault";
function hash32(input: string, seed = 0): number { let h=(0x811c9dc5^seed)>>>0; for(let i=0;i<input.length;i++) h=Math.imul(h^input.charCodeAt(i),0x01000193)>>>0; h^=h>>>16; h=Math.imul(h,0x85ebca6b)>>>0; h^=h>>>13; h=Math.imul(h,0xc2b2ae35)>>>0; return (h^(h>>>16))>>>0; }
export function deterministicUuid(input: string): string { const bytes=new Uint8Array(16); for(let block=0;block<4;block++){const h=hash32(input,Math.imul(block+1,0x9e3779b1)); bytes[block*4]=h>>>24; bytes[block*4+1]=h>>>16; bytes[block*4+2]=h>>>8; bytes[block*4+3]=h;} bytes[6]=(bytes[6]&15)|80; bytes[8]=(bytes[8]&63)|128; const h=[...bytes].map((b)=>b.toString(16).padStart(2,"0")).join(""); return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`; }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const episodeUuid = (n: KosmosNode, ns: string) => n.okf?.uid && UUID.test(n.okf.uid) ? n.okf.uid : deterministicUuid(`${ns}\0${n.path}`);
const referenceTimeSource = (n: KosmosNode) => n.okf?.governance?.createdAt ? "okf.created_at" : n.okf?.timestamp ? "okf.timestamp" : n.createdAt ? "file.created_at" : n.updatedAt ? "file.updated_at" : "index_time_fallback";

function bounded(value: unknown, max: number, depth=0): unknown {
  if (depth > 8) return "[depth-limited]";
  if (typeof value === "string") return value.length > max ? value.slice(0,max) : value;
  if (Array.isArray(value)) return value.slice(0,200).map((v)=>bounded(v,max,depth+1));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string,unknown>).slice(0,200).map(([k,v])=>[k.slice(0,80),bounded(v,max,depth+1)]));
  return value;
}

function authorityProjection(n: KosmosNode, max: number): Record<string, unknown> {
  const g=n.okf?.governance;
  if(!g) return { authored:{},derived:{},proposed:{},approved:{},effective:{ sensitivity:n.okf?.sensitivity??"internal" } };
  const authoredKeys=["authorship","epistemic","epistemic_state","sensitivity","provenance","relationships","evidence","lineage","review","authorization","labels"];
  const authored=Object.fromEntries(authoredKeys.filter((k)=>Object.prototype.hasOwnProperty.call(g.authored,k)).map((k)=>[k,g.authored[k]]));
  return bounded({ authored, derived:g.derived, proposed:g.proposed, approved:g.approved, effective:{ sensitivity:g.derived.effectiveSensitivity??n.okf?.sensitivity??"internal",labels:[...g.labels.authored,...g.labels.derived,...g.labels.proposed,...g.labels.approved] } },max) as Record<string,unknown>;
}

function sagaFor(n: KosmosNode): { id:string; kind:string } | null {
  const t=(n.okf?.type||n.type||"").toLowerCase(), p=n.path.toLowerCase();
  if((n.okf?.supersedesIds?.length??0)>0||(n.okf?.supersededByIds?.length??0)>0) return {id:`lineage:${n.okf?.uid??contentHash(n.path)}`,kind:"version-lineage"};
  if(t.includes("spec")||p.includes("spec")) return {id:`specification:${slug(n.label.replace(/v?\d+(?:\.\d+)*/gi,""))}`,kind:"versioned-specification"};
  if(t.includes("project")||p.includes("project")) return {id:`project:${slug(n.area)}`,kind:"project-history"};
  if(t.includes("meeting")||p.includes("meeting")) return {id:`meeting:${slug(n.area)}`,kind:"recurring-meeting"};
  if(t.includes("research")||p.includes("research")) return {id:`research:${slug(n.area)}`,kind:"research-thread"};
  return null;
}

function relationshipEntries(n: KosmosNode): Array<{ relation:OkfRelation|string; target:string }> {
  const out:Array<{relation:OkfRelation|string;target:string}>=[];
  for(const [relation,targets] of Object.entries(n.okf?.relations??{})) for(const target of targets??[]) out.push({relation,target});
  const nested=n.okf?.governance?.authored.relationships;
  if(nested&&typeof nested==="object"&&!Array.isArray(nested)) for(const [relation,targets] of Object.entries(nested as Record<string,unknown>)) {
    const list=Array.isArray(targets)?targets:[targets]; for(const target of list){ if(typeof target==="string") out.push({relation,target}); else if(target&&typeof target==="object"&&typeof (target as any).target==="string") out.push({relation,target:(target as any).target}); }
  }
  return out.filter((x,i,a)=>a.findIndex((y)=>y.relation===x.relation&&y.target===x.target)===i);
}

export function graphitiIngestionProfile(opts: GraphitiOptions={}): GraphitiIngestionProfile { const combined=opts.combinedExtraction===true; return { adapter:"Kosmos Governed Context Projection",adapterSchema:GRAPHITI_ADAPTER_SCHEMA,testedGraphitiCore:GRAPHITI_CORE_VERSION,combinedExtraction:combined,combinedExtractionSurface:combined?"graphiti-0.29-low-level-utility":"disabled",publicAddEpisodeSupportsCombinedExtraction:false,episodeMetadataTransport:"adapter-envelope-and-episode-body",attributeMaxChars:opts.maxAttributeChars??DEFAULT_GRAPHITI_ATTRIBUTE_CHARS,readiness:{acceptedIsSearchable:false,statusCheckRequired:true,terminalStates:["completed","failed"]},benchmark:{required:combined,metrics:["token_cost","ingestion_duration_ms","entity_recall","edge_accuracy"]} }; }

export function buildGraphitiEpisodes(graph: KosmosGraph, opts: GraphitiOptions={}): GraphitiEpisode[] {
  const vault=opts.vault||"vault", namespace=opts.vaultIdentity||vault, max=opts.maxAttributeChars??DEFAULT_GRAPHITI_ATTRIBUTE_CHARS;
  const groupId=opts.groupId||`okf-${slug(vault)}-${hash32(namespace).toString(16).padStart(8,"0")}-assertions`, corpusId=opts.corpusId||groupId;
  const processingTime=opts.processingTime||graph.stats.indexedAt;
  const byId=new Map(graph.nodes.map((n)=>[n.id,n])), label=(id:string)=>byId.get(id)?.label??id, out:GraphitiEpisode[]=[];
  for(const n of graph.nodes){ if(n.kind!=="file") continue; const okf=n.okf,g=okf?.governance,title=okf?.title||n.label,ts=g?.createdAt||n.validAt||n.createdAt||processingTime;
    const semantic=[...new Set(graph.links.filter((l)=>l.kind==="semantic"&&l.source===n.id).map((l)=>label(l.target)))]; const saga=opts.sagaMapping?sagaFor(n):null;
    const metadata={vault_identity:contentHash(namespace),source_path_hash:contentHash(n.path),okf_version:okf?.okfVersion??null,uid:okf?.uid??null,note_type:okf?.type||n.type||"note",sensitivity:String(g?.derived.effectiveSensitivity??okf?.sensitivity??"internal"),policy_version:g?.assessment.policyVersion??"legacy",corpus_id:corpusId,workspace_id:groupId,event_time:ts,processing_time:processingTime,...(saga?{saga_id:saga.id,saga_kind:saga.kind}:{})};
    out.push({uuid:episodeUuid(n,namespace),name:title,episode_body:JSON.stringify(bounded({schema:GRAPHITI_ADAPTER_SCHEMA,adapter:"Kosmos Governed Context Projection",title,path:n.path,uid:okf?.uid??null,type:okf?.type||n.type||"note",description:okf?.description??null,tags:n.tags,event_time:ts,processing_time:processingTime,reference_time_source:referenceTimeSource(n),episode_metadata:metadata,authority:{class:"explicit_user_assertion",governance_status:"unadjudicated",projection_status:"non_authoritative",accepted_semantics:false},governance:authorityProjection(n,max),assessment:g?{overall:g.assessment.overall,components:g.assessment.components,exclusions:g.assessment.exclusions,meaning:g.assessment.meaning}:null,diagnostic_codes:g?.diagnostics.map((d)=>d.code)??[],evidence:{supports:(g?.authored.evidence as any)?.supports??[],contradicts:(g?.authored.evidence as any)?.contradicts??[]},integrity:{hash_algorithm:"fnv1a32-with-length",policy_id:g?.assessment.policyId??null,policy_version:g?.assessment.policyVersion??null,policy_hash:g?.assessment.policyHash??null,schema_id:g?.schema.id??null,schema_version:g?.schema.version??null,schema_hash:g?.schema.hash??null},lineage:{resolved_supersedes:(okf?.supersedesIds??[]).map(label),declared_supersedes:okf?.supersedes??[]},related_to:semantic,typed_relationships:okf?.relations??{},saga},max)),source:"json",source_description:`OKF+ explicit user assertion · KGCP non-authoritative Graphiti adapter · vault "${vault}" · ${n.path}`,reference_time:ts,group_id:groupId,episode_metadata:metadata});
    for(const rel of relationshipEntries(n)){const rid=deterministicUuid(`${episodeUuid(n,namespace)}\0${rel.relation}\0${rel.target}`); out.push({uuid:rid,name:`${title} ${rel.relation} ${rel.target}`,episode_body:JSON.stringify({schema:GRAPHITI_ADAPTER_SCHEMA,subject_uid:okf?.uid??episodeUuid(n,namespace),subject:title,predicate:rel.relation,object_ref:rel.target,origin:"authored",event_time:ts,processing_time:processingTime}),source:"fact_triple",source_description:`Authored OKF+ relationship from ${n.path}`,reference_time:ts,group_id:groupId,episode_metadata:{...metadata,episode_kind:"fact_triple",relationship:rel.relation}});}
  }
  out.sort((a,b)=>a.reference_time.localeCompare(b.reference_time)||a.uuid.localeCompare(b.uuid)); return out;
}

export function attachGraphitiContent(episodes:GraphitiEpisode[],contents:Map<string,string>,maxContentChars=DEFAULT_GRAPHITI_CONTENT_CHARS):GraphitiEpisode[]{const cap=Math.max(1,Math.floor(maxContentChars)); for(const e of episodes){if(e.source!=="json")continue; try{const body=JSON.parse(e.episode_body),content=contents.get(body.path); if(content==null)continue; body.content_char_count=content.length; body.content_truncated=content.length>cap; body.content=content.length>cap?content.slice(0,cap):content; e.episode_body=JSON.stringify(body);}catch{}} return episodes;}
export function buildGraphitiEpisodesWithContent(graph:KosmosGraph,contents:Map<string,string>,opts:GraphitiOptions={}):GraphitiEpisode[]{return attachGraphitiContent(buildGraphitiEpisodes(graph,opts),contents,opts.maxContentChars??DEFAULT_GRAPHITI_CONTENT_CHARS);}
export function stripFrontmatter(raw:string):string{return raw.replace(/^---[\s\S]*?---\s*/,"");}
