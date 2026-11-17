import {useEffect,useMemo,useRef,useState} from "react";
import {Link,useParams} from "react-router-dom";
import {api,type J} from "../api";
import {Async,Notice,errText,useLoad} from "../ui";

type Layer={id:string;type:"rect"|"ellipse"|"line"|"text";x:number;y:number;width:number;height:number;rotation:number;opacity:number;locked:boolean;fill:string;text?:string;fontSize?:number;fontFamily?:string;weight?:string;align?:string;radius?:number;strokeWidth?:number};
type Slide={id:string;width:number;height:number;background:string;layers:Layer[]};
type Source={schemaVersion:1;kind:string;title:string;brandVersion:number;sourcePrompt:string;slides:Slide[]};
const clone=(s:Source):Source=>structuredClone(s);
const uid=()=>crypto.randomUUID();
const toLocal=(id:string)=>document.getElementById(id);
function renderLayer(layer:Layer){
 const transform=`translate(${layer.x} ${layer.y}) rotate(${layer.rotation} ${layer.width/2} ${layer.height/2})`;
 const common={transform,opacity:layer.opacity};
 switch(layer.type){
  case "rect":return <rect {...common} width={layer.width} height={layer.height} rx={layer.radius??0} fill={layer.fill}/>;
  case "ellipse":return <ellipse {...common} cx={layer.width/2} cy={layer.height/2} rx={layer.width/2} ry={layer.height/2} fill={layer.fill}/>;
  case "line":return <line {...common} x1={0} y1={0} x2={layer.width} y2={layer.height} strokeWidth={layer.strokeWidth??4} stroke={layer.fill}/>;
  default:return <text {...common} fontFamily={layer.fontFamily??"sans-serif"} fontSize={layer.fontSize??38} fontWeight={layer.weight??"600"} fill={layer.fill}>{(layer.text??"").split("\n").slice(0,12).map((line,i)=><tspan key={i} x={0} dy={i===0?layer.fontSize??38:(layer.fontSize??38)*1.2}>{line}</tspan>)}</text>;
 }
}
const PRESETS=[["Flyer","flyer"],["Poster","poster"],["Social post","social"],["Story","story"],["Carousel","carousel"],["Banner","banner"],["Vector logo","logo"]] as const;
export function KrevCreativeStudio(){
 const {id}=useParams();
 const list=useLoad(()=>api<J[]>("GET",`/api/sites/${id}/creative-documents`),[id]);
 const [documentId,setDocumentId]=useState<string|null>(null);
 const doc=useLoad(()=>documentId?api<J>("GET",`/api/sites/${id}/creative-documents/${documentId}`):Promise.resolve(null),[id,documentId]);
 const [source,setSource]=useState<Source|null>(null);
 const [revision,setRevision]=useState(0);
 const [dirty,setDirty]=useState(false);
 const [slideIndex,setSlideIndex]=useState(0);
 const [selected,setSelected]=useState<string|null>(null);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const [createKind,setCreateKind]=useState("flyer");
 const [title,setTitle]=useState("");
 const [headline,setHeadline]=useState("");
 const [description,setDescription]=useState("");
 const [cta,setCta]=useState("");
 const [direction,setDirection]=useState(0);
 const [slideCount,setSlideCount]=useState(4);
 const history=useRef<Source[]>([]);
 const future=useRef<Source[]>([]);
 const dragging=useRef<{x:number;y:number;layerX:number;layerY:number;id:string}|null>(null);
 const svg=useRef<SVGSVGElement>(null);
 useEffect(()=>{
  if(!doc.data)return;
  setSource(doc.data.source as Source);
  setRevision(doc.data.revision as number);
  setDirty(false);setSelected(null);setSlideIndex(0);
  history.current=[];future.current=[];
 },[doc.data]);
 useEffect(()=>{
  const handler=(e:BeforeUnloadEvent)=>{if(dirty){e.preventDefault();e.returnValue="";}};
  window.addEventListener("beforeunload",handler);
  return()=>window.removeEventListener("beforeunload",handler);
 },[dirty]);
 const slide=source?.slides[slideIndex];
 const layer=slide?.layers.find(x=>x.id===selected);
 const update=(fn:(next:Source)=>void,checkpoint=true)=>{
  if(!source)return;
  if(checkpoint){history.current.push(clone(source));history.current=history.current.slice(-60);future.current=[];}
  const next=clone(source);fn(next);setSource(next);setDirty(true);
 };
 const undo=()=>{if(!source||!history.current.length)return;future.current.push(clone(source));setSource(history.current.pop()!);setDirty(true);};
 const redo=()=>{if(!source||!future.current.length)return;history.current.push(clone(source));setSource(future.current.pop()!);setDirty(true);};
 const editLayer=(patch:Partial<Layer>,checkpoint=true)=>update(next=>{
  const target=next.slides[slideIndex]?.layers.find(x=>x.id===selected);
  if(target)Object.assign(target,patch);
 },checkpoint);
 const selectDocument=(docId:string)=>{
  if(dirty&&!window.confirm("Discard unsaved changes?"))return;
  setDocumentId(docId);setError("");setNotice("");
 };
 const create=async(e:React.FormEvent)=>{
  e.preventDefault();setBusy(true);setError("");
  try{
   const r=await api<J>("POST",`/api/sites/${id}/creative-documents`,{
    kind:createKind,title,headline,description,cta,direction,slides:createKind==="carousel"?slideCount:1,
   });
   list.reload();setDocumentId(r.id as string);setNotice("Editable draft created.");
  }catch(e){setError(errText(e));}finally{setBusy(false);}
 };
 const save=async()=>{
  if(!source||!documentId)return;
  setBusy(true);setError("");setNotice("");
  try{
   const r=await api<J>("PUT",`/api/sites/${id}/creative-documents/${documentId}`,{revision,source});
   setRevision(r.revision as number);setDirty(false);history.current=[];future.current=[];
   setNotice("Saved as immutable revision "+r.revision);list.reload();
  }catch(e){setError(errText(e));}finally{setBusy(false);}
 };
 const addLayer=(type:Layer["type"])=>{
  if(!slide)return;
  const created:Layer={id:uid(),type,x:slide.width*.2,y:slide.height*.35,width:slide.width*.4,height:120,rotation:0,opacity:1,locked:false,fill:"#242424",
   ...(type==="text"?{text:"Edit this text",fontSize:56,fontFamily:"sans-serif",weight:"600",align:"left"}:{}),
   ...(type==="rect"?{radius:0}:{}),...(type==="line"?{strokeWidth:4}:{})};
  update(next=>{next.slides[slideIndex]!.layers.push(created);});
  setSelected(created.id);
 };
 const duplicateLayer=()=>{if(!layer)return;const copy={...layer,id:uid(),x:layer.x+24,y:layer.y+24};update(next=>{next.slides[slideIndex]!.layers.push(copy)});setSelected(copy.id);};
 const removeLayer=()=>{if(!layer)return;update(next=>{next.slides[slideIndex]!.layers=next.slides[slideIndex]!.layers.filter(x=>x.id!==selected)});setSelected(null);};
 const shiftLayer=(direction:number)=>{if(!layer)return;update(next=>{const ls=next.slides[slideIndex]!.layers;const from=ls.findIndex(x=>x.id===selected);const to=Math.max(0,Math.min(ls.length-1,from+direction));if(from===to)return;const [v]=ls.splice(from,1);ls.splice(to,0,v!);});};
 const addSlide=()=>{if(!source||source.slides.length>=10)return;const original=source.slides[slideIndex]!;const next={...structuredClone(original),id:uid(),layers:original.layers.map(l=>({...l,id:uid()}))};update(s=>{s.slides.splice(slideIndex+1,0,next)});setSlideIndex(slideIndex+1);setSelected(null);};
 const moveSlide=(delta:number)=>{if(!source)return;const to=slideIndex+delta;if(to<0||to>=source.slides.length)return;update(s=>{const [v]=s.slides.splice(slideIndex,1);s.slides.splice(to,0,v!)});setSlideIndex(to);};
 const removeSlide=()=>{if(!source||source.slides.length<=1)return;update(s=>{s.slides.splice(slideIndex,1)});setSlideIndex(Math.max(0,slideIndex-1));setSelected(null);};
 const exportSource=()=>{
  if(!source)return;
  const blob=new Blob([JSON.stringify(source,null,2)],{type:"application/json"});
  const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download="krevstudio-"+source.kind+".json";a.click();URL.revokeObjectURL(url);
 };
 const exportPng=async()=>{
  if(!svg||!slide||!svg.current)return;
  setError("");
  try{
   const content=new XMLSerializer().serializeToString(svg.current);
   const image=new Image();
   const url=URL.createObjectURL(new Blob([content],{type:"image/svg+xml"}));
   await new Promise<void>((resolve,reject)=>{image.onload=()=>resolve();image.onerror=()=>reject(new Error("Unable to render the vector canvas."));image.src=url;});
   const canvas=document.createElement("canvas");canvas.width=slide.width;canvas.height=slide.height;
   const ctx=canvas.getContext("2d");if(!ctx)throw new Error("Canvas unavailable.");
   ctx.drawImage(image,0,0,slide.width,slide.height);URL.revokeObjectURL(url);
   const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error("PNG export failed")),"image/png"));
   const output=URL.createObjectURL(blob);const a=document.createElement("a");a.href=output;a.download="krevstudio-"+source?.kind+"-"+(slideIndex+1)+".png";a.click();URL.revokeObjectURL(output);
  }catch(e){setError(errText(e));}
 };
 const svgPoint=(event:React.PointerEvent)=>{const pt=svg.current?.createSVGPoint();if(!pt||!svg.current)return null;pt.x=event.clientX;pt.y=event.clientY;const matrix=svg.current.getScreenCTM()?.inverse();return matrix?pt.matrixTransform(matrix):null};
 const startDrag=(e:React.PointerEvent,item:Layer)=>{
  e.stopPropagation();setSelected(item.id);
  if(item.locked||!source)return;const pt=svgPoint(e);if(!pt)return;
  history.current.push(clone(source));future.current=[];
  dragging.current={id:item.id,x:pt.x,y:pt.y,layerX:item.x,layerY:item.y};
  e.currentTarget.setPointerCapture(e.pointerId);
 };
 const draggingMove=(e:React.PointerEvent)=>{
  const d=dragging.current;if(!d||!source)return;const p=svgPoint(e);if(!p)return;
  update(next=>{const item=next.slides[slideIndex]?.layers.find(l=>l.id===d.id);if(item){item.x=Math.round(d.layerX+p.x-d.x);item.y=Math.round(d.layerY+p.y-d.y);}},false);
 };
 const makeValue=(v:string)=>Number.isFinite(Number(v))?Number(v):0;
 return <div className="stack" style={{maxWidth:"100%"}}>
  <header className="card row between">
   <div><p className="k-overline">Krevstudio · Graphics and vector identity</p><h1>Creative workspace</h1><p className="muted">Real editable layers, versioned drafts and brand-linked creative output.</p></div>
   <Link className="btn sm ghost" to={`/app/sites/${id}/brand`}>Brand DNA</Link>
  </header>
  {error&&<Notice kind="bad">{error}</Notice>}{notice&&<Notice kind="ok">{notice}</Notice>}
  <section className="card stack">
   <h2>Create from your brand</h2>
   <form className="stack" onSubmit={e=>void create(e)}>
    <div className="row">
     <label>Format <select value={createKind} onChange={e=>setCreateKind(e.target.value)}>{PRESETS.map(([label,value])=><option value={value} key={value}>{label}</option>)}</select></label>
     <label>Direction <select value={direction} onChange={e=>setDirection(Number(e.target.value))}>{[0,1,2].map(n=><option key={n} value={n}>Concept {n+1}</option>)}</select></label>
     {createKind==="carousel"&&<label>Slides <input type="number" value={slideCount} min={2} max={10} onChange={e=>setSlideCount(Number(e.target.value))}/></label>}
    </div>
    <label>Project title <input required maxLength={120} value={title} onChange={e=>setTitle(e.target.value)} placeholder="Spring launch"/></label>
    <label>Headline or wordmark <input required maxLength={120} value={headline} onChange={e=>setHeadline(e.target.value)} placeholder="Freshly made for you"/></label>
    <label>Supporting copy <textarea maxLength={600} value={description} onChange={e=>setDescription(e.target.value)} placeholder="Only business facts you have provided"/></label>
    <label>Call to action <input maxLength={70} value={cta} onChange={e=>setCta(e.target.value)}/></label>
    <button className="btn" disabled={busy}>Generate editable design</button>
   </form>
  </section>
  <section className="card stack"><h2>Saved projects</h2><Async state={list}>{(items:J[])=><div className="row">{items.map(item=><button className="btn sm ghost" key={item.id} aria-pressed={documentId===item.id} onClick={()=>selectDocument(item.id as string)}>{item.title} · {item.kind} v{item.revision}</button>)}</div>}</Async></section>
  {documentId&&<Async state={doc}>{()=>source&&slide?<section className="card stack">
   <div className="row between"><div><h2 style={{margin:0}}>{source.title}</h2><p className="muted">{source.kind} · Brand v{source.brandVersion} · revision {revision} · {dirty?"Unsaved changes":"Saved"}</p></div>
    <div className="row">
     <button className="btn sm ghost" disabled={!history.current.length} onClick={undo}>Undo</button>
     <button className="btn sm ghost" disabled={!future.current.length} onClick={redo}>Redo</button>
     <button className="btn sm" disabled={!dirty||busy} onClick={()=>void save()}>{busy?"Saving…":"Save draft"}</button>
     <button className="btn sm ghost" onClick={exportSource}>Export editable JSON</button>
     <button className="btn sm ghost" onClick={()=>void exportPng()}>Export PNG</button>
     <a className="btn sm ghost" href={`/api/sites/${id}/creative-documents/${documentId}/export/${slideIndex}`} download>Export SVG</a>
    </div>
   </div>
   <div className="row" role="group" aria-label="Slides">
    {source.slides.map((s,i)=><button key={s.id} className="btn sm ghost" aria-pressed={slideIndex===i} onClick={()=>{setSlideIndex(i);setSelected(null)}}>Slide {i+1}</button>)}
    <button className="btn sm ghost" disabled={source.slides.length>=10} onClick={addSlide}>Add slide</button>
    <button className="btn sm ghost" onClick={()=>moveSlide(-1)}>Move earlier</button>
    <button className="btn sm ghost" onClick={()=>moveSlide(1)}>Move later</button>
    <button className="btn sm ghost" disabled={source.slides.length<=1} onClick={removeSlide}>Delete slide</button>
   </div>
   <div style={{display:"grid",gridTemplateColumns:"minmax(150px,220px) minmax(260px,1fr) minmax(180px,260px)",gap:12,overflowX:"auto",alignItems:"start"}}>
    <aside className="stack" aria-label="Design elements">
     <h3>Layers</h3>
     <div className="row">{(["text","rect","ellipse","line"] as const).map(type=><button className="btn sm ghost" key={type} onClick={()=>addLayer(type)}>+ {type}</button>)}</div>
     {slide.layers.map(l=><button className="btn sm ghost" key={l.id} aria-pressed={selected===l.id} style={{textAlign:"left",overflowWrap:"anywhere"}} onClick={()=>setSelected(l.id)}>{l.locked?"🔒 ":""}{l.type==="text"?(l.text??"").slice(0,22):l.type}</button>)}
     <button className="btn sm ghost" disabled={!layer} onClick={duplicateLayer}>Duplicate layer</button>
     <button className="btn sm ghost" disabled={!layer} onClick={removeLayer}>Delete layer</button>
     <button className="btn sm ghost" disabled={!layer} onClick={()=>shiftLayer(1)}>Bring forward</button>
     <button className="btn sm ghost" disabled={!layer} onClick={()=>shiftLayer(-1)}>Send backward</button>
    </aside>
    <div style={{minWidth:300,background:"#dfdfe2",padding:18,display:"grid",placeItems:"center",overflow:"auto"}}>
     <svg ref={svg} xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${slide.width} ${slide.height}`} width="100%" style={{maxWidth:slide.width,maxHeight:"65vh",background:slide.background,boxShadow:"0 15px 40px #0003",touchAction:"none"}} role="img" aria-label="Editable design canvas" onPointerMove={draggingMove} onPointerUp={()=>dragging.current=null}>
      <rect width={slide.width} height={slide.height} fill={slide.background} onPointerDown={()=>setSelected(null)}/>
      {slide.layers.map(l=><g key={l.id} onPointerDown={e=>startDrag(e,l)} style={{cursor:l.locked?"not-allowed":"move"}}>
       {renderLayer(l)}
       {selected===l.id&&<rect x={l.x-5} y={l.y-5} width={l.width+10} height={l.height+10} fill="none" stroke="#2869e3" strokeWidth={3} strokeDasharray="10 7" pointerEvents="none"/>}
      </g>)}
     </svg>
    </div>
    <aside className="stack" aria-label="Layer properties">
     <h3>Properties</h3>
     <label>Background <input type="color" value={slide.background} onChange={e=>update(next=>{next.slides[slideIndex]!.background=e.target.value})}/></label>
     {layer?<><label>Layer <strong>{layer.type}</strong></label>
      <label>Locked <input type="checkbox" checked={layer.locked} onChange={e=>editLayer({locked:e.target.checked})}/></label>
      {layer.type==="text"&&<><label>Text <textarea value={layer.text??""} onChange={e=>editLayer({text:e.target.value})} maxLength={700}/></label><label>Font size <input type="number" min={6} max={380} value={layer.fontSize??38} onChange={e=>editLayer({fontSize:makeValue(e.target.value)})}/></label><label>Font <select value={layer.fontFamily} onChange={e=>editLayer({fontFamily:e.target.value})}><option>sans-serif</option><option>serif</option><option>monospace</option></select></label></>}
      {(["x","y","width","height","rotation","opacity"] as const).map(k=><label key={k}>{k} <input type="number" step={k==="opacity"?.05:1} value={layer[k]} onChange={e=>editLayer({[k]:makeValue(e.target.value)})}/></label>)}
      <label>Fill <input type="color" value={layer.fill} onChange={e=>editLayer({fill:e.target.value})}/></label>
     </>:<p className="muted">Select or drag any layer on the canvas.</p>}
    </aside>
   </div>
  </section>:null}</Async>}
 </div>;
}
