/**
 * Data-only, pinned design skill registry for Kora's website generator.
 * Third-party scripts/markdown are never fetched or executed at runtime.
 * All executions are first-party, typed rules with deterministic precedence.
 */
import {z} from "zod";
import {
  APPROVED_DESIGN_RULES,DesignPhaseSchema,DesignPrioritySchema,
  selectDesignRules,type DesignRule,type RuleSelection,
} from "./design-rules.js";
const SourceSchema=z.enum([
 "kora-first-party","anthropic-frontend","anthropic-canvas","anthropic-brand",
 "impeccable","vercel-interface","ui-ux-pro-max",
]);
export const SkillRegistrySchema=z.object({
  id:z.string().regex(/^[a-z][a-z0-9-]{2,79}$/),
  source:SourceSchema,
  version:z.literal(1),
  checksum:z.string().regex(/^fnv1a32:[a-f0-9]{8}$/),
  upstreamCommit:z.string().regex(/^[a-f0-9]{40}$/).optional(),
  license:z.enum(["Kora-first-party","Apache-2.0","MIT"]),
  category:z.enum(["creative-direction","layout","typography","imagery","accessibility","trust","identity","validation"]),
  executionPhase:DesignPhaseSchema,
  priority:DesignPrioritySchema,
  inputSchema:z.literal("RuleSelection/v1"),
  outputSchema:z.literal("DesignRule/v1"),
  capabilities:z.array(z.string().min(1)).min(1),
  dependencies:z.array(z.string()).default([]),
  conflicts:z.array(z.string()).default([]),
  activation:z.object({industries:z.array(z.string()).min(1)}),
  supportedDesignTypes:z.array(z.enum(["site","landing-page","storefront","portfolio"])).min(1),
  evaluationCriteria:z.array(z.string().min(10)).min(1),
  status:z.enum(["active","disabled"]),
});
export type SkillRegistryEntry=z.infer<typeof SkillRegistrySchema>;
/** Fast deterministic integrity marker for local rule metadata, not a security signature. */
function checksum(s:string):string{
 let h=2166136261;
 for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}
 return "fnv1a32:"+(h>>>0).toString(16).padStart(8,"0");
}
const category=(rule:DesignRule):SkillRegistryEntry["category"]=>{
 switch(rule.effect){
 case "typography-hierarchy":return "typography";
 case "editorial-photo-hero":case "responsive-crop":return "imagery";
 case "section-rhythm":return "layout";
 case "clean-contact":return "accessibility";
 case "brand-lock":return "identity";
 case "restrained-motion":return "creative-direction";
 }
 return rule.priority==="security"?"trust":"validation";
};
/** Rules are installed at build time and validated on application startup. */
export const INSTALLED_DESIGN_SKILLS:readonly SkillRegistryEntry[]=z.array(SkillRegistrySchema).parse(
 APPROVED_DESIGN_RULES.map(rule=>({
   id:rule.id,source:rule.source,version:1,
   checksum:checksum(JSON.stringify({
      id:rule.id,source:rule.source,phase:rule.phase,
      instruction:rule.instruction,effect:rule.effect??null,
   })),
   ...(rule.upstreamCommit?{upstreamCommit:rule.upstreamCommit}:{}),
   license:rule.license??"Kora-first-party",
   category:category(rule),executionPhase:rule.phase,priority:rule.priority,
   inputSchema:"RuleSelection/v1",outputSchema:"DesignRule/v1",
   capabilities:[rule.effect??"critique-guidance"],
   dependencies:[],conflicts:rule.incompatibleWith,
   activation:{industries:rule.industries},
   supportedDesignTypes:["site","landing-page","storefront","portfolio"],
   evaluationCriteria:[rule.instruction],
   status:"active",
 })),
);
const installedIds=new Set(INSTALLED_DESIGN_SKILLS.map(s=>s.id));
if(installedIds.size!==INSTALLED_DESIGN_SKILLS.length)throw new Error("Duplicate design skill identifier");
export type LoadedDesignSkills={entries:SkillRegistryEntry[];rules:DesignRule[];rejected:string[]};
/** This function is executed by real creative-direction and SiteSpec planning. */
export function loadDesignSkills(
  args:RuleSelection, designType:SkillRegistryEntry["supportedDesignTypes"][number]="site",
  installed:readonly SkillRegistryEntry[]=INSTALLED_DESIGN_SKILLS,
):LoadedDesignSkills{
 const enabled=new Map(installed.map(s=>[s.id,SkillRegistrySchema.parse(s)]));
 const rejected:string[]=[];
 const candidates=APPROVED_DESIGN_RULES.filter(rule=>{
   const entry=enabled.get(rule.id);
   if(!entry||entry.status!=="active"){rejected.push(rule.id);return false;}
   if(!entry.supportedDesignTypes.includes(designType)){rejected.push(rule.id);return false;}
   if(entry.dependencies.some(dep=>!enabled.has(dep))){rejected.push(rule.id);return false;}
   const expected=checksum(JSON.stringify({
     id:rule.id,source:rule.source,phase:rule.phase,
     instruction:rule.instruction,effect:rule.effect??null,
   }));
   if(entry.checksum!==expected||entry.source!==rule.source||
     entry.upstreamCommit!==rule.upstreamCommit||
     entry.license!==(rule.license??"Kora-first-party")){
     rejected.push(rule.id);return false;
   }
   return true;
 });
 const rules=selectDesignRules(args,candidates);
 return {entries:rules.map(rule=>enabled.get(rule.id)!).filter(Boolean),rules,rejected};
}
