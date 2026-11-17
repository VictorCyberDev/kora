import {Link,useParams} from "react-router-dom";
import {api} from "../api";
import {Async,useLoad} from "../ui";
import {HeroCollage,WorkShowcase} from "./landing-v7";
import {PlanCard} from "./public";

const pages={
  websites:{title:"Websites that feel like your business.",summary:"Plan up to seven pages, explore three creative directions, refine layouts in the visual editor and publish through the existing Site Host.",bullets:["Multi-page responsive website design","Puck visual section editor","Versioned drafts, preview and rollback"]},
  graphics:{title:"Make every campaign look connected.",summary:"Create editable flyers, posters, banners, story graphics and carousels with your business's saved identity. Review source and export digital files.",bullets:["Editable layers, typography and colors","PNG and SVG digital exports","Up to ten carousel slides per document"]},
  branding:{title:"A mark and a look you can keep building on.",summary:"Explore editable vector-first logo concepts, select and approve a mark, and reuse the saved version in future graphics.",bullets:["Scalable geometric logo compositions","Versioned Brand OS with owner approval","Unified colors and wordmark across designs"]},
  "use-cases":{title:"One creative workspace for different businesses.",summary:"Independent creators, shops, studios and organizations can build a consistent identity without juggling unrelated tools.",bullets:["Start with a short business brief","Reuse approved design assets","Produce materials for launches and everyday campaigns"]},
  templates:{title:"Start with a direction. Make it yours.",summary:"An initial collection of editable composition presets for digital creative work. Templates are starting points, not locked images.",bullets:["Flyers, posters and social formats","Three different composition directions","Edit text, positioning, colors and dimensions"]},
  "how-it-works":{title:"Describe. Design. Refine. Publish.",summary:"Krevstudio combines the facts you provide with a shared Brand OS and durable source documents. You remain responsible for approving publication.",bullets:["Describe your business","Choose a visual direction","Edit and save source","Export or publish where supported"]},
  about:{title:"Creative software built for actual business work.",summary:"Krevstudio brings brand identity, website design and digital promotional content into a shared business workspace.",bullets:["Customer facts remain authoritative","Approved Brand OS preserves identity","Published websites keep immutable version history"]},
  contact:{title:"Talk to the Krevstudio team.",summary:"You can reach the product operator through the support details supplied in your account. No unverified public email address is displayed here.",bullets:["Use your account support channel","Report defects with the affected project","Share export and publishing feedback"]},
  help:{title:"Answers before you create.",summary:"Krevstudio's tools use approved assets and preserve editable source documents.",bullets:["Can I export designs? PNG, SVG and source JSON are supported in the new Studio.","Can I undo changes? The editor supports undo/redo and saved document revisions.","Will it publish for me? Websites require approval. Other channel publishing depends on an authorized working connection."]},
} as const;
const linkList=[
 ["websites","Websites"],["graphics","Graphic design"],["branding","Logo & brand"],
 ["use-cases","Use cases"],["templates","Templates"],["how-it-works","How it works"]
] as const;
type Plan = Parameters<typeof PlanCard>[0]["p"];
export function KrevLanding(){
 const plans=useLoad(()=>api<Plan[]>("GET","/api/billing/plans"));
 return <div className="krev-site">
  <section className="krev-hero">
   <div className="wrap krev-hero-grid">
    <div>
     <span className="krev-eyebrow"><span className="krev-spot"/> YOUR CREATIVE WORKSPACE, CONNECTED</span>
     <h1>Create a brand that <em>goes everywhere.</em></h1>
     <p className="krev-intro">One place to shape your identity, build your website, and design the flyers, posts and campaigns that look like they belong together.</p>
     <div className="krev-actions"><Link className="krev-button" to="/signup">Start creating <span aria-hidden="true">↗</span></Link><a href="#real-work" className="krev-outline">Explore real work</a></div>
     <p className="krev-fine">Nothing is published without approval. Every creative starts with the business facts you provide.</p>
    </div>
    <div className="krev-feature-art">
     <div className="krev-art-label">One business · Many outputs</div>
     <HeroCollage/>
    </div>
   </div>
  </section>
  <section className="krev-value" id="real-work"><div className="wrap">
   <div className="krev-section-head"><span className="krev-eyebrow">01 / MADE TO BELONG TOGETHER</span><h2>Good design should travel with you.</h2><p>A logo on Monday. A site on Tuesday. A new announcement on Friday. They should all feel like the same business.</p></div>
   <div className="krev-capabilities">
    <Link to="/product/branding"><span>01</span><h3>Identity</h3><p>Build your look, approve a vector mark and keep it in one Brand OS.</p><span className="krev-more">Explore branding ↗</span></Link>
    <Link to="/product/websites"><span>02</span><h3>Websites</h3><p>Go from business brief to multi-page site, then edit and publish safely.</p><span className="krev-more">Explore websites ↗</span></Link>
    <Link to="/product/graphics"><span>03</span><h3>Designs</h3><p>Create editable flyers, posters and graphics from your saved identity.</p><span className="krev-more">Explore design ↗</span></Link>
   </div>
  </div></section>
  <section className="krev-work"><div className="wrap">
   <div className="krev-section-head"><span className="krev-eyebrow">02 / ACTUAL GENERATED WEBSITE WORK</span><h2>Different businesses. Different identities.</h2><p>These are previously generated Kora website examples for fictional businesses, retained as genuine product demonstrations—not artwork fabricated for this landing page.</p></div>
   <WorkShowcase/>
  </div></section>
  <section className="krev-explain"><div className="wrap">
   <div className="krev-section-head"><span className="krev-eyebrow">03 / THE WORKFLOW</span><h2>Think big. Start with a sentence.</h2></div>
   <div className="krev-steps">
    {[
     ["Describe","Tell us what you make, sell or stand for."],
     ["Explore","Compare art directions built from your own facts and Brand OS."],
     ["Make","Generate real editable website pages or graphic layers."],
     ["Refine","Change content, layout and images. Save as a durable version."],
     ["Share","Export your approved design or publish a verified website."]
    ].map(([title,copy],index)=><div key={title}><span className="krev-num">{String(index+1).padStart(2,"0")}</span><h3>{title}</h3><p>{copy}</p></div>)}
   </div>
  </div></section>
  <section className="krev-plan"><div className="wrap">
   <div className="krev-section-head"><span className="krev-eyebrow">04 / PRICING</span><h2>See the plans actually configured.</h2><p>Prices and included capabilities come from the running billing system, not from marketing estimates.</p></div>
   <Async state={plans}>{(rows:Plan[])=><div className="grid">{rows.map((p)=><PlanCard key={p.code} p={p}/>)}</div>}</Async>
   <p className="krev-fine">Some Studio features may be under release validation. Plan entitlements are shown as configured.</p>
  </div></section>
  <section className="krev-close"><div className="wrap"><span className="krev-eyebrow">LET'S MAKE SOMETHING DISTINCTIVE</span><h2>Your next idea deserves a real identity.</h2><Link className="krev-button" to="/signup">Create your account ↗</Link></div></section>
 </div>;
}
export function KrevMarketingPage(){
 const {topic}=useParams();
 const key=topic as keyof typeof pages;
 const page=pages[key];
 if(!page)return <section className="wrap"><h1>Page not found</h1><Link to="/">Return home</Link></section>;
 return <div className="krev-site krev-subpage">
  <section className="krev-hero"><div className="wrap">
   <span className="krev-eyebrow">KREVSTUDIO / {topic?.toUpperCase().replaceAll("-"," ")}</span>
   <h1>{page.title}</h1><p className="krev-intro">{page.summary}</p>
   <div className="krev-actions"><Link className="krev-button" to="/signup">Start creating ↗</Link><Link className="krev-outline" to="/">Back to overview</Link></div>
  </div></section>
  <section className="krev-value"><div className="wrap"><div className="krev-capabilities">
   {page.bullets.map((item,index)=><article key={item}><span>{String(index+1).padStart(2,"0")}</span><h3>{item.split(/[.:]/)[0]}</h3><p>{item}</p></article>)}
  </div></div></section>
  <section className="krev-close"><div className="wrap"><h2>Make your first creative project.</h2><Link className="krev-button" to="/signup">Open Krevstudio ↗</Link></div></section>
 </div>;
}
export function KrevMarketingNav(){
 return <nav className="krev-mini-nav" aria-label="Krevstudio products">{linkList.map(([slug,label])=><Link key={slug} to={`/product/${slug}`}>{label}</Link>)}</nav>;
}
