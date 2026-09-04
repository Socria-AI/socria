// One scene per discipline, and every one of them must draw.
//
// Written the way the extractor is told to write them — read the prompt, act
// as the model, emit the JSON — rather than reverse-engineered from the
// sanitizer. That is the point: anything failing here is a gap between what
// the prompt INVITES and what the code ACCEPTS, and that gap is invisible in
// production because a rejected scene is simply an empty panel.
//
// It has already earned its place. A heating curve whose plateau below zero
// is written `min(0, -20 + x)` evaluated to NaN, because a minus directly
// after a comma was being read as subtraction rather than as the sign of the
// second argument. Every negative literal in an argument list was affected;
// no unit test had one.

import { sanitizeMap } from './.tmp/logos.mjs';
import { buildFrame, resolveView, compileScene, defaults } from './.tmp/logos-viz.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, x)));

const CASES = [
["chemistry/titration","math",{kind:"diagram",axes:{x:"mL of base",y:"pH"},view:{xMin:0,xMax:50,yMin:0,yMax:14},params:[{id:"v",min:0,max:50,step:1,value:12}],parts:[{o:"curve",expr:"7 + 3.2*tanh((x - 25)/3)",tone:"accent",label:"pH"},{o:"hrule",at:7,dashed:true,label:"neutral"},{o:"point",x:"v",y:"7 + 3.2*tanh((v - 25)/3)",tone:"tension"}],title:"Titration"}],
["chemistry/arrhenius","math",{kind:"diagram",axes:{x:"1/T",y:"ln k"},view:{xMin:0.002,xMax:0.005,yMin:-8,yMax:2},params:[{id:"a",min:1000,max:6000,step:250,value:3000}],parts:[{o:"curve",expr:"12 - a*x",tone:"accent",label:"ln k"}],title:"Arrhenius plot"}],
["chemistry/gas-law","math",{kind:"diagram",axes:{x:"Volume",y:"Pressure"},view:{xMin:0.5,xMax:5,yMin:0,yMax:12},params:[{id:"n",min:1,max:4,step:0.5,value:2}],parts:[{o:"curve",expr:"n*5/x",tone:"accent",label:"PV = nRT"}],title:"Boyle's law"}],
["physics/projectile","math",{kind:"diagram",axes:{x:"distance (m)",y:"height (m)"},view:{xMin:0,xMax:110,yMin:0,yMax:40},params:[{id:"a",min:15,max:75,step:5,value:45}],parts:[{o:"curve",expr:"x*tan(a*pi/180) - 9.81*x^2/(2*(30*cos(a*pi/180))^2)",tone:"accent",label:"path"},{o:"hrule",at:0,dashed:true}],title:"Projectile"}],
["physics/free-body","math",{kind:"diagram",axes:{x:"x",y:"y"},view:{xMin:-6,xMax:6,yMin:-6,yMax:6},params:[{id:"a",min:0,max:60,step:5,value:30}],parts:[{o:"point",x:0,y:0,tone:"primary",label:"block"},{o:"vector",x1:0,y1:0,x2:0,y2:-4,tone:"tension",label:"W"},{o:"vector",x1:0,y1:0,x2:"4*sin(a*pi/180)",y2:"4*cos(a*pi/180)",tone:"accent",label:"N"},{o:"line",x:0,y:0,slope:"tan(a*pi/180)",dashed:true}],title:"Block on an incline"}],
["physics/carnot","math",{kind:"diagram",axes:{x:"Volume",y:"Pressure"},view:{xMin:0.5,xMax:4.5,yMin:0,yMax:14},parts:[{o:"path",x:"1 + 2*t",y:"12/(1 + 2*t)",from:0,to:1,tone:"tension",label:"hot isotherm"},{o:"path",x:"3 - 1.6*t",y:"5/(3 - 1.6*t)",from:0,to:1,tone:"accent",label:"cold isotherm"}],title:"Carnot cycle"}],
["physics/damped","math",{kind:"diagram",axes:{x:"time (s)",y:"displacement"},view:{xMin:0,xMax:20,yMin:-5,yMax:5},params:[{id:"b",min:0,max:0.5,step:0.05,value:0.15}],parts:[{o:"curve",expr:"4*exp(-b*t)*cos(2*t)",tone:"accent",label:"x(t)"},{o:"curve",expr:"4*exp(-b*t)",tone:"ghost",dashed:true,label:"envelope"}],title:"Damped oscillation"}],
["physics/hysteresis","math",{kind:"diagram",axes:{x:"H",y:"B"},view:{xMin:-3,xMax:3,yMin:-3,yMax:3},params:[{id:"a",min:0.3,max:2,step:0.1,value:1.2}],parts:[{o:"path",x:"2*cos(t)",y:"a*sin(t) + 0.8*cos(t)",from:0,to:6.2832,closed:true,tone:"accent",label:"loop"}],title:"Hysteresis"}],
["biology/logistic","learning",{kind:"diagram",axes:{x:"time (days)",y:"population"},view:{xMin:0,xMax:20,yMin:0,yMax:120},params:[{id:"k",min:20,max:100,step:5,value:80}],parts:[{o:"curve",expr:"k/(1 + exp(-0.5*(t-10)))",tone:"accent",label:"N"},{o:"hrule",at:"k",dashed:true,label:"carrying capacity"}],title:"Logistic growth"}],
["biology/michaelis","learning",{kind:"diagram",axes:{x:"[S] (mM)",y:"rate"},view:{xMin:0,xMax:20,yMin:0,yMax:12},params:[{id:"m",min:0.5,max:10,step:0.5,value:3}],parts:[{o:"curve",expr:"10*s/(m + s)",tone:"accent",label:"v"},{o:"hrule",at:10,dashed:true,label:"Vmax"},{o:"vrule",at:"m",dashed:true,label:"Km"}],title:"Michaelis–Menten"}],
["biology/predator-prey","learning",{kind:"diagram",axes:{x:"time",y:"population"},view:{xMin:0,xMax:20,yMin:0,yMax:12},params:[{id:"b",min:0.5,max:2,step:0.1,value:1.1}],parts:[{o:"curve",expr:"5 + 3*sin(b*t)",tone:"accent",label:"prey"},{o:"curve",expr:"5 + 3*sin(b*t - 1.6)",tone:"tension",label:"predator"}],title:"Predator–prey"}],
["biology/dose-response","learning",{kind:"diagram",axes:{x:"log dose",y:"% response"},view:{xMin:-2,xMax:3,yMin:0,yMax:100},params:[{id:"c",min:-1,max:2,step:0.1,value:0.5}],parts:[{o:"curve",expr:"100/(1 + 10^(c - x))",tone:"accent",label:"response"},{o:"vrule",at:"c",dashed:true,label:"EC50"},{o:"hrule",at:50,dashed:true}],title:"Dose–response"}],
["medicine/plasma","learning",{kind:"diagram",axes:{x:"hours",y:"concentration"},view:{xMin:0,xMax:24,yMin:0,yMax:12},params:[{id:"k",min:0.05,max:0.5,step:0.05,value:0.2}],parts:[{o:"curve",expr:"10*(exp(-k*t) - exp(-1.2*t))",tone:"accent",label:"plasma"},{o:"hrule",at:2,dashed:true,label:"therapeutic min"}],title:"Drug concentration"}],
["finance/option","math",{kind:"diagram",axes:{x:"price at expiry",y:"payoff"},view:{xMin:0,xMax:20,yMin:-3,yMax:12},params:[{id:"k",min:5,max:15,step:1,value:10}],parts:[{o:"curve",expr:"max(0, x - k) - 2",tone:"accent",label:"long call"},{o:"hrule",at:0,dashed:true},{o:"vrule",at:"k",dashed:true,label:"strike"}],title:"Call payoff"}],
["finance/compound","math",{kind:"diagram",axes:{x:"years",y:"value"},view:{xMin:0,xMax:30,yMin:0,yMax:5000},params:[{id:"r",min:0.01,max:0.12,step:0.01,value:0.07}],parts:[{o:"curve",expr:"1000*(1 + r)^t",tone:"accent",label:"compounded"},{o:"curve",expr:"1000*(1 + r*t)",tone:"ghost",dashed:true,label:"simple"}],title:"Compound vs simple"}],
["business/breakeven","analysing",{kind:"diagram",axes:{x:"units",y:"£"},view:{xMin:0,xMax:100,yMin:0,yMax:3000},params:[{id:"p",min:10,max:40,step:1,value:25}],parts:[{o:"curve",expr:"p*x",tone:"accent",label:"revenue"},{o:"curve",expr:"800 + 8*x",tone:"tension",label:"cost"}],title:"Break-even"}],
["business/retention","analysing",{kind:"diagram",axes:{x:"month",y:"% retained"},view:{xMin:0,xMax:12,yMin:0,yMax:100},params:[{id:"c",min:0.02,max:0.3,step:0.02,value:0.1}],parts:[{o:"curve",expr:"100*(1 - c)^t",tone:"accent",label:"cohort"},{o:"hrule",at:40,dashed:true,label:"target"}],title:"Cohort retention"}],
["engineering/stress-strain","learning",{kind:"diagram",axes:{x:"strain",y:"stress (MPa)"},view:{xMin:0,xMax:0.2,yMin:0,yMax:400},parts:[{o:"curve",expr:"min(2000*x, 250 + 500*x)",tone:"accent",label:"steel"},{o:"vrule",at:0.125,dashed:true,label:"yield"}],title:"Stress–strain"}],
["engineering/heating","learning",{kind:"diagram",axes:{x:"heat added (kJ)",y:"°C"},view:{xMin:0,xMax:100,yMin:-30,yMax:130},parts:[{o:"curve",expr:"min(0, -20 + x) + max(0, min(100, (x-30)*2.5)) + max(0, (x-80)*1.5)",tone:"accent",label:"T"},{o:"hrule",at:0,dashed:true,label:"melting"},{o:"hrule",at:100,dashed:true,label:"boiling"}],title:"Heating curve"}],
["statistics/normal","math",{kind:"diagram",axes:{x:"x",y:"density"},view:{xMin:-5,xMax:5,yMin:0,yMax:0.5},params:[{id:"s",min:0.5,max:3,step:0.1,value:1}],parts:[{o:"curve",expr:"exp(-x^2/(2*s^2))/(s*sqrt(2*pi))",tone:"accent",label:"N(0, s)"},{o:"vrule",at:0,dashed:true}],title:"Normal distribution"}],
["statistics/ci","math",{kind:"diagram",axes:{x:"sample size",y:"margin"},view:{xMin:1,xMax:200,yMin:0,yMax:2},parts:[{o:"curve",expr:"1.96/sqrt(n)",tone:"accent",label:"margin of error"},{o:"hrule",at:0.1,dashed:true,label:"±0.1"}],title:"Confidence interval"}],
["earth/cooling","learning",{kind:"diagram",axes:{x:"minutes",y:"°C"},view:{xMin:0,xMax:60,yMin:0,yMax:100},params:[{id:"k",min:0.02,max:0.2,step:0.01,value:0.06}],parts:[{o:"curve",expr:"20 + 60*exp(-k*t)",tone:"accent",label:"T"},{o:"hrule",at:20,dashed:true,label:"room"}],title:"Newton cooling"}],
["psychology/forgetting","learning",{kind:"diagram",axes:{x:"days",y:"% retained"},view:{xMin:0,xMax:30,yMin:0,yMax:100},params:[{id:"s",min:1,max:20,step:1,value:5}],parts:[{o:"curve",expr:"100*exp(-t/s)",tone:"accent",label:"retention"}],title:"Forgetting curve"}],
["cs/complexity","learning",{kind:"diagram",axes:{x:"n",y:"operations"},view:{xMin:1,xMax:50,yMin:0,yMax:2500},parts:[{o:"curve",expr:"n^2",tone:"tension",label:"O(n²)"},{o:"curve",expr:"n*log2(n)",tone:"accent",label:"O(n log n)"},{o:"curve",expr:"n",tone:"ghost",label:"O(n)"}],title:"Growth rates"}],
["music/beats","learning",{kind:"diagram",axes:{x:"time (s)",y:"amplitude"},view:{xMin:0,xMax:4,yMin:-2.5,yMax:2.5},params:[{id:"d",min:0.5,max:5,step:0.5,value:2}],parts:[{o:"curve",expr:"cos(2*pi*10*t) + cos(2*pi*(10+d)*t)",tone:"accent",label:"sum"},{o:"curve",expr:"2*cos(pi*d*t)",tone:"ghost",dashed:true,label:"envelope"}],title:"Beat frequency"}],
["geography/population","analysing",{kind:"diagram",axes:{x:"age band",y:"millions"},view:{xMin:0,xMax:10,yMin:0,yMax:8},parts:[{o:"rects",bars:[{x0:0,x1:1,y:7},{x0:1,x1:2,y:6.5},{x0:2,x1:3,y:6},{x0:3,x1:4,y:5},{x0:4,x1:5,y:4},{x0:5,x1:6,y:3},{x0:6,x1:7,y:2},{x0:7,x1:8,y:1}],tone:"accent"}],title:"Age structure"}],
["econ/supply-demand","analysing",{kind:"supply-demand",demand:{intercept:120,slope:-2},supply:{intercept:30,slope:1},tax:9,surplus:true,axes:{x:"Quantity",y:"Price"}}],
["econ/ppc","analysing",{kind:"ppc",frontier:{xMax:100,yMax:80,bowed:true,grows:"x"},axes:{x:"Guns",y:"Butter"}}],
];

console.log('=== every discipline draws ===');
for (const [name, context, viz] of CASES) {
  const m = sanitizeMap({ context, nodes: [{ id: 'n1', type: 'concept', label: name }], edges: [], viz });
  if (!m.viz) { ok(`${name}: the scene survives`, false, 'REJECTED by sanitizeMap'); continue; }
  ok(`${name}: the scene survives`, true);

  const fn = compileScene(m.viz);
  const view = resolveView(m.viz, fn);
  ok(`${name}: the window is usable`,
    [view.xMin, view.xMax, view.yMin, view.yMax].every(Number.isFinite) && view.xMax > view.xMin && view.yMax > view.yMin,
    JSON.stringify(view));

  const f = buildFrame(m.viz, fn, defaults(m.viz), view, false);
  const drawn = f.objects.filter((o) => o.o !== 'label');
  ok(`${name}: it draws something`, drawn.length >= 1, `${f.objects.length} objects`);
  ok(`${name}: nothing non-finite reaches the frame`,
    f.objects.every((o) => Object.values(o).every((v) => typeof v !== 'number' || Number.isFinite(v))));
  ok(`${name}: no curve is entirely NaN`,
    f.objects.every((o) => o.o !== 'curve' || o.pts.some((q) => Number.isFinite(q.x) && Number.isFinite(q.y))));
  ok(`${name}: it says something under the picture`, typeof f.caption === 'string' && f.caption.length > 0);
  ok(`${name}: and not that it could not be drawn`, !/could not be drawn/.test(f.caption), f.caption);

  // Every declared slider must actually move the picture, or it is a control
  // that does nothing — the thing that makes a diagram feel broken.
  for (const p of m.viz.params ?? []) {
    const lo = buildFrame(m.viz, fn, { ...defaults(m.viz), [p.id]: p.min }, view, false);
    const hi = buildFrame(m.viz, fn, { ...defaults(m.viz), [p.id]: p.max }, view, false);
    ok(`${name}: the ${p.id} slider changes something`,
      JSON.stringify(lo.objects) !== JSON.stringify(hi.objects) ||
      JSON.stringify(lo.readouts) !== JSON.stringify(hi.readouts));
  }
}

console.log('=== the guard withholds numbers, never the picture ===');
for (const [name, context, viz] of CASES.slice(0, 8)) {
  const m = sanitizeMap({ context, nodes: [{ id: 'n1', type: 'concept', label: name }], edges: [], viz });
  if (!m.viz) continue;
  const fn = compileScene(m.viz);
  const view = resolveView(m.viz, fn);
  const g = buildFrame(m.viz, fn, defaults(m.viz), view, true);
  ok(`${name}: still drawn under the guard`, g.objects.length >= 1);
  ok(`${name}: and every value is withheld`, g.readouts.every((r) => r.value === null), JSON.stringify(g.readouts.map((r) => r.value)));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
