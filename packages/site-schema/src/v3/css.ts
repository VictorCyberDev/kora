import { contrast, ensureContrast, mix, readableOn, type DesignGenome } from "@kora/creative";
import type { Palette } from "../v2/spec.js";
import { voiceFaceCss, voiceStacks, VOICES } from "./fonts.js";

type Tone = "light" | "alt" | "dark" | "brand" | "accent";

/** Variables for one surface "tone". Every foreground used on it is contrast-checked against that tone's background. */
function toneVars(p: Palette, mode: "light" | "dark", tone: Tone): string {
  let bg: string, fg: string;
  if (tone === "light") [bg, fg] = [p.background, p.foreground];
  else if (tone === "alt") [bg, fg] = [p.surfaceMuted, p.foreground];
  else if (tone === "dark") {
    bg = mode === "dark" ? mix(p.background, "#000000", 0.4) : mix(p.foreground, p.primary, 0.1);
    fg = mode === "dark" ? p.foreground : p.background;
  } else if (tone === "brand") [bg, fg] = [p.primary, p.primaryForeground];
  else [bg, fg] = [p.secondary, p.secondaryForeground];
  fg = ensureContrast(fg, bg, 7);
  const sf = tone === "light" ? p.surfaceRaised : mix(bg, fg, 0.06);
  // Text must hold on the tone's background AND on the card surface that sits on it.
  const onBoth = (c: string) => ensureContrast(ensureContrast(c, bg, 4.5), sf, 4.5);
  const mf = onBoth(mix(fg, bg, 0.3));
  const ac = onBoth(p.accent);
  const bd = mix(bg, fg, tone === "dark" || mode === "dark" ? 0.28 : 0.2);
  // Button fill: the first brand colour that is visibly distinct from this surface, else the foreground.
  const bb = [p.primary, p.accent, p.secondary, fg].find((c) => contrast(c, bg) >= 3) ?? fg;
  const bf = readableOn(bb);
  return `--bg:${bg};--fg:${fg};--mf:${mf};--ac:${ac};--bd:${bd};--sf:${sf};--bb:${bb};--bf:${bf}`;
}

const PAD = {
  airy: "clamp(72px,12vw,164px)",
  balanced: "clamp(56px,9vw,112px)",
  compact: "clamp(40px,6.5vw,80px)",
  dense: "clamp(32px,5vw,60px)",
} as const;
const SCALE: Record<DesignGenome["typeContrast"], [number, number, number]> = {
  low: [2.2, 5.2, 3.8],
  medium: [2.4, 6.4, 4.8],
  high: [2.6, 7.6, 6],
  extreme: [2.8, 10.5, 9],
};
const RADIUS = { none: "0", slight: "4px", soft: "12px", round: "22px", pill: "26px", arch: "6px" } as const;

export function baseCss(g: DesignGenome, p: Palette, mode: "light" | "dark"): string {
  const voice = VOICES[g.typeVoice];
  const st = voiceStacks(voice.id);
  const k = Math.min(1.25, Math.max(0.62, 0.5 / voice.displayWidth));
  const [mn, vw, mx] = SCALE[g.typeContrast];
  const boost = g.headlineBehavior === "oversized" ? 1.18 : g.headlineBehavior === "tight-stack" ? 1.05 : 1;
  const h1 = `clamp(${(mn * k).toFixed(2)}rem,${(vw * k * boost).toFixed(2)}vw,${(mx * k * boost).toFixed(2)}rem)`;
  const h2 = `clamp(${(mn * k * 0.62).toFixed(2)}rem,${(vw * k * 0.42 * boost).toFixed(2)}vw,${(mx * k * 0.5).toFixed(2)}rem)`;
  const pad = PAD[g.density];
  const padMul = g.spacingRhythm === "dramatic" ? 1.2 : g.spacingRhythm === "tight" ? 0.8 : 1;
  const r = RADIUS[g.radiusStyle];
  const btnR = g.buttonCharacter === "solid-pill" ? "999px" : g.buttonCharacter === "block-arrow" || g.buttonCharacter === "underline" ? "0" : g.buttonCharacter === "stamp" ? "8px" : r;
  const upper = g.headlineBehavior === "uppercase";
  const tracking = upper ? "0.01em" : voice.tracking;
  const lh = g.headlineBehavior === "tight-stack" ? 0.94 : upper ? 0.96 : g.typeContrast === "extreme" ? 0.98 : 1.04;
  const border = g.borderStyle === "heavy" ? "2px" : g.borderStyle === "none" ? "0" : "1px";
  const tones = (["light", "alt", "dark", "brand", "accent"] as Tone[])
    .map((t) => `.t-${t}{${toneVars(p, mode, t)}}`)
    .join("\n");
  const cardSurface =
    g.surfaceStyle === "flat"
      ? "background:var(--sf);border:0"
      : g.surfaceStyle === "paper"
        ? `background:var(--sf);border:${border === "0" ? "1px" : border} solid var(--bd)`
        : g.surfaceStyle === "raised"
          ? `background:var(--sf);border:${border} solid var(--bd);box-shadow:0 14px 30px -18px rgba(0,0,0,.35)`
          : `background:transparent;border:${border === "0" ? "1px" : border} solid var(--bd)`;
  const btn = (() => {
    switch (g.buttonCharacter) {
      case "outline-fine":
        return "background:transparent;color:var(--fg);border:1px solid var(--fg)";
      case "underline":
        return "background:transparent;color:var(--fg);border:0;border-bottom:2px solid var(--ac);padding-inline:0;padding-block:6px;min-height:44px";
      case "stamp":
        return "background:var(--bb);color:var(--bf);border:2px solid var(--fg);box-shadow:3px 3px 0 var(--fg);text-transform:uppercase;letter-spacing:.06em;font-size:.82rem";
      case "block-arrow":
        return "background:var(--bb);color:var(--bf);border:0;text-transform:uppercase;letter-spacing:.04em";
      default:
        return "background:var(--bb);color:var(--bf);border:1.5px solid var(--bb)";
    }
  })();
  return `${voiceFaceCss(voice.id)}
:root{--r:${r};--br:${btnR};--bw:${border};--fd:${st.display};--fb:${st.body};--fl:${st.label};--hw:${voice.headingWeight};--tr:${tracking};--lh:${lh};--h1:${h1};--h2:${h2};--pad:calc(${pad} * ${padMul});--gut:clamp(20px,5vw,56px);--max:1200px;color-scheme:${mode}}
*,*::before,*::after{box-sizing:border-box}
html{-webkit-text-size-adjust:100%;scroll-behavior:smooth}
body{margin:0;background:${p.background};color:${p.foreground};font:400 clamp(1rem,.96rem + .2vw,1.125rem)/1.62 var(--fb);overflow-x:hidden;-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
img,svg{max-width:100%;display:block}
h1,h2,h3,h4{font-family:var(--fd);font-weight:var(--hw);letter-spacing:var(--tr);line-height:1.08;margin:0;text-wrap:balance;overflow-wrap:break-word}
h1{font-size:var(--h1);line-height:var(--lh);${upper ? "text-transform:uppercase;" : ""}}
h2{font-size:var(--h2);line-height:${upper ? 1 : 1.06};${upper ? "text-transform:uppercase;" : ""}}
h3{font-size:clamp(1.15rem,1rem + .7vw,1.55rem)}
h1 em,h2 em{font-style:italic;font-weight:${voice.italic ? 400 : "inherit"}}
p{margin:0 0 1em;text-wrap:pretty}
a{color:inherit}
.w{width:min(var(--max),100% - 2*var(--gut));margin-inline:auto}
.sr{position:absolute;left:-9999px}
.skip{position:absolute;left:-999px;top:8px;background:#fff;color:#000;padding:10px 14px;z-index:99}.skip:focus{left:8px}
:focus-visible{outline:3px solid var(--ac,${p.accent});outline-offset:3px}
.sec{position:relative;background:var(--bg);color:var(--fg);padding-block:var(--pad)}
${tones}
.kick{font:600 .74rem/1 var(--fl);letter-spacing:.14em;text-transform:uppercase;color:var(--ac);margin:0 0 1.1rem;display:flex;gap:.7em;align-items:center}
.lede{font-size:clamp(1.05rem,1rem + .5vw,1.28rem);color:var(--mf);max-width:56ch}
.sh{max-width:46rem;margin-bottom:clamp(28px,5vw,56px)}.sh h2+.lede{margin-top:1rem}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:.55em;min-height:48px;padding:.82em 1.5em;border-radius:var(--br);font:600 1rem/1.1 var(--fb);text-decoration:none;cursor:pointer;transition:transform .18s ease,background .18s ease,box-shadow .18s ease;${btn}}
.btn:hover{transform:translateY(-2px)}
.btn.alt{background:transparent;color:var(--fg);border:1.5px solid currentColor;box-shadow:none}
.btn.wa::before{content:"";width:1.05em;height:1.05em;background:currentColor;-webkit-mask:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'><path d='M12 2a10 10 0 0 0-8.6 15L2 22l5.2-1.4A10 10 0 1 0 12 2zm5.2 14.2c-.2.6-1.3 1.2-1.8 1.2-.5.1-1 .2-3.3-.7-2.8-1.1-4.5-4-4.7-4.2-.1-.2-1.1-1.5-1.1-2.8s.7-2 1-2.3c.2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.5l.9 2.1c.1.2.1.4 0 .5l-.4.6-.4.4c-.1.2-.3.3-.1.6.2.3.8 1.3 1.7 2.1 1.2 1 2.1 1.3 2.4 1.5.3.1.5.1.6-.1l.9-1.1c.2-.3.4-.2.6-.1l2 1c.3.1.5.2.5.3.1.2.1.8-.1 1.4z'/></svg>") center/contain no-repeat;mask:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'><path d='M12 2a10 10 0 0 0-8.6 15L2 22l5.2-1.4A10 10 0 1 0 12 2zm5.2 14.2c-.2.6-1.3 1.2-1.8 1.2-.5.1-1 .2-3.3-.7-2.8-1.1-4.5-4-4.7-4.2-.1-.2-1.1-1.5-1.1-2.8s.7-2 1-2.3c.2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.5l.9 2.1c.1.2.1.4 0 .5l-.4.6-.4.4c-.1.2-.3.3-.1.6.2.3.8 1.3 1.7 2.1 1.2 1 2.1 1.3 2.4 1.5.3.1.5.1.6-.1l.9-1.1c.2-.3.4-.2.6-.1l2 1c.3.1.5.2.5.3.1.2.1.8-.1 1.4z'/></svg>") center/contain no-repeat}
.row{display:flex;flex-wrap:wrap;gap:12px 16px;align-items:center;margin-top:clamp(20px,3vw,32px)}
.frame{position:relative;overflow:hidden;background:var(--sf);border-radius:${g.imageCrop === "arch" ? "999px 999px 0 0" : r}}
.frame img,.frame .plate{width:100%;height:100%;object-fit:cover;aspect-ratio:var(--ar,4/5)}
.ar-natural{--ar:4/3}.ar-tall{--ar:3/4}.ar-square{--ar:1/1}.ar-wide{--ar:16/10}.ar-arch{--ar:4/5}
.tr-mono img{filter:grayscale(1) contrast(1.05)}.tr-warm img{filter:sepia(.28) saturate(1.1)}.tr-cool img{filter:saturate(.85) hue-rotate(-8deg)}.tr-contrast img{filter:contrast(1.15) saturate(1.05)}
.card{${cardSurface};border-radius:var(--r);padding:clamp(18px,2.4vw,30px)}
.card h3{margin-bottom:.45rem}.card p{color:var(--mf);margin:0}
.stamp{display:inline-grid;place-items:center;text-align:center;font:700 .74rem/1.15 var(--fl);letter-spacing:.1em;text-transform:uppercase;width:clamp(86px,11vw,128px);aspect-ratio:1;border-radius:50%;background:var(--ac-fill,${p.accent});color:${p.accentForeground};transform:rotate(-9deg);padding:10px;border:2px dashed currentColor;outline:3px solid ${p.accent};outline-offset:-1px}
.price{font-weight:700;white-space:nowrap}
.hp{position:absolute;left:-9999px;height:0;overflow:hidden}.form-status{min-height:1.4em;font-weight:600}
/* header */
.hd{position:relative;z-index:5;background:var(--bg);color:var(--fg);border-bottom:var(--bw) solid var(--bd)}
.hd .bar{display:flex;align-items:center;justify-content:space-between;gap:20px;padding-block:16px}
.brand{font:var(--hw) clamp(1.15rem,1rem + .8vw,1.5rem)/1 var(--fd);letter-spacing:var(--tr);text-decoration:none;display:inline-flex;align-items:center;gap:.5em;${upper ? "text-transform:uppercase;" : ""}}
.nav-d{display:none;gap:clamp(14px,2vw,30px);list-style:none;margin:0;padding:0;align-items:center}
.nav-d a{text-decoration:none;font-weight:500;font-size:.96rem;padding:6px 0;border-bottom:2px solid transparent}.nav-d a:hover,.nav-d a[aria-current]{border-bottom-color:var(--ac)}
.menu{position:relative}.menu summary{list-style:none;cursor:pointer;min-height:44px;display:inline-flex;align-items:center;font-weight:600;padding:0 4px}.menu summary::-webkit-details-marker{display:none}
.menu ul{position:absolute;right:0;top:100%;z-index:10;list-style:none;margin:8px 0 0;padding:10px;min-width:220px;background:var(--bg);border:var(--bw) solid var(--bd);box-shadow:0 20px 40px -20px rgba(0,0,0,.5)}
.menu li a{display:block;padding:12px 14px;text-decoration:none;font-weight:600}.menu li a:hover{background:var(--sf)}
@media(min-width:860px){.nav-d{display:flex}.menu{display:none}}
.hs-centered-stack .bar{flex-direction:column;gap:12px}.hs-centered-stack .nav-d{justify-content:center}
.hs-centered-stack .bar{padding-block:22px}.hs-centered-stack .brand{font-size:clamp(1.5rem,1.1rem + 1.6vw,2.2rem)}
.hs-split-rule .bar{padding-block:20px}.hs-split-rule{border-bottom:0}.hs-split-rule .bar{border-bottom:3px double var(--bd)}.hs-split-rule .nav-d a{font-size:.8rem;letter-spacing:.14em;text-transform:uppercase}
.hs-minimal-bar{border-bottom:var(--bw) solid var(--fg)}.hs-minimal-bar .bar{padding-block:12px}.hs-minimal-bar .nav-d a{font-size:.84rem;letter-spacing:.08em;text-transform:uppercase;font-weight:700}
.hs-sticker .brand{background:var(--bb);color:var(--bf);padding:.5em .9em;border:2px solid var(--fg);transform:rotate(-2deg);box-shadow:3px 3px 0 var(--fg)}
.hs-overlay{position:absolute;inset:0 0 auto 0;background:transparent;border:0;color:#fff}.hs-overlay .nav-d a,.hs-overlay .menu summary{color:#fff}.hs-overlay .menu ul{color:var(--fg)}
.seal{display:inline-grid;place-items:center;width:1.9em;height:1.9em;border:1.5px solid currentColor;border-radius:50%;font:var(--hw) .9em/1 var(--fd);font-style:normal}
/* footer */
.ft{background:var(--bg);color:var(--fg);padding-block:clamp(40px,7vw,88px) 28px;border-top:var(--bw) solid var(--bd)}
.ft h4{font:600 .74rem/1 var(--fl);letter-spacing:.14em;text-transform:uppercase;color:var(--ac);margin:0 0 14px}
.ft ul{list-style:none;margin:0;padding:0;display:grid;gap:8px}.ft a{text-decoration:none}.ft a:hover{text-decoration:underline}
.ft .fg{display:grid;gap:32px;grid-template-columns:repeat(auto-fit,minmax(200px,1fr))}.ft .legal{margin:36px 0 0;color:var(--mf);font-size:.88rem}
.ft .big{font:var(--hw) clamp(2.6rem,12vw,10rem)/.9 var(--fd);letter-spacing:var(--tr);overflow-wrap:anywhere;margin-bottom:clamp(24px,5vw,56px)}
.ft.fs-local-card .lc{${cardSurface};padding:clamp(20px,3vw,36px);border-radius:var(--r)}
/* action dock */
.dock{position:fixed;inset:auto 0 0 0;z-index:20;display:flex;gap:10px;padding:10px 12px calc(10px + env(safe-area-inset-bottom));background:${p.background};border-top:1px solid ${p.border}}
.dock .btn{flex:1;min-height:50px;--bb:${p.primary};--bf:${p.primaryForeground};--fg:${p.foreground};--ac:${p.accent}}
.dock .btn.wa{--bb:${p.accent};--bf:${p.accentForeground}}
body.has-dock{padding-bottom:78px}
@media(min-width:860px){.dock{display:none}body.has-dock{padding-bottom:0}}
/* motion */
@keyframes lift{from{transform:translateY(26px)}to{transform:none}}
@keyframes rise{from{opacity:0;transform:translateY(22px)}to{opacity:1;transform:none}}
@keyframes fade{from{opacity:0}to{opacity:1}}
@keyframes slide{from{transform:translateX(0)}to{transform:translateX(-50%)}}
${
  g.motionIntensity === "none"
    ? ""
    : `.hero .w>*{animation:${g.motionCharacter === "snap" ? "rise .35s steps(6)" : g.motionCharacter === "fade" ? "fade .9s ease" : "rise .8s cubic-bezier(.2,.7,.2,1)"} both}.hero .w>*:nth-child(2){animation-delay:.08s}.hero .w>*:nth-child(3){animation-delay:.16s}
@supports(animation-timeline:view()){.sec:not(.hero) .rv{animation:lift linear both;animation-timeline:view();animation-range:entry 0% cover 28%}}`
}
@media(prefers-reduced-motion:reduce){.cm{white-space:normal}.cm .tr{display:block}.cm .tr span:nth-child(2){display:none}.tk{white-space:normal}.tk .tr{display:flex;flex-wrap:wrap}.tk .tr span:nth-child(n+4){display:none}*,*::before,*::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}}
${motifCss(g)}
.has-dock .hs-overlay{position:absolute}
`;
}

function motifCss(g: DesignGenome): string {
  switch (g.signatureMotif) {
    case "hairline-rules":
      return `.sec+.sec{border-top:1px solid var(--bd)}.sh h2{padding-bottom:.6em;border-bottom:1px solid var(--bd)}.kick::after{content:"";height:1px;width:48px;background:var(--ac)}`;
    case "numerals":
      return `main{counter-reset:s}.sec{counter-increment:s}.sec:not(.hero) .kick::before{content:counter(s,decimal-leading-zero);font-variant-numeric:tabular-nums;color:var(--fg)}.sec:not(.hero) .kick::after{content:"";height:1px;width:40px;background:var(--bd)}`;
    case "arch-frame":
      return `.frame{border-radius:999px 999px 0 0!important}.plate-w{border-radius:999px 999px 0 0}`;
    case "stamp-label":
      return `.card{position:relative}.card .tag{display:inline-block;font:700 .7rem/1 var(--fl);letter-spacing:.12em;text-transform:uppercase;border:1.5px solid currentColor;padding:.45em .7em;border-radius:6px;transform:rotate(-2deg);margin-bottom:.8rem}`;
    case "corner-brackets":
      return `.frame::before,.frame::after,.card::before,.card::after{content:"";position:absolute;width:22px;height:22px;pointer-events:none;border:2px solid var(--ac);z-index:2}.frame::before,.card::before{top:10px;left:10px;border-right:0;border-bottom:0}.frame::after,.card::after{bottom:10px;right:10px;border-left:0;border-top:0}.card{position:relative}`;
    case "grain-dots":
      return `.sec.t-light,.sec.t-alt{background-image:radial-gradient(color-mix(in srgb,var(--fg) 12%,transparent) 1px,transparent 1.2px);background-size:14px 14px}`;
    case "wave-edge":
      return `.sec.t-dark,.sec.t-brand,.sec.t-accent{border-radius:clamp(28px,6vw,72px) clamp(28px,6vw,72px) 0 0;margin-top:calc(-1 * clamp(28px,6vw,72px));padding-top:calc(var(--pad) + clamp(28px,6vw,72px));z-index:1}.hero{margin-top:0!important}`;
    case "diagonal-cut":
      return `.sec.t-dark,.sec.t-brand,.sec.t-accent{clip-path:polygon(0 0,100% 3.2vw,100% 100%,0 calc(100% - 3.2vw));padding-block:calc(var(--pad) + 3vw);margin-block:-1.6vw}.hero{clip-path:polygon(0 0,100% 0,100% calc(100% - 3.2vw),0 100%);margin-block:0!important}`;
    case "ticket-perforation":
      return `.card{border-style:dashed!important}.card::before,.card::after{content:"";position:absolute;top:50%;width:18px;height:18px;border-radius:50%;background:var(--bg);margin-top:-9px;border:var(--bw) solid var(--bd)}.card::before{left:-10px}.card::after{right:-10px}.card{position:relative}`;
    case "monogram-seal":
      return `.hs-centered-stack .brand .seal,.hs-split-rule .brand .seal{display:inline-grid}`;
    case "marquee-band":
    default:
      return "";
  }
}
