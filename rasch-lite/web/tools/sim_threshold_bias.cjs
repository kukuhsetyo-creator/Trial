// Studi simulasi bias delta (lokasi threshold) dan tau (Andrich threshold): JMLE tanpa koreksi, JMLE (L-1)/L, dan CMLE.
// Jalankan dari folder rasch-lite:  node web/tools/sim_threshold_bias.cjs <rsm|pcm> <L> <N> <replikasi>
const fs=require('fs');const W=require('path').join(__dirname,'..')+'/';
const T=JSON.parse(fs.readFileSync(W+'build/text.json','utf8'));globalThis.RASCH_TEXT=T;
const E=require(W+'src/engine.js');E.setText(T);globalThis.RaschEngine=E;
const A=require(W+'src/advanced.js');A.setEngine(E);const C=require(W+'src/cmle.js');C.setEngine(E);
const [model,L,N,reps]=[process.argv[2],+process.argv[3],+process.argv[4],+process.argv[5]];
const b0=Array.from({length:L},(_,i)=>-1.5+3*i/(L-1));const bm=b0.reduce((s,v)=>s+v,0)/L;const b=b0.map(v=>v-bm);
const tauR=[-1.2,-0.2,1.4];
const tau=model==='rsm'?b.map(()=>tauR):b.map((_,i)=>{const s=0.6+0.8*i/(L-1);return [-s,0,s];}); // PCM: sebaran threshold berbeda per item, jumlah 0
const acc={};const add=(k,v)=>{(acc[k]=acc[k]||[]).push(v)};
const est={};const push=(k,i,v)=>{((est[k]=est[k]||{})[i]=est[k][i]||[]).push(v)};
for(let r=0;r<reps;r++){
  const rng=A.rng(1000+r);const g=()=>{let u=0;while(!u)u=rng();return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*rng());};
  const rows=[];for(let n=0;n<N;n++){const t=g();rows.push(['p'+n,...b.map((bi,i)=>{const psi=[0];let s=0;tau[i].forEach(tk=>{s+=t-bi-tk;psi.push(s)});const mx=Math.max(...psi),ex=psi.map(v=>Math.exp(v-mx)),z=ex.reduce((a,c)=>a+c,0);let u=rng()*z,k=0;while(u>ex[k]&&k<ex.length-1){u-=ex[k];k++}return k;})]);}
  const cols=['ID',...b.map((_,i)=>'I'+i)];
  let res;try{res=E.runAnalysis(E.prepareData({columns:cols,rows},{itemCols:cols.slice(1),idCol:'ID'}),model,{runDif:false});}catch(e){add('fail',1);continue;}
  if(res.coded.m.some(m=>m!==3)){add('collapsed',1);continue;}
  const jm=res.jmle,bf=jm.biasFactor;const cm=C.estimate(res,{se:false});
  for(let i=0;i<L;i++){
    push('b_unc',i,jm.b[i]);push('b_cor',i,jm.itemMeasure[i]);push('b_cml',i,cm.items[i].cmle);push('b_se',i,jm.itemMeasureSe[i]);
    for(let k=0;k<3;k++){
      push('t_unc',i*3+k,jm.tau[i][k]);push('t_cor',i*3+k,jm.threshold[i][k]);push('t_se',i*3+k,jm.thresholdSe[i][k]);
      push('t_cml',i*3+k,model==='rsm'?cm.tau[k].cmle:cm.items[i].cmle_thresholds[k]);
      push('d_cor',i*3+k,jm.thresholdLocation[i][k]);
    }
  }
}
const mean=a=>a.reduce((s,v)=>s+v,0)/a.length,sd=a=>{const m=mean(a);return Math.sqrt(a.reduce((s,v)=>s+(v-m)**2,0)/(a.length-1))};
const summary=(key,truth,n)=>{const bias=[],rmse=[],emp=[];for(let j=0;j<n;j++){const a=est[key][j];bias.push(mean(a)-truth(j));rmse.push(Math.sqrt(mean(a.map(v=>(v-truth(j))**2))));emp.push(sd(a));}
 // kemiringan: estimasi rata-rata ~ kebenaran (ekspansi skala)
 const xs=Array.from({length:n},(_,j)=>truth(j)),ys=Array.from({length:n},(_,j)=>mean(est[key][j]));const mx=mean(xs),my=mean(ys);let sxy=0,sxx=0;xs.forEach((x,j)=>{sxy+=(x-mx)*(ys[j]-my);sxx+=(x-mx)**2});
 return {key,mean_abs_bias:+mean(bias.map(Math.abs)).toFixed(3),rmse:+mean(rmse).toFixed(3),slope:+(sxy/sxx).toFixed(3),emp_sd:+mean(emp).toFixed(3)};};
const tb=j=>b[j],tt=j=>tau[Math.floor(j/3)][j%3],td=j=>b[Math.floor(j/3)]+tau[Math.floor(j/3)][j%3];
const out=[summary('b_unc',tb,L),summary('b_cor',tb,L),summary('b_cml',tb,L),summary('t_unc',tt,3*L),summary('t_cor',tt,3*L),summary('t_cml',tt,3*L),summary('d_cor',td,3*L)];
const seB=mean(Array.from({length:L},(_,j)=>mean(est.b_se[j]))),sdB=mean(Array.from({length:L},(_,j)=>sd(est.b_cor[j])));
const seT=mean(Array.from({length:3*L},(_,j)=>mean(est.t_se[j]))),sdT=mean(Array.from({length:3*L},(_,j)=>sd(est.t_cor[j])));
const sumTau=mean(Array.from({length:L},(_,i)=>Math.abs(mean(est.t_unc[i*3])+mean(est.t_unc[i*3+1])+mean(est.t_unc[i*3+2]))));
console.log(JSON.stringify({model,L,N,reps:est.b_unc[0].length,fail:acc.fail?.length||0,collapsed:acc.collapsed?.length||0,out,se_b_reported:+seB.toFixed(3),sd_b_empirical:+sdB.toFixed(3),se_tau_reported:+seT.toFixed(3),sd_tau_empirical:+sdT.toFixed(3),sum_tau_per_item:+sumTau.toExponential(1)}));
