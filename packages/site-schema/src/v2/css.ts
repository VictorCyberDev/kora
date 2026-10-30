import { fontFaceCss, fontStacks, PAIRINGS } from "./fonts.js";
import type { Design } from "./spec.js";

const SECTION_PAD = {
  compact: "clamp(40px,6vw,64px)",
  balanced: "clamp(56px,9vw,104px)",
  spacious: "clamp(72px,11vw,136px)",
  editorial: "clamp(80px,13vw,168px)",
} as const;
const H1 = {
  compact: "clamp(2rem,4.6vw,3.25rem)",
  balanced: "clamp(2.4rem,6vw,4.4rem)",
  dramatic: "clamp(2.8rem,8.4vw,7rem)",
} as const;
const RADIUS = { sharp: "0px", soft: "12px", rounded: "26px" } as const;

export function renderCssV2(design: Design): string {
  const p = design.palette;
  const pairing = PAIRINGS[design.typography.pairing];
  const fonts = fontStacks(design.typography.pairing);
  const r = RADIUS[design.shape];
  const btnR =
    design.buttons === "pill"
      ? "999px"
      : design.shape === "sharp"
        ? "0"
        : `min(${r},14px)`;
  const cardSurface =
    design.surface === "flat"
      ? "background:var(--surface-muted);border:0"
      : design.surface === "raised"
        ? "background:var(--surface-raised);border:1px solid var(--border);box-shadow:0 1px 2px rgba(0,0,0,.04),0 12px 32px -12px rgba(0,0,0,.18)"
        : "background:var(--surface-raised);border:1px solid var(--border)";
  const solid = `background:var(--primary);color:var(--primary-fg);border:1.5px solid var(--primary)`;
  const btn =
    design.buttons === "outline"
      ? `background:transparent;color:var(--fg);border:1.5px solid var(--fg)`
      : design.buttons === "underline"
        ? `background:transparent;color:var(--fg);border:0;border-bottom:2px solid var(--accent);padding-inline:2px;border-radius:0`
        : solid;
  return `${fontFaceCss(design.typography.pairing)}
:root{--bg:${p.background};--fg:${p.foreground};--surface:${p.surface};--surface-raised:${p.surfaceRaised};--surface-muted:${p.surfaceMuted};--primary:${p.primary};--primary-fg:${p.primaryForeground};--secondary:${p.secondary};--secondary-fg:${p.secondaryForeground};--accent:${p.accent};--accent-fg:${p.accentForeground};--muted:${p.muted};--muted-fg:${p.mutedForeground};--border:${p.border};--success:${p.success};--warning:${p.warning};--danger:${p.danger};--r:${r};--btn-r:${btnR};--sp:${SECTION_PAD[design.density]};--font-display:${fonts.display};--font-body:${fonts.body};--font-label:${fonts.label};--h-weight:${pairing.headingWeight};--track:${pairing.tracking};--h1:${H1[design.typography.scale]};--measure:62ch;--hero-base:${design.mode === "dark" ? p.background : p.primary};--hero-fg:${design.mode === "dark" ? p.foreground : p.primaryForeground};--wrap:${design.density === "editorial" ? "1180px" : "1120px"}}
*{box-sizing:border-box}html{scroll-behavior:smooth;-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--fg);font-family:var(--font-body);font-size:1.0625rem;line-height:1.65;-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
img,svg{max-width:100%;display:block}a{color:inherit}
h1,h2,h3,h4{font-family:var(--font-display);font-weight:var(--h-weight);letter-spacing:var(--track);line-height:1.08;margin:0;text-wrap:balance}
h1{font-size:var(--h1)}h2{font-size:clamp(1.8rem,4vw,3rem)}h3{font-size:clamp(1.15rem,1.6vw,1.4rem);line-height:1.25}
p{margin:0;text-wrap:pretty}
.wrap{width:min(var(--wrap),100% - 40px);margin-inline:auto}
.skip{position:absolute;left:-999px;top:0;background:var(--fg);color:var(--bg);padding:10px 14px;z-index:50}.skip:focus{left:8px;top:8px}
:focus-visible{outline:3px solid var(--accent);outline-offset:3px}
.eyebrow{font-family:var(--font-label);font-size:.78rem;letter-spacing:.14em;text-transform:uppercase;color:var(--muted-fg);font-weight:600;margin-bottom:18px;display:flex;align-items:center;gap:10px}
.eyebrow::before{content:"";width:28px;height:2px;background:var(--accent);display:block}
.lead{font-size:clamp(1.05rem,1.5vw,1.28rem);color:var(--muted-fg);max-width:var(--measure);line-height:1.6}
.sec{padding-block:var(--sp);position:relative}
.sec.tone-surface{background:var(--surface)}.sec.tone-muted{background:var(--surface-muted)}
.sec.tone-primary{background:var(--primary);color:var(--primary-fg)}.sec.tone-primary .lead,.sec.tone-primary .eyebrow{color:inherit;opacity:.88}.sec.tone-primary .eyebrow::before{background:currentColor}
.sec.tone-primary .card{background:rgba(255,255,255,.08);border-color:rgba(255,255,255,.22);color:inherit;box-shadow:none}.sec.tone-primary .card p{color:inherit;opacity:.85}
.sec-head{margin-bottom:clamp(28px,4vw,56px);max-width:44rem}.sec-head h2{margin-bottom:14px}
.btn{display:inline-flex;align-items:center;gap:10px;padding:14px 26px;border-radius:var(--btn-r);font:inherit;font-weight:600;text-decoration:none;cursor:pointer;transition:transform .2s ease,box-shadow .2s ease,background .2s ease;${btn}}
.btn svg{width:18px;height:18px;transition:transform .2s ease}.btn:hover svg{transform:translateX(3px)}
.btn:hover{transform:translateY(-1px);box-shadow:0 10px 24px -10px rgba(0,0,0,.35)}
.btn.alt{background:transparent;color:inherit;border:1.5px solid currentColor}
.btn.accent{background:var(--accent);color:var(--accent-fg);border-color:var(--accent)}
.cta-row{display:flex;gap:14px;flex-wrap:wrap;margin-top:32px;align-items:center}
.ico{width:46px;height:46px;border-radius:calc(var(--r) * .7);background:var(--surface-muted);color:var(--primary);display:grid;place-items:center;flex:none}.ico svg{width:22px;height:22px}
.tone-primary .ico{background:rgba(255,255,255,.12);color:inherit}
.card{${cardSurface};border-radius:var(--r);padding:clamp(20px,2.4vw,32px)}.card p{color:var(--muted-fg);margin-top:8px}
.art{width:100%;height:100%;object-fit:cover}.frame{border-radius:var(--r);overflow:hidden;background:var(--surface-muted);position:relative}.frame img{width:100%;height:100%;object-fit:cover}
.pill{display:inline-block;padding:4px 12px;border-radius:999px;background:var(--surface-muted);font-size:.8rem;font-weight:600;color:var(--muted-fg)}
.mk{font-family:var(--font-label);font-weight:600;font-size:.9rem}.gap{margin-top:14px}.qrow{display:flex;gap:12px;align-items:center}.qrow.strong{font-weight:600}.qrow.soft{color:var(--muted-fg)}.narrow{max-width:52rem}.m0{margin:0}.h3-lg{font-size:clamp(1.5rem,3vw,2.2rem)}.mt{margin-top:16px}.mb{margin-bottom:22px}.qt{margin:0;color:var(--fg);font-size:1.1rem}.cform{max-width:560px;margin:32px auto 0;text-align:left}.fdesc{margin-top:12px;max-width:36ch}.flush{margin-top:0}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}.steps{list-style:none;padding:0;margin:0}.process.n2 .steps{--n:2}.process.n3 .steps{--n:3}.process.n4 .steps{--n:4}
.trust .tl{width:100%;justify-content:center;font-weight:500;color:var(--muted-fg)}
.fp-lt{object-position:0 0}.fp-ct{object-position:50% 0}.fp-rt{object-position:100% 0}.fp-lm{object-position:0 50%}.fp-rm{object-position:100% 50%}.fp-lb{object-position:0 100%}.fp-cb{object-position:50% 100%}.fp-rb{object-position:100% 100%}
/* header */
header.site{position:relative;z-index:20;background:var(--bg);border-bottom:1px solid var(--border)}
header.site .bar{display:flex;align-items:center;justify-content:space-between;gap:24px;min-height:76px}
.brand{font-family:var(--font-display);font-weight:var(--h-weight);font-size:1.35rem;letter-spacing:var(--track);text-decoration:none;display:flex;align-items:center;gap:10px}
.brand i{width:12px;height:12px;background:var(--accent);border-radius:${design.shape === "sharp" ? "0" : "50%"};display:block}
.links{display:flex;gap:6px;list-style:none;margin:0;padding:0;align-items:center}
.links a{padding:8px 14px;text-decoration:none;font-weight:500;font-size:.97rem;border-radius:var(--btn-r);color:var(--fg)}
.links a:hover,.links a[aria-current=page]{background:var(--surface-muted)}
.links a.nav-cta{background:var(--primary);color:var(--primary-fg)}
.menu{display:none}.menu summary{list-style:none;cursor:pointer;padding:10px 16px;border:1.5px solid var(--fg);border-radius:var(--btn-r);font-weight:600}.menu summary::-webkit-details-marker{display:none}
.menu ul{position:absolute;left:0;right:0;top:100%;background:var(--bg);border-bottom:1px solid var(--border);list-style:none;margin:0;padding:12px 20px 20px;display:grid;gap:4px}.menu ul a{display:block;padding:14px 8px;text-decoration:none;font-size:1.1rem;border-bottom:1px solid var(--border)}
.nav-minimal header.site,.nav-minimal-wrap{border-bottom:0}
header.nav-centered .bar{flex-direction:column;gap:6px;padding-block:18px}header.nav-centered .brand{font-size:1.7rem}
header.nav-split .bar{display:grid;grid-template-columns:1fr auto 1fr}header.nav-split .links.l{justify-content:flex-start}header.nav-split .links.r{justify-content:flex-end}header.nav-split .brand{justify-self:center}
header.nav-floating{position:absolute;inset:16px 0 auto;width:100%;background:transparent;border:0}body{position:relative}header.nav-floating~main>.hero:first-child{padding-top:clamp(120px,13vw,170px)}header.nav-floating .bar{background:var(--surface-raised);border:1px solid var(--border);border-radius:${design.shape === "sharp" ? "0" : "999px"};padding:0 14px 0 26px;min-height:64px;box-shadow:0 12px 36px -16px rgba(0,0,0,.3)}
header.nav-dark{background:${design.mode === "dark" ? "var(--surface-raised)" : "var(--primary)"};color:${design.mode === "dark" ? "var(--fg)" : "var(--primary-fg)"};border:0}header.nav-dark .links a{color:inherit}header.nav-dark .links a.nav-cta{background:var(--accent);color:var(--accent-fg)}header.nav-dark .links a:hover{background:rgba(127,127,127,.2)}header.nav-dark .menu summary{border-color:currentColor}header.nav-dark .menu ul{background:${design.mode === "dark" ? "var(--surface-raised)" : "var(--primary)"}}header.nav-dark .menu ul a{border-color:rgba(127,127,127,.3)}
header.nav-minimal{border-bottom:0}header.nav-minimal .links a{padding-inline:10px}
/* hero */
.hero{padding-block:clamp(48px,8vw,112px) var(--sp)}
.hero h1{max-width:18ch}.hero h1.h-long{font-size:calc(var(--h1) * .74)}.hero h1.h-xl{font-size:calc(var(--h1) * .58)}.hero .lead{margin-top:22px}
.hero .hl{list-style:none;padding:0;margin:28px 0 0;display:flex;flex-wrap:wrap;gap:10px 22px;color:var(--muted-fg);font-weight:500;font-size:.95rem}.hero .hl li{display:flex;gap:8px;align-items:center}.hero .hl svg{width:18px;height:18px;color:var(--accent)}
.hero.v-editorial-centered{text-align:center}.hero.v-editorial-centered h1{margin-inline:auto;max-width:16ch;font-size:calc(var(--h1) * 1.08)}.hero.v-editorial-centered .lead{margin-inline:auto}.hero.v-editorial-centered .cta-row,.hero.v-editorial-centered .hl,.hero.v-editorial-centered .eyebrow{justify-content:center}
.hero .split{display:grid;gap:clamp(28px,5vw,72px);align-items:center}
@media(min-width:900px){.hero .split{grid-template-columns:1.05fr .95fr}.hero.v-media-left .split{grid-template-columns:.95fr 1.05fr}.hero.v-media-left .split>:first-child{order:2}}
.hero .art-slot{aspect-ratio:5/4.4;border-radius:var(--r);overflow:hidden}
.hero.v-split-art .art-slot{aspect-ratio:4/5;border-radius:${design.shape === "sharp" ? "0" : "var(--r) var(--r) var(--r) 160px"}}
.hero.v-full-bleed{min-height:min(88vh,820px);display:flex;align-items:flex-end;color:var(--hero-fg);background:var(--hero-base);overflow:hidden;padding-block:clamp(120px,16vw,220px) clamp(48px,7vw,96px)}.hero.v-full-bleed .bg{position:absolute;inset:0;opacity:.5}.hero.v-full-bleed .bg::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,transparent,var(--hero-base) 92%)}.hero.v-full-bleed .wrap{position:relative}.hero.v-full-bleed .lead,.hero.v-full-bleed .hl{color:inherit;opacity:.9}.hero.v-full-bleed h1{max-width:15ch}
.hero.v-bento .grid{display:grid;gap:14px;margin-top:44px}.hero.v-bento .grid>*{border-radius:var(--r);overflow:hidden;min-height:150px}
@media(min-width:800px){.hero.v-bento .grid{grid-template-columns:2fr 1fr 1fr;grid-template-rows:200px 200px}.hero.v-bento .grid .big{grid-row:span 2}}
.hero.v-bento .grid .tile{padding:24px;display:flex;flex-direction:column;justify-content:flex-end;background:var(--surface-muted);font-weight:600}.hero.v-bento .grid .tile:nth-child(3){background:var(--primary);color:var(--primary-fg)}.hero.v-bento .grid .tile:nth-child(4){background:var(--accent);color:var(--accent-fg)}
.hero.v-collage .stack{position:relative;min-height:420px}.hero.v-collage .stack>*{position:absolute;border-radius:var(--r);overflow:hidden;box-shadow:0 24px 60px -24px rgba(0,0,0,.35)}.hero.v-collage .stack .a{inset:0 28% 18% 0}.hero.v-collage .stack .b{inset:34% 0 0 36%;border:6px solid var(--bg)}
.hero.v-local-service{background:var(--surface-muted)}.hero.v-local-service .quick{display:grid;gap:12px;margin-top:28px;padding:20px;background:var(--bg);border-radius:var(--r);border:1px solid var(--border)}.hero.v-local-service .quick a{display:flex;gap:12px;align-items:center;text-decoration:none;font-weight:600}.hero.v-local-service .quick svg{width:20px;height:20px;color:var(--accent)}
.hero.v-portfolio h1{max-width:20ch;font-size:calc(var(--h1) * 1.15)}.hero.v-portfolio .reel{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:48px}.hero.v-portfolio .reel>*{aspect-ratio:3/4;border-radius:var(--r);overflow:hidden}.hero.v-portfolio .reel>*:nth-child(2){margin-top:36px}
.hero.v-product{background:linear-gradient(180deg,var(--surface),var(--bg))}.hero.v-product .shot{border:1px solid var(--border);border-radius:var(--r);background:var(--surface-raised);box-shadow:0 40px 80px -30px rgba(0,0,0,.35);overflow:hidden;margin-top:48px}.hero.v-product .shot .chrome{display:flex;gap:6px;padding:12px 16px;border-bottom:1px solid var(--border)}.hero.v-product .shot .chrome i{width:10px;height:10px;border-radius:50%;background:var(--border);display:block}.hero.v-product .shot .body{aspect-ratio:16/8}
.hero.v-luxury{text-align:center;padding-block:clamp(72px,12vw,176px)}.hero.v-luxury h1{margin-inline:auto;max-width:14ch;font-weight:400;letter-spacing:.01em}.hero.v-luxury .lead{margin-inline:auto}.hero.v-luxury .cta-row,.hero.v-luxury .eyebrow{justify-content:center}.hero.v-luxury .rule{width:1px;height:64px;background:var(--accent);margin:0 auto 32px}
.hero.v-minimal-statement{padding-block:clamp(72px,14vw,200px)}.hero.v-minimal-statement h1{max-width:22ch;font-size:calc(var(--h1) * 1.2)}.hero.v-minimal-statement .row{display:grid;gap:28px;margin-top:48px;padding-top:28px;border-top:1px solid var(--fg)}@media(min-width:800px){.hero.v-minimal-statement .row{grid-template-columns:1fr 1fr}}
.hero.v-stacked-story .num{font-family:var(--font-label);color:var(--accent);font-size:.9rem;letter-spacing:.2em}.hero.v-stacked-story .rail{display:grid;gap:0;margin-top:44px;border-top:1px solid var(--border)}.hero.v-stacked-story .rail>div{display:grid;gap:8px;padding:22px 0;border-bottom:1px solid var(--border)}@media(min-width:800px){.hero.v-stacked-story .rail>div{grid-template-columns:90px 1fr}}
/* trust */
.trust{padding-block:clamp(22px,3vw,36px);border-block:1px solid var(--border)}
.trust ul{list-style:none;margin:0;padding:0;display:flex;flex-wrap:wrap;gap:12px 36px;align-items:center;justify-content:center}.trust li{display:flex;gap:10px;align-items:center;font-weight:600;font-size:.96rem}.trust li svg{width:18px;height:18px;color:var(--accent)}
.trust.v-checklist ul{justify-content:flex-start}.trust.v-credentials li{font-family:var(--font-label);text-transform:uppercase;letter-spacing:.12em;font-size:.76rem;color:var(--muted-fg)}.trust .tl{width:100%;text-align:center;font-size:.8rem;letter-spacing:.14em;text-transform:uppercase;color:var(--muted-fg)}
/* grids */
.cards{display:grid;gap:clamp(14px,2vw,24px);grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr))}
.cards .card h3{margin-top:18px}
.list{border-top:1px solid var(--border)}.list>*{display:grid;gap:10px 40px;padding:clamp(18px,2.4vw,30px) 0;border-bottom:1px solid var(--border);align-items:baseline}@media(min-width:800px){.list>*{grid-template-columns:70px minmax(0,.9fr) minmax(0,1.2fr)}}
.list .n{font-family:var(--font-label);color:var(--accent);font-size:.9rem;letter-spacing:.14em;font-weight:600}.list p{color:var(--muted-fg)}.list h3{font-size:clamp(1.3rem,2.4vw,2rem)}
.services.v-editorial-list .list>*{grid-template-columns:1fr}.services.v-editorial-list .list h3{font-size:clamp(1.8rem,4.2vw,3.4rem);transition:transform .25s}.services.v-editorial-list .list>*:hover h3{transform:translateX(10px)}@media(min-width:800px){.services.v-editorial-list .list>*{grid-template-columns:minmax(0,1.3fr) minmax(0,1fr)}}
.services.v-numbered .cards .card{position:relative;padding-top:56px}.services.v-numbered .card .n{position:absolute;top:18px;left:clamp(20px,2.4vw,32px);font-family:var(--font-display);font-size:1.7rem;color:var(--accent)}
.services.v-image-cards .card{padding:0;overflow:hidden}.services.v-image-cards .card .thumb{aspect-ratio:16/10}.services.v-image-cards .card .tx{padding:22px 24px 28px}
.services.v-split .split{display:grid;gap:clamp(28px,5vw,80px)}@media(min-width:900px){.services.v-split .split{grid-template-columns:.8fr 1.2fr}.services.v-split .sec-head{position:sticky;top:32px;align-self:start}}
.acc details{border-bottom:1px solid var(--border);padding:6px 0}.acc summary{cursor:pointer;font-family:var(--font-display);font-size:clamp(1.15rem,2vw,1.55rem);padding:16px 0;list-style:none;display:flex;justify-content:space-between;gap:20px;align-items:center}.acc summary::-webkit-details-marker{display:none}.acc summary::after{content:"+";font-size:1.6rem;color:var(--accent);transition:transform .2s}.acc details[open] summary::after{transform:rotate(45deg)}.acc details p{padding-bottom:20px;color:var(--muted-fg);max-width:var(--measure)}
.feat.v-statements .st{display:grid;gap:0}.feat.v-statements .st>div{padding:clamp(22px,3vw,40px) 0;border-top:1px solid var(--border);display:grid;gap:10px 40px}@media(min-width:800px){.feat.v-statements .st>div{grid-template-columns:1fr 1fr}}.feat.v-statements .st h3{font-size:clamp(1.5rem,3vw,2.3rem)}
.feat.v-alternating .alt-row{display:grid;gap:28px;align-items:center;padding-block:clamp(20px,3vw,40px)}@media(min-width:800px){.feat.v-alternating .alt-row{grid-template-columns:1fr 1fr;gap:64px}.feat.v-alternating .alt-row:nth-child(even)>:first-child{order:2}}.feat.v-alternating .alt-row .frame{aspect-ratio:4/3}
.feat.v-bento .bento{display:grid;gap:14px}@media(min-width:800px){.feat.v-bento .bento{grid-template-columns:repeat(4,1fr)}.feat.v-bento .bento>:nth-child(1){grid-column:span 2;grid-row:span 2}.feat.v-bento .bento>:nth-child(4){grid-column:span 2}}
/* about */
.about .split{display:grid;gap:clamp(28px,5vw,80px);align-items:center}@media(min-width:900px){.about .split{grid-template-columns:1fr 1fr}.about.v-editorial .split{grid-template-columns:.7fr 1.3fr;align-items:start}}
.about .body{margin-top:20px;display:grid;gap:18px;color:var(--muted-fg);font-size:1.08rem}.about .frame{aspect-ratio:4/4.4}
.about.v-mission h2{font-size:clamp(2rem,5vw,4rem);max-width:22ch}.about.v-mission .body{margin-top:28px;max-width:var(--measure)}
.vals{display:flex;flex-wrap:wrap;gap:10px;margin-top:28px;list-style:none;padding:0}.vals li{padding:8px 16px;border:1px solid var(--border);border-radius:999px;font-weight:600;font-size:.92rem}
/* process */
.steps{display:grid;gap:clamp(16px,2vw,28px);counter-reset:s}
@media(min-width:800px){.process.v-numbered .steps,.process.v-steps .steps,.process.v-horizontal .steps{grid-template-columns:repeat(var(--n,3),1fr)}}
.step{counter-increment:s;position:relative;display:block}.step::before{content:counter(s,decimal-leading-zero);font-family:var(--font-display);font-size:clamp(2.4rem,4vw,3.6rem);color:var(--accent);display:block;line-height:1;margin-bottom:14px}.step p{color:var(--muted-fg);margin-top:8px}
.process.v-timeline .steps{border-left:2px solid var(--border);padding-left:clamp(20px,4vw,48px);gap:36px}.process.v-timeline .step::after{content:"";position:absolute;left:calc(-1 * clamp(20px,4vw,48px) - 7px);top:16px;width:12px;height:12px;border-radius:50%;background:var(--accent)}
.process.v-steps .step{${cardSurface};padding:24px;border-radius:var(--r)}.process.v-horizontal .step{border-top:2px solid var(--fg);padding-top:20px}
/* portfolio */
.pf{display:grid;gap:clamp(14px,2vw,24px)}@media(min-width:760px){.pf{grid-template-columns:repeat(2,1fr)}.portfolio.v-grid .pf{grid-template-columns:repeat(3,1fr)}.portfolio.v-editorial .pf>:nth-child(3n+1){grid-column:span 2}}
.pf .it .frame{aspect-ratio:4/3;margin-bottom:14px;transition:transform .4s}.pf .it:hover .frame{transform:scale(.985)}.pf .it p{color:var(--muted-fg);font-size:.95rem}.pf .it .t{display:flex;justify-content:space-between;gap:12px;align-items:baseline}
.portfolio.v-featured .feat1{display:grid;gap:28px;margin-bottom:28px}@media(min-width:900px){.portfolio.v-featured .feat1{grid-template-columns:1.4fr 1fr;align-items:end}}
/* testimonials */
.quote{font-family:var(--font-display);font-size:clamp(1.4rem,3vw,2.3rem);line-height:1.25;letter-spacing:var(--track);max-width:30ch;margin:0}.who{margin-top:18px;color:var(--muted-fg);font-size:.95rem}.who b{color:var(--fg);display:block}
.testi.v-spotlight .spot{max-width:900px}.testi.v-spotlight .quote{font-size:clamp(1.6rem,3.8vw,3rem);max-width:none}.testi.v-spotlight .spot::before{content:"\\201C";font-family:var(--font-display);font-size:6rem;line-height:.6;color:var(--accent);display:block}
.testi.v-stacked .stk{display:grid;gap:clamp(24px,4vw,48px)}.testi.v-stacked figure{margin:0;padding-top:24px;border-top:1px solid var(--border)}
/* team / pricing / stats */
.team .tm .ph{aspect-ratio:1;margin-bottom:14px}.team .tm p{color:var(--muted-fg);font-size:.95rem}.team.v-list .tm{display:grid;grid-template-columns:1fr 1fr;gap:20px;padding:20px 0;border-bottom:1px solid var(--border)}
.tiers{display:grid;gap:clamp(14px,2vw,24px);align-items:stretch}@media(min-width:800px){.tiers{grid-template-columns:repeat(auto-fit,minmax(240px,1fr))}}
.tier{display:flex;flex-direction:column;gap:14px}.tier .price{font-family:var(--font-display);font-size:clamp(2rem,3.4vw,2.8rem);line-height:1}.tier ul{list-style:none;padding:0;margin:6px 0 auto;display:grid;gap:10px}.tier li{display:flex;gap:10px}.tier li svg{width:18px;height:18px;color:var(--accent);flex:none;margin-top:4px}
.tier.featured{background:var(--primary);color:var(--primary-fg);border-color:var(--primary)}.tier.featured p{color:inherit;opacity:.85}.tier.featured .btn{background:var(--accent);color:var(--accent-fg);border-color:var(--accent)}
.stats .sg{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:28px}.stats .big{font-family:var(--font-display);font-size:clamp(2.6rem,6vw,5rem);line-height:1;letter-spacing:var(--track);color:var(--primary)}.tone-primary .stats .big,.sec.tone-primary .big{color:inherit}.stats .lbl{color:var(--muted-fg);margin-top:8px}
/* faq / contact / cta */
.faq .split{display:grid;gap:clamp(24px,5vw,72px)}@media(min-width:900px){.faq.v-split .split{grid-template-columns:.8fr 1.2fr}}
.contact .split{display:grid;gap:clamp(28px,5vw,80px)}@media(min-width:900px){.contact .split{grid-template-columns:1fr 1fr}}
.cdetails{display:grid;gap:18px;margin-top:28px;list-style:none;padding:0}.cdetails li{display:flex;gap:14px;align-items:flex-start}.cdetails svg{width:22px;height:22px;color:var(--accent);flex:none;margin-top:2px}.cdetails a{text-decoration:none;font-weight:600}.cdetails small{display:block;color:var(--muted-fg)}
form{display:grid;gap:14px}label{display:grid;gap:6px;font-weight:600;font-size:.95rem}
input,textarea,select{font:inherit;padding:13px 14px;border:1.5px solid var(--border);border-radius:min(var(--r),12px);background:var(--surface-raised);color:var(--fg);width:100%}
input:focus,textarea:focus,select:focus{border-color:var(--primary);outline:none;box-shadow:0 0 0 3px color-mix(in srgb,var(--accent) 40%,transparent)}
.hp{position:absolute;left:-9999px;height:0;overflow:hidden}.form-status{min-height:1.4em;font-weight:600}
.contact.v-conversion{text-align:center}.contact.v-conversion .sec-head{margin-inline:auto}.contact.v-conversion .cdetails{justify-content:center;grid-auto-flow:column}.contact .wa{background:#1f9d55;border-color:#1f9d55;color:#fff}
.cta-band{display:grid;gap:24px;align-items:center;justify-items:start;padding:clamp(32px,6vw,72px);border-radius:var(--r);background:var(--primary);color:var(--primary-fg)}@media(min-width:800px){.cta .cta-band{grid-template-columns:1.5fr auto;justify-items:start}}
.cta-band p{opacity:.9;margin-top:10px}.cta.v-outline .cta-band{background:transparent;color:var(--fg);border:1.5px solid var(--fg)}.cta.v-big-type{text-align:center}.cta.v-big-type h2{font-size:clamp(2.4rem,8vw,6.5rem);max-width:14ch;margin-inline:auto}.cta.v-big-type p{margin:20px auto 0;max-width:var(--measure)}.cta.v-big-type .btn{margin-top:32px}
.cta-band .btn{background:var(--accent);color:var(--accent-fg);border-color:var(--accent)}.cta.v-outline .cta-band .btn{background:var(--primary);color:var(--primary-fg);border-color:var(--primary)}
/* footer */
footer.site{border-top:1px solid var(--border);padding-block:clamp(36px,5vw,64px);background:var(--surface);color:var(--muted-fg);font-size:.95rem}
footer.site .fg{display:grid;gap:28px}@media(min-width:800px){footer.site.v-columns .fg{grid-template-columns:1.3fr 1fr 1fr}}
footer.site .brand{color:var(--fg)}footer.site ul{list-style:none;padding:0;margin:0;display:grid;gap:8px}footer.site a{text-decoration:none}footer.site a:hover{text-decoration:underline}footer.site h4{font-family:var(--font-label);font-size:.76rem;letter-spacing:.14em;text-transform:uppercase;color:var(--fg);margin-bottom:12px;font-weight:600}
footer.site.v-brand-heavy .big{font-family:var(--font-display);font-size:clamp(3rem,13vw,10rem);line-height:.9;color:var(--fg);letter-spacing:var(--track);margin-bottom:28px}footer.site.v-minimal .fg{display:flex;flex-wrap:wrap;justify-content:space-between;gap:16px}
.legal{margin-top:28px;padding-top:20px;border-top:1px solid var(--border);font-size:.86rem}
.sticky-cta{display:none}
@media(max-width:820px){.links.d{display:none}.menu{display:block}header.nav-split .bar{display:flex}header.nav-floating .bar{padding-left:18px}header.nav-centered .menu{align-self:stretch;text-align:center}.hero.v-collage .stack{min-height:340px}.contact.v-conversion .cdetails{grid-auto-flow:row}.hero.v-portfolio .reel>*:nth-child(2){margin-top:0}
.sticky-cta{display:flex;position:fixed;left:12px;right:12px;bottom:12px;z-index:30;gap:10px}.sticky-cta a{flex:1;justify-content:center;box-shadow:0 12px 30px -10px rgba(0,0,0,.5)}body.has-sticky{padding-bottom:84px}}
${
  design.motion === "none"
    ? ""
    : `@media(prefers-reduced-motion:no-preference){@supports(animation-timeline:view()){.rv{animation:rv linear both;animation-timeline:view();animation-range:entry 0% cover 24%}@keyframes rv{from{opacity:0;transform:translateY(${design.motion === "expressive" ? "36px" : "16px"})}to{opacity:1;transform:none}}}}`
}
@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}*{transition:none!important;animation:none!important}}
`;
}
