import {Link} from "react-router-dom";
import {api,type J} from "../api";
import {Async,Empty,useLoad} from "../ui";

type Mode="create"|"designs"|"brand"|"assets"|"publish";
const titles:Record<Mode,[string,string]>={
 create:["Create something new","Choose your business, then make a website, a graphic or a vector logo."],
 designs:["Your design workspaces","Open an existing business to create, edit and export its connected graphics."],
 brand:["Logo & Brand","Approve a vector mark and manage the same Brand OS used by your sites and designs."],
 assets:["Your asset libraries","Review your approved images and reuse them across the same business."],
 publish:["Publishing","See your current website versions, verified public URLs and release history."],
};
export function KrevWorkspaceEntry({mode}:{mode:Mode}){
 const sites=useLoad(()=>api<J[]>("GET","/api/sites"),[]);
 const [title,subtitle]=titles[mode];
 return <div className="stack">
  <header className="card stack">
   <p className="k-overline">Krevstudio / {title}</p>
   <h1>{title}</h1><p className="muted">{subtitle}</p>
  </header>
  <Async state={sites}>{items=>items.length===0
   ?<Empty title="Create your first business workspace">Your logo, website and creative files will be connected here. <Link to="/app/sites/new">Create a business</Link></Empty>
   :<div className="grid">{items.map(site=><article className="card stack" key={site.id}>
     <h2>{site.name}</h2>
     <p className="muted">{site.description||"Shared workspace for brand, website and campaign assets"}</p>
     <div className="row">
      {(mode==="brand"||mode==="create")&&<Link className="btn sm" to={`/app/sites/${site.id}/brand`}>Brand DNA</Link>}
      {(mode==="designs"||mode==="create"||mode==="brand")&&<Link className="btn sm" to={`/app/sites/${site.id}/creative-studio`}>Graphics & logos</Link>}
      {(mode==="assets"||mode==="create")&&<Link className="btn sm ghost" to={`/app/sites/${site.id}/images`}>Assets</Link>}
      {(mode==="publish"||mode==="create")&&<Link className="btn sm ghost" to={`/app/sites/${site.id}/build`}>Websites & publish</Link>}
      {mode==="create"&&<Link className="btn sm ghost" to={`/app/sites/${site.id}/website-studio`}>Website editor</Link>}
     </div>
    </article>)}</div>}</Async>
  {mode==="create"&&<Link className="btn ghost" to="/app/sites/new">New business workspace</Link>}
 </div>;
}
