// lib/ux-v0/design/frame.ts — an artboard as the page its frame draws, and the same artboard as a picture's source.
//
// THE WALL. Every artboard is drawn in an iframe with sandbox="allow-scripts" and never allow-same-origin: an opaque
// origin with no access to Socria's cookies, storage or page. Its document carries a Content-Security-Policy that
// allows no network calls, no frames and no script but ours (lib/ux-v0/sandbox.ts buildSandboxDoc, by nonce); faces
// come from Google Fonts and pictures are put in as data addresses. Our script only reports what the pointer does
// (by postMessage, which the canvas checks) and shows what the canvas asks; it never reads anything back to us but
// element ids, measured boxes and computed styles.
//
// ONE ROOT. The fragment is placed inside <div class="sx-root">, sized exactly to the artboard, and every :root,
// html and body selector the model wrote is read as .sx-root. The live frame and the exported picture (export.ts)
// use the same rewrite, so what is seen is what is exported.

import { buildSandboxDoc } from '../sandbox';
import { graphicFontStylesheet, graphicFont } from '../fonts';
import type { DesignArtboard } from './doc';
import { facesNamed, type Parse } from './elements';

/** The model's CSS, read against one root element (see the head of this file). */
export function scopeCss(css: string): string {
  return css
    .replace(/:root\b/g, '.sx-root')
    .replace(/(^|[\s,{}>+~(])html\b(?![-\w])/g, '$1.sx-root')
    .replace(/(^|[\s,{}>+~(])body\b(?![-\w])/g, '$1.sx-root');
}

/** The fragment with its <style> blocks scoped and its pictures put in. */
export function scopeFragment(html: string, assets: ReadonlyMap<string, string>): string {
  return html
    .replace(/(<style\b[^>]*>)([\s\S]*?)(<\/style>)/gi, (_m, a: string, css: string, b: string) => `${a}${scopeCss(css)}${b}`)
    .replace(/asset:([A-Za-z0-9_-]{1,40})/g, (m, id: string) => assets.get(id) ?? TRANSPARENT);
}

export const TRANSPARENT = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

/** The faces an artboard uses that the library can serve, and the stylesheet that serves them. */
export function facesFor(a: Pick<DesignArtboard, 'html'>, tokens: string): { faces: string[]; href: string | null } {
  const faces = facesNamed(a.html, tokens).filter((n) => !!graphicFont(n));
  return { faces, href: faces.length ? graphicFontStylesheet(faces) : null };
}

export function baseCss(w: number, h: number, background = '#ffffff'): string {
  return [
    `html,body{margin:0;padding:0;width:${w}px;height:${h}px;overflow:hidden;background:${background}}`,
    `.sx-root{position:relative;width:${w}px;height:${h}px;overflow:hidden;isolation:isolate}`,
    '.sx-root *,.sx-root *::before,.sx-root *::after{box-sizing:border-box}',
    '.sx-root img{max-width:none}',
  ].join('\n');
}

export interface FrameOptions {
  parse: Parse;
  nonce: string;
  /** pictures by asset id, as data addresses */
  assets: ReadonlyMap<string, string>;
  /** the canvas may select and edit (false for thumbnails and the presentation) */
  interactive: boolean;
}

/** The page an artboard's frame draws. */
export function frameDoc(a: DesignArtboard, tokens: string, o: FrameOptions): string {
  const fonts = facesFor(a, tokens);
  const head = [
    fonts.href ? `<link rel="stylesheet" href="${fonts.href}">` : '',
    `<style>${baseCss(a.width, a.height)}</style>`,
    tokens ? `<style data-sx-tokens>${scopeCss(tokens)}</style>` : '',
    o.interactive ? `<style>${CANVAS_CSS}</style>` : '',
  ].join('\n');
  const html = `<!doctype html><html><head>${head}</head><body><div class="sx-root">${scopeFragment(a.html, o.assets)}</div></body></html>`;
  // (a <link> the model wrote was taken out when its answer was saved, elements.ts; this one is ours)
  const built = buildSandboxDoc(html, { parse: o.parse, runScripts: false, nonce: o.nonce, inspector: o.interactive ? INTERACT_SOURCE : PASSIVE_SOURCE }).doc;
  return built;
}

const CANVAS_CSS = [
  '.sx-hover{position:fixed;pointer-events:none;outline:1px solid #2f6bff;outline-offset:0;z-index:2147483646}',
  '.sx-sel{position:fixed;pointer-events:none;outline:2px solid #2f6bff;outline-offset:0;z-index:2147483647}',
  '[contenteditable="true"]{outline:2px dashed #2f6bff!important;cursor:text!important}',
].join('\n');

/** In a thumbnail or the presentation: nothing but a report that the faces are in (for the picture to be taken). */
const PASSIVE_SOURCE = String.raw`(function(){
  var post=function(m){try{parent.postMessage(m,'*')}catch(e){}};
  var done=function(){post({sx:'ready',passive:true})};
  if(document.fonts&&document.fonts.ready){document.fonts.ready.then(done)}else{done()}
})();`;

/**
 * The canvas's own script in the frame: hover, select, edit text, drag; and what it measures (text cut off, things
 * outside the artboard). It speaks only by postMessage, in messages the canvas checks (components/ux-v0/design).
 */
export const INTERACT_SOURCE = String.raw`(function(){
  var root=document.querySelector('.sx-root'); if(!root) return;
  var mode='select', selId=null, editing=null, drag=null;
  var hov=document.createElement('div'); hov.className='sx-hover'; hov.style.display='none';
  var sel=document.createElement('div'); sel.className='sx-sel'; sel.style.display='none';
  document.body.appendChild(hov); document.body.appendChild(sel);
  var post=function(m){try{parent.postMessage(m,'*')}catch(e){}};
  var target=function(n){ while(n&&n.nodeType!==1) n=n.parentNode; return n&&n.closest?n.closest('[data-sx]'):null; };
  var byId=function(id){ return id?root.querySelector('[data-sx="'+id+'"]'):null; };
  var place=function(box,el){ if(!el){box.style.display='none';return} var r=el.getBoundingClientRect(); box.style.display='block'; box.style.left=r.left+'px'; box.style.top=r.top+'px'; box.style.width=r.width+'px'; box.style.height=r.height+'px'; };
  var KEYS=['font-family','font-size','font-weight','font-style','line-height','letter-spacing','text-align','text-transform','color','background-color','background-image','opacity','width','height','padding','margin','border-radius','position','left','top','right','bottom','translate','rotate','mix-blend-mode','display','gap','justify-content','align-items','fill','stroke','z-index'];
  var facts=function(el){
    var cs=getComputedStyle(el), st={}; for(var i=0;i<KEYS.length;i++) st[KEYS[i]]=cs.getPropertyValue(KEYS[i]);
    var r=el.getBoundingClientRect(), rr=root.getBoundingClientRect();
    var p=el.parentElement&&el.parentElement.closest?el.parentElement.closest('[data-sx]'):null;
    var onlyText=true; for(var j=0;j<el.childNodes.length;j++){var c=el.childNodes[j]; if(c.nodeType===1&&!/^(BR|SPAN|EM|STRONG|B|I)$/.test(c.tagName)){onlyText=false;break}}
    return {sx:'select',id:el.getAttribute('data-sx'),tag:el.tagName.toLowerCase(),text:(el.textContent||'').replace(/\s+/g,' ').trim().slice(0,200),textual:onlyText&&!!(el.textContent||'').trim(),classes:(el.getAttribute('class')||'').slice(0,120),inline:(el.getAttribute('style')||'').slice(0,600),parent:p?p.getAttribute('data-sx'):null,box:{x:r.left-rr.left,y:r.top-rr.top,w:r.width,h:r.height},style:st};
  };
  var choose=function(el){ selId=el?el.getAttribute('data-sx'):null; place(sel,el); post(el?facts(el):{sx:'select',id:null}); };
  document.addEventListener('mousemove',function(e){ if(mode!=='select'||drag||editing) return; place(hov,target(e.target)); },true);
  document.addEventListener('mouseleave',function(){ hov.style.display='none'; });
  document.addEventListener('pointerdown',function(e){
    if(mode!=='select'||editing||e.button!==0) return;
    var el=target(e.target); if(!el) { choose(null); return; }
    e.preventDefault();
    if(el.getAttribute('data-sx')!==selId){ choose(el); }
    drag={id:selId,el:el,x:e.clientX,y:e.clientY,moved:false,base:el.style.translate||''};
  },true);
  document.addEventListener('pointermove',function(e){
    if(!drag) return; var dx=e.clientX-drag.x, dy=e.clientY-drag.y;
    if(!drag.moved&&Math.abs(dx)+Math.abs(dy)<4) return; drag.moved=true;
    var b=(drag.base||'0px 0px').split(/\s+/), bx=parseFloat(b[0])||0, by=parseFloat(b[1]||'0')||0;
    drag.el.style.translate=(bx+dx)+'px '+(by+dy)+'px'; place(sel,drag.el); hov.style.display='none';
  },true);
  document.addEventListener('pointerup',function(e){
    if(!drag) return; var d=drag; drag=null;
    if(d.moved){ post({sx:'move',id:d.id,dx:Math.round(e.clientX-d.x),dy:Math.round(e.clientY-d.y)}); }
  },true);
  document.addEventListener('dblclick',function(e){
    if(mode!=='select') return; var el=target(e.target); if(!el) return;
    var f=facts(el); if(!f.textual) return;
    editing=el; el.setAttribute('contenteditable','true'); el.focus();
    try{ var rg=document.createRange(); rg.selectNodeContents(el); var s=getSelection(); s.removeAllRanges(); s.addRange(rg);}catch(x){}
    var finish=function(keep){ if(!editing) return; var t=el.innerText; el.removeAttribute('contenteditable'); editing=null; el.removeEventListener('blur',onBlur); if(keep) post({sx:'text',id:el.getAttribute('data-sx'),text:t.replace(/\n$/,'')}); else post({sx:'redraw'}); };
    var onBlur=function(){ finish(true); };
    el.addEventListener('blur',onBlur);
    el.addEventListener('keydown',function k(ev){ if(ev.key==='Escape'){ev.preventDefault();el.removeEventListener('keydown',k);finish(false);} else if(ev.key==='Enter'&&!ev.shiftKey){ev.preventDefault();el.removeEventListener('keydown',k);finish(true);} });
  },true);
  document.addEventListener('keydown',function(e){
    if(editing) return;
    var k=e.key, mod=e.metaKey||e.ctrlKey;
    if(k==='Delete'||k==='Backspace'||k==='Escape'||(mod&&/^[zZyYdD]$/.test(k))||/^Arrow/.test(k)){ e.preventDefault(); post({sx:'key',key:k,shift:e.shiftKey,mod:mod}); }
  },true);
  window.addEventListener('message',function(e){
    if(e.source!==parent) return; var m=e.data; if(!m||typeof m!=='object') return;
    if(m.sx==='mode') { mode=m.mode==='select'?'select':'none'; if(mode!=='select'){hov.style.display='none';} }
    else if(m.sx==='select') { var el=byId(m.id); selId=el?m.id:null; place(sel,el); if(el&&m.report) post(facts(el)); }
    else if(m.sx==='parent') { var c=byId(selId); var p=c&&c.parentElement?c.parentElement.closest('[data-sx]'):null; if(p) choose(p); }
    else if(m.sx==='hover') { place(hov,byId(m.id)); }
  });
  var measure=function(){
    var issues=[], rr=root.getBoundingClientRect(), els=root.querySelectorAll('[data-sx]');
    for(var i=0;i<els.length&&issues.length<20;i++){
      var el=els[i], r=el.getBoundingClientRect(); if(!r.width||!r.height) continue;
      var txt=(el.textContent||'').trim(); var own=false; for(var j=0;j<el.childNodes.length;j++){ if(el.childNodes[j].nodeType===3&&el.childNodes[j].textContent.trim()){own=true;break} }
      if(own&&(el.scrollWidth>el.clientWidth+2||el.scrollHeight>el.clientHeight+2)&&getComputedStyle(el).overflow!=='visible') issues.push({id:el.getAttribute('data-sx'),kind:'cut',text:txt.slice(0,60)});
      if(own&&(r.right>rr.right+1||r.bottom>rr.bottom+1||r.left<rr.left-1||r.top<rr.top-1)) issues.push({id:el.getAttribute('data-sx'),kind:'outside',text:txt.slice(0,60)});
    }
    post({sx:'ready',issues:issues,height:root.scrollHeight});
  };
  var go=function(){ setTimeout(measure,30); };
  if(document.fonts&&document.fonts.ready){document.fonts.ready.then(go)}else{go()}
})();`;
