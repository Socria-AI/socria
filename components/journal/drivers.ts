// @ts-nocheck
'use client';
// components/journal/drivers.ts
//
// The journal's behaviour, ported from the prototype's issue.js, motion.js and
// the two drivers that shipped inside parts.jsx and stage.jsx.
//
// MACHINE-PORTED — DO NOT HAND-EDIT, for the same reason as ds-bundle.ts.
// Upstream is the design project.
//
// This is all direct DOM work: it adds classes, splits headlines into
// per-word spans, scrubs an SVG path against scroll position. None of it
// touches React state, and the journal renders no state after mount, so React
// never re-renders the nodes it mutates. That is a real constraint rather
// than a happy accident — if the page ever grows a piece of state that
// re-renders a section these drivers have rewritten, the word-splitting will
// be undone underneath them.
//
// THE REVEAL CONTRACT, which is worth understanding before touching anything:
// nothing is hidden by CSS on its own. JS adds `.pre` to an element only once
// it has confirmed a real layout AND that the element sits below the fold, and
// a watchdog un-stages the page the moment a promoted element fails to
// actually animate. So if this file never runs — or runs in a context that
// freezes timers — the journal is simply fully visible rather than blank.
// Keep that property. A prettier reveal is not worth a blank homepage.

declare const window: any;

export function initJournal() {
  // React 18 StrictMode mounts effects twice in development; every driver
  // below installs listeners and intervals, so running them twice would
  // double every animation and leak a timer per mount.
  if (typeof window === 'undefined' || window.__socriaJournalStarted) return;
  window.__socriaJournalStarted = true;

  /* ── issue.js — reveal, progress, counter, the word split ────────── */
  /* ===== Socria — Issue No. 4 · behaviour =====
     Reveal contract: nothing is hidden by CSS on its own. JS adds `.pre` to an
     element ONLY once it has confirmed a real layout AND that the element sits
     below the fold. If JS never runs, or runs against a collapsed layout, the
     page is simply fully visible. */
  (function(){
    var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var doc = document.documentElement;
    var wi = 0;

    function wrapWord(node){
      var w=document.createElement("span");w.className="w";
      var i=document.createElement("i");i.style.setProperty("--i",wi++);
      i.appendChild(node);w.appendChild(i);return w;
    }
    function splitText(t){
      var out=[];
      t.split(/(\s+)/).forEach(function(p){
        if(p==="")return;
        if(/^\s+$/.test(p)){out.push(document.createTextNode(p));return}
        out.push(wrapWord(document.createTextNode(p)));
      });
      return out;
    }
    function splitEl(el){
      if(el.dataset.split==="done")return;
      wi=0;var frag=[];
      [].slice.call(el.childNodes).forEach(function(c){
        if(c.nodeType===3){frag=frag.concat(splitText(c.textContent))}
        else if(c.nodeName==="BR"){frag.push(c.cloneNode())}
        else if(c.nodeName==="SPAN"&&!c.querySelector("svg")){
          var cl=c.cloneNode(false);
          /* the pivot word: it arrives a beat late, in ink, and turns moss */
          var turn=/(^|\s)em(\s|$)/.test(c.className||"");
          [].slice.call(c.childNodes).forEach(function(g){
            if(g.nodeType===3){splitText(g.textContent).forEach(function(n){
              if(turn&&n.className==="w")n.firstChild.classList.add("tw");
              cl.appendChild(n);
            })}
            else{
              var w=wrapWord(g.cloneNode(true));
              if(turn)w.firstChild.classList.add("tw");
              cl.appendChild(w);
            }
          });
          frag.push(cl);
        } else frag.push(wrapWord(c.cloneNode(true)));
      });
      el.innerHTML="";frag.forEach(function(n){el.appendChild(n)});
      el.dataset.split="done";
    }

    function init(opts){
      opts = opts || {};
      var vh = innerHeight;
      if(!reduce)[].slice.call(document.querySelectorAll("[data-split]")).forEach(splitEl);

      var els=[].slice.call(document.querySelectorAll(".rv,[data-split],.turn,.fig,.reading"));
      var mapbox=document.querySelector(".mapbox");
      var armed=false,alive=false;

      /* Every spread is staged, so the whole issue is choreographed — but only
         once the driver has proven it runs, and the watchdog below un-stages the
         page the moment a promoted element fails to actually animate. */
      function arm(){
        if(armed||reduce||!alive)return;
        if(doc.scrollHeight<=innerHeight)return;      // layout not settled
        var h=innerHeight, any=false;
        els.forEach(function(e){
          var r=e.getBoundingClientRect();
          if(r.height===0)return;
          any=true;
          if(r.top>=h*0.15)e.classList.add("pre");   // on screen or below → animate in
        });
        if(mapbox){
          var mr=mapbox.getBoundingClientRect();
          if(mr.height>0&&mr.top<h&&mr.bottom>0)mapbox.classList.add("pre");
        }
        if(any)armed=true;
      }

      function sweep(){
        arm();
        els.forEach(function(e){
          if(!e.classList.contains("pre")||e.classList.contains("in"))return;
          e.classList.add("in");watch(e);
        });
        if(mapbox&&!mapbox.dataset.built&&mapbox.classList.contains("pre"))buildMap();
      }

      /* A promoted element whose opacity never reaches 1 means the timeline is
         frozen. The watchdog runs continuously, not once, so a context that
         freezes partway through the page still cannot strand a spread. */
      var proven=false,marks=[];
      function watch(e){
        if(proven)return;
        marks.push({e:e,t:Date.now()});
      }
      function guard(){
        if(proven||reduce||!marks.length)return;
        var now=Date.now(),ok=false;
        for(var i=0;i<marks.length;i++){
          var m=marks[i];
          if(now-m.t<900)continue;
          var probe=m.e.querySelector(".q,.w i")||m.e;
          if(getComputedStyle(probe).opacity==="0"){
            doc.classList.add("anim-off");proven=true;marks=[];return;
          }
          ok=true;
        }
        if(ok){proven=true;marks=[]}   // motion demonstrably works; stop checking
      }

      /* the map draws itself, driven by the same sweep — no separate observer */
      function buildMap(){
        if(!mapbox||mapbox.dataset.built)return;
        mapbox.dataset.built="1";
        if(!mapbox.classList.contains("pre"))return;   // already visible; nothing to stage
        var nodes=[].slice.call(mapbox.querySelectorAll(".mapnode"));
        var edges=[].slice.call(mapbox.querySelectorAll(".edges path"));
        nodes.forEach(function(n,i){setTimeout(function(){n.classList.add("on")},200+i*620)});
        edges.forEach(function(e){
          var after=+e.dataset.after||0;
          setTimeout(function(){e.classList.add("on")},360+after*620);
        });
        /* if timers are throttled, the nodes still appear */
        setTimeout(function(){
          if(nodes.length&&!nodes[nodes.length-1].classList.contains("on"))mapbox.classList.remove("pre");
        },200+nodes.length*620+900);
      }

      if(reduce){
        if(mapbox)mapbox.dataset.built="1";
      }else{
        addEventListener("load",function(){vh=innerHeight;arm();sweep()});
        addEventListener("scroll",sweep,{passive:true});
        addEventListener("resize",function(){vh=innerHeight;sweep()},{passive:true});
        if("ResizeObserver" in window){
          try{ new ResizeObserver(function(){arm();sweep()}).observe(document.body) }catch(e){}
        }
        if("IntersectionObserver" in window){
          try{
            var io=new IntersectionObserver(function(en){
              en.forEach(function(e){
                if(!e.isIntersecting)return;
                if(e.target===mapbox){buildMap();return}
                e.target.classList.add("in");
              });
            },{threshold:.15,rootMargin:"0px 0px -6% 0px"});
            els.forEach(function(e){io.observe(e)});
            if(mapbox)io.observe(mapbox);
          }catch(e){}
        }
      }

      /* cursor glow on the dark spreads */
      [].slice.call(document.querySelectorAll(".glow")).forEach(function(g){
        var host=g.parentElement;
        host.addEventListener("pointermove",function(e){
          var r=host.getBoundingClientRect();
          g.style.setProperty("--gx",(e.clientX-r.left)+"px");
          g.style.setProperty("--gy",(e.clientY-r.top)+"px");
        });
      });

      var progress=document.querySelector(".progress"),
          mast=document.querySelector(".mast"),
          countN=document.querySelector(".count .n"),
          countBar=document.querySelector(".count .bar i"),
          cover=document.querySelector(".cover .begin"),
          turns=[].slice.call(document.querySelectorAll(".turn[data-i],.refusal[data-i]")),
          darks=[].slice.call(document.querySelectorAll(".close,.dark-scope,.refusal")),
          deeps=[].slice.call(document.querySelectorAll(".one-deep")),
          total=turns.length,lastY=-1,lastNav=0;

      function update(y){
        var docH=doc.scrollHeight-vh,p=docH>0?y/docH:0;
        if(progress)progress.style.width=(p*100)+"%";
        if(mast){mast.classList.toggle("hidden",y>lastNav&&y>300);lastNav=y}
        var o=false;deeps.forEach(function(s){var r=s.getBoundingClientRect();if(r.top<=60&&r.bottom>60)o=true});
        document.body.classList.toggle("on-one",o);
        var d=false;darks.forEach(function(s){var r=s.getBoundingClientRect();if(r.top<=60&&r.bottom>60)d=true});
        document.body.classList.toggle("on-dark",d&&!o);
        /* the counter is meaningless against a collapsed layout */
        if(countN&&total&&turns[0].getBoundingClientRect().height>0){
          var seen=0;
          turns.forEach(function(t){var r=t.getBoundingClientRect();if(r.top<=vh*0.5)seen++});
          var cur=Math.max(1,Math.min(total,seen));
          var txt=turns[cur-1].dataset.i+" / "+turns[total-1].dataset.i;
          if(countN.textContent!==txt)countN.textContent=txt;
          if(countBar)countBar.style.height=((seen/total)*100)+"%";
        }
        if(cover)cover.style.opacity=y>80?"0":"1";
        if(opts.onScroll)opts.onScroll(y,vh);
      }
      /* The driver. Nothing is ever hidden until this has proven it runs, so a
         context that freezes timers or rAF simply shows the finished page. */
      var tick=0;
      (function frame(){
        var y=scrollY||doc.scrollTop;
        if(y!==lastY){lastY=y;update(y)}
        requestAnimationFrame(frame);
      })();
      setInterval(function(){
        tick++;
        if(tick>=2)alive=true;
        vh=innerHeight;
        if(!reduce){ arm(); sweep(); guard(); }
        update(scrollY||doc.scrollTop);
      },100);
      addEventListener("scroll",function(){update(scrollY||doc.scrollTop)},{passive:true});
      addEventListener("resize",function(){vh=innerHeight;lastY=-1},{passive:true});
      addEventListener("load",function(){vh=innerHeight;lastY=-1;update(scrollY||doc.scrollTop)});
      update(scrollY||0);

      var yEl=document.querySelector("[data-year]");
      if(yEl)yEl.textContent=new Date().getFullYear();
    }

    window.SocriaIssue={init:init,reduce:reduce};
  })();


  /* ── motion.js — the annotation layer ─────────────────────────────── */
  /* ===== Socria — the annotation layer =====
     Register-agnostic: works beside issue.js or quiet.js, depends on neither.
     Every behaviour here is additive. Nothing is hidden that requires this file
     to bring it back. */
  (function(){
    var reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    var started = false;
    function q(sel){ return [].slice.call(document.querySelectorAll(sel)) }

    function init(){
      if(started) return; started = true;

    function onScreen(el, frac){
      var r = el.getBoundingClientRect();
      if(r.height === 0) return false;
      return r.top < innerHeight * (frac || 0.86) && r.bottom > 0;
    }

    /* ---------- i · strike the cliché ---------- */
    function dressJargon(){ q(".jargon").forEach(function(j, n){
      if(j.querySelector(".ink-strike")) return;
      var svg = document.createElementNS("http://www.w3.org/2000/svg","svg");
      svg.setAttribute("class","ink-strike");
      svg.setAttribute("viewBox","0 0 100 10");
      svg.setAttribute("preserveAspectRatio","none");
      svg.setAttribute("aria-hidden","true");
      var p = document.createElementNS("http://www.w3.org/2000/svg","path");
      /* a hand keeps a slightly different line each time */
      p.setAttribute("d", n % 2
        ? "M1.5,6 C24,2.6 47,8.4 67,4.6 C81,2.2 92,6.4 98.5,4.4"
        : "M1.5,4.6 C23,8 46,2.4 66,6.2 C80,8.6 92,3.8 98.5,5.8");
      p.setAttribute("vector-effect","non-scaling-stroke");
      svg.appendChild(p);
      j.appendChild(svg);
      j.style.setProperty("--sl", 118);
    }) }

    /* ---------- iii · the stillness aside ---------- */
    function dressAsides(){ q(".aside-note").forEach(function(a){
      if(a.querySelector("svg")) return;
      var svg = document.createElementNS("http://www.w3.org/2000/svg","svg");
      svg.setAttribute("viewBox","0 0 34 26");
      svg.setAttribute("aria-hidden","true");
      var p = document.createElementNS("http://www.w3.org/2000/svg","path");
      p.setAttribute("d","M32,4 C22,2.4 8,6 2.5,18 M2.5,18 L7.6,12.6 M2.5,18 L9.4,19.6");
      svg.appendChild(p);
      a.insertBefore(svg, a.firstChild);
    }) }
    var stillTimer, liveTicks = 0;
    function armStillness(){
      clearTimeout(stillTimer);
      stillTimer = setTimeout(function(){
        /* the timer fired: this context runs timers, so the aside may hide until stillness */
        if(!document.documentElement.classList.contains("motion-live") && liveTicks >= 2)
          document.documentElement.classList.add("motion-live");
        q(".aside-note").forEach(function(a){
          var host = a.closest("section") || a.parentElement;
          var r = host.getBoundingClientRect();
          /* only the aside belonging to the spread you have actually settled on */
          if(r.top < innerHeight * 0.55 && r.bottom > innerHeight * 0.45) a.classList.add("shown");
        });
      }, 2600);
    }
    if(reduce) q(".aside-note").forEach(function(a){ a.classList.add("shown") });

    /* ---------- iv · the trade, scrubbed ---------- */
    var scrubs = [];
    function findScrubs(){ q(".fig.scrub").forEach(function(f){
      if(f.dataset.scrub) return; f.dataset.scrub = "1";
      var paths = [].slice.call(f.querySelectorAll(".draw")).map(function(p){
        /* the human line is dashed, so it is scrubbed by a clip rather than by
           its own dash pattern — dashing it twice would read as solid */
        return { p:p, len:0, dash:p.classList.contains("l-person"), rate:+(p.dataset.rate||1) };
      });
      scrubs.push({ f:f, paths:paths });
    }) }
    function scrub(){
      scrubs.forEach(function(s){
        var r = s.f.getBoundingClientRect();
        if(r.height === 0) return;
        /* 0 when the figure's top meets the bottom of the screen, 1 when its
           bottom reaches the middle */
        var span = r.height + innerHeight * 0.5;
        var t = Math.max(0, Math.min(1, (innerHeight - r.top) / span));
        s.paths.forEach(function(o){
          if(!o.len){
            try{ o.len = o.p.getTotalLength() }catch(e){}
            if(!o.len) return;                      // layout not ready; stay drawn
          }
          var e = Math.max(0, Math.min(1, t * o.rate));
          if(o.dash){
            o.p.style.strokeDasharray = "7 6";
            o.p.style.opacity = e > 0.02 ? 1 : 0;
            o.p.style.clipPath = "inset(0 " + ((1 - e) * 100).toFixed(2) + "% 0 0)";
          }else{
            o.p.style.strokeDasharray = o.len;
            o.p.style.strokeDashoffset = (o.len * (1 - e)).toFixed(1);
          }
        });
      });
    }

    /* ---------- v · mark the assumption node ---------- */
    function markAssumptions(){ q(".mapnode,.stage .locked").forEach(function(n){
      if(/assumption|unexamined/i.test(n.textContent) && !n.classList.contains("n-assumption"))
        n.classList.add("n-assumption");
    }) }

    /* ---------- vii · the guard types ---------- */
    function dressGuards(){ q(".guard-type").forEach(function(g){
      g.dataset.question = g.dataset.question || g.textContent.trim();
    }) }
    function typeInto(el, text, cls, done){
      var i = 0;
      el.className = "guard-type" + (cls ? " " + cls : "");
      (function step(){
        i++;
        if(i > text.length){ el.textContent = text; done && done(); return }
        el.textContent = text.slice(0, i);
        var c = document.createElement("span"); c.className = "gt-caret";
        el.appendChild(c);
        setTimeout(step, 22 + Math.random() * 26);
      })();
    }
    function deleteFrom(el, text, done){
      var i = text.length;
      (function step(){
        i -= 2;
        if(i <= 0){ el.textContent = ""; done && done(); return }
        el.textContent = text.slice(0, i);
        var c = document.createElement("span"); c.className = "gt-caret";
        el.appendChild(c);
        setTimeout(step, 14);
      })();
    }
    function runGuard(g){
      if(g.dataset.ran) return;
      g.dataset.ran = "1";
      var answer = g.dataset.answer || "", question = g.dataset.question;
      /* if anything stalls, the question is restored — never a blank line */
      var safety = setTimeout(function(){
        if(g.textContent.trim() !== question){
          g.className = "guard-type"; g.textContent = question;
        }
      }, 9000);
      typeInto(g, answer, "is-answer", function(){
        setTimeout(function(){
          deleteFrom(g, answer, function(){
            setTimeout(function(){
              typeInto(g, question, "", function(){ clearTimeout(safety) });
            }, 260);
          });
        }, 850);
      });
    }

    /* ---------- the sweep ---------- */
    function dress(){ dressJargon(); dressAsides(); findScrubs(); markAssumptions(); dressGuards() }
    function pass(){
      dress();   // survives later renders
      q(".jargon").forEach(function(j){ if(!j.classList.contains("struck") && onScreen(j, 0.78)) j.classList.add("struck") });
      q(".guard-type").forEach(function(g){ if(onScreen(g, 0.7)) runGuard(g) });
      scrub();
    }
    dress();

    if(reduce){
      q(".jargon").forEach(function(j){ j.classList.add("struck") });
    }else{
      pass();
      addEventListener("scroll", function(){ pass(); armStillness() }, {passive:true});
      addEventListener("resize", pass, {passive:true});
      addEventListener("pointermove", armStillness, {passive:true});
      addEventListener("keydown", armStillness);
      addEventListener("load", pass);
      if("IntersectionObserver" in window){
        try{
          var io = new IntersectionObserver(function(en){
            en.forEach(function(e){
              if(!e.isIntersecting) return;
              if(e.target.classList.contains("jargon")) e.target.classList.add("struck");
              else if(e.target.classList.contains("guard-type")) runGuard(e.target);
            });
          }, { threshold:.55 });
          q(".jargon,.guard-type").forEach(function(e){ io.observe(e) });
        }catch(e){}
      }
      setInterval(function(){ liveTicks++; pass() }, 120);
      armStillness();
    }
    }

    window.SocriaMotion = { init:init };
    /* pages that are not React-rendered can rely on the DOM being ready */
    if(document.readyState === "loading") addEventListener("DOMContentLoaded", function(){ if(!document.getElementById("socria-app")) init() });
    else if(!document.getElementById("socria-app")) init();
  })();


  /* ── the stage: fourteen steps of Core 3.1 → Logos → the Board ───── */
  function driveStage(){
    const sec = document.querySelector(".stage-sec");
    if(!sec) return;
    const app = sec.querySelector(".app");
    const items = [].slice.call(sec.querySelectorAll(".st[data-step]"));
    const ticks = [].slice.call(sec.querySelectorAll(".ticks i"));
    const steps = +sec.style.getPropertyValue("--steps") || 14;
    const reduce = window.SocriaIssue && window.SocriaIssue.reduce;
    let alive = 0, live = false, last = -1;
    function apply(step){
      if(step === last) return; last = step;
      items.forEach(el => el.classList.toggle("on", +el.dataset.step <= step));
      ticks.forEach(t => t.classList.toggle("on", +t.dataset.step <= step));
      app.classList.toggle("logos", step >= 4);
      app.classList.toggle("plot", step >= 9);
      sec.classList.toggle("deep", step >= 1);
    }
    function tick(){
      alive++;
      if(reduce) return;
      const r = sec.getBoundingClientRect(), vh = innerHeight;
      const total = sec.offsetHeight - vh;
      const p = total > 0 ? Math.max(0, Math.min(1, -r.top / total)) : 1;
      /* stage only once the driver has proven itself, and only while the stage is in view */
      if(!live && alive >= 2 && r.height > 0){ live = true; sec.classList.add("live"); }
      if(live) apply(Math.min(steps - 1, Math.floor(p * steps)));
    }
    setInterval(tick, 90);
    addEventListener("scroll", tick, {passive:true});
    tick();
  }

  /* ── the refusal: the answer, held at the line ────────────────────── */
  function driveRefusal(){
    const sec = document.querySelector(".refusal");
    if(!sec) return;
    const ans = sec.querySelector("[data-ans]"), head = sec.querySelector("[data-head]");
    const reduce = window.SocriaIssue && window.SocriaIssue.reduce;
    let alive = 0, live = false;
    const X0 = 40, X1 = 700;
    function tick(){
      alive++;
      if(reduce) return;
      const r = sec.getBoundingClientRect(), vh = innerHeight;
      if(!live && alive >= 2 && r.height > 0){ live = true; sec.classList.add("live"); }
      if(!live) return;
      if(document.documentElement.classList.contains("anim-off")){   // frozen: show it held at the line
        ans.setAttribute("d", "M" + X0 + ",75 L" + X1 + ",75"); head.removeAttribute("transform"); sec.classList.add("stopped"); return;
      }
      const total = sec.offsetHeight - vh;
      const p = total > 0 ? Math.max(0, Math.min(1, -r.top / total)) : 1;
      /* fast then held: reaches the line at 55% of the scroll and waits */
      const e = Math.min(1, p / 0.55);
      const x = X0 + (X1 - X0) * (1 - Math.pow(1 - e, 3));
      ans.setAttribute("d", "M" + X0 + ",75 L" + x.toFixed(1) + ",75");
      head.setAttribute("transform", "translate(" + (x - X1).toFixed(1) + ",0)");
      sec.classList.toggle("stopped", e >= 1);
    }
    setInterval(tick, 80);
    addEventListener("scroll", tick, {passive:true});
    tick();
  }

  /* ── read-time: counts only while you are actually here ───────────── */
  function driveReadTime(){
    const t = document.querySelector(".count .t"), said = document.querySelectorAll("[data-readtime]");
    let secs = 0, lastAct = Date.now();
    const bump = () => { lastAct = Date.now() };
    ["scroll","pointermove","keydown","touchstart"].forEach(ev => addEventListener(ev, bump, {passive:true}));
    const words = ["no time at all","one minute","two minutes","three minutes","four minutes","five minutes","six minutes","seven minutes","eight minutes","nine minutes","ten minutes","eleven minutes","twelve minutes"];
    function say(){
      const m = Math.floor(secs / 60);
      const w = words[m] || (m + " minutes");
      if(t){ t.textContent = m < 1 ? "" : w; t.classList.toggle("on", m >= 1); }
      said.forEach(s => { s.textContent = m < 1 ? "under a minute" : w; });
    }
    setInterval(() => {
      if(document.visibilityState !== "visible") return;
      if(Date.now() - lastAct > 45000) return;      // idle: not thinking, not counted
      secs++; if(secs % 5 === 0) say();
    }, 1000);
    say();
  }
  window.SocriaIssue.init();
  if (window.SocriaMotion) window.SocriaMotion.init();
  driveStage();
  driveRefusal();
  driveReadTime();
}
