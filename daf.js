/* DAF — kode slot Dragon Animal Fortune (mesin spin, animasi, jackpot, suara, bet, panel admin).
   Dimuat dari index.html setelah daf-assets.js dan sebelum skrip akun/lobi. Jangan ubah urutan <script> di index.html. */
const ROWS=5,COLS=6;
const animals=[
  {e:"🐯",n:"Harimau",v:8,w:22},{e:"🦁",n:"Singa",v:10,w:19},{e:"🐼",n:"Panda",v:12,w:16},
  {e:"🐘",n:"Gajah",v:14,w:13},{e:"🦊",n:"Rubah",v:16,w:11},{e:"🐺",n:"Serigala",v:18,w:8},
  {e:"🦚",n:"Merak",v:20,w:6},{e:"🐉",n:"Naga",v:30,w:5}
];
const SCATTER="🎁";
// Hadiah jackpot = kelipatan BET. Animasi tiap tier BEDA (mini/minor/major/grand) dan TIDAK memakai full gambar
const JP_MULT={MINI:40,MINOR:100,MAJOR:250,GRAND:1000};
function jpAmount(t){return bet*JP_MULT[t]}
// Peluang jackpot PER SPIN, tiap tier diundi sendiri (tier tertinggi yang kena dipakai)
const JP_CHANCE={MINI:0.0008,MINOR:0.0002,MAJOR:0.00006,GRAND:0.00001}; // dibuat lebih sulit (±5x lebih jarang), hanya untuk akun yang diizinkan admin
// GACOR: SEMUA akun bisa dapat full gambar & jackpot murni hoki (peluang dasar di atas).
// Akun yang didaftarkan admin (izin 🖼️ / 🎰 ON) = "gacor": peluangnya dikali angka di bawah supaya kemenangan beruntun hampir pasti. Ubah angkanya di sini kalau mau lebih/kurang gacor.
const GACOR_FULL=40,GACOR_JP=40,GACOR_CAP=0.5;   // pengali peluang; batas atas peluang per spin 50%
// IZIN AKUN (diatur admin): send = boleh kirim chip, jp = boleh dapat jackpot, full = boleh dapat full gambar. Ubah true/false di sini kalau mau default berbeda
const DEFAULT_PERM={send:false,jp:false,full:false};
const SCATTER_COUNT_W=[[3,70],[4,22],[5,8]];  // jumlah scatter: 3 paling sering, 5 paling jarang
function pickAnimal(){
  let r=Math.random()*animals.reduce((a,x)=>a+x.w,0);
  for(const x of animals){r-=x.w;if(r<0)return x}
  return animals[0];
}
function scatterCount(){
  let r=Math.random()*100;
  for(const [n,w] of SCATTER_COUNT_W){r-=w;if(r<0)return n}
  return 3;
}
function rollJackpotSpin(boost=1){
  let hit=null;
  for(const t of ["MINI","MINOR","MAJOR","GRAND"])if(Math.random()<Math.min(GACOR_CAP,JP_CHANCE[t]*boost))hit=t;
  return hit;
}
// FULL GAMBAR = hadiah TERPISAH dari jackpot. Tiap gambar punya tier & jumlah (x BET) sendiri.
const FULL_PRIZE=[
  {tier:"PERUNGGU",mult:60, lv:1,color:"#ffb36b"}, // 🐯 Harimau
  {tier:"PERUNGGU",mult:80, lv:1,color:"#ffb36b"}, // 🦁 Singa
  {tier:"PERAK",    mult:110,lv:2,color:"#e8f0ff"}, // 🐼 Panda
  {tier:"PERAK",    mult:150,lv:2,color:"#e8f0ff"}, // 🐘 Gajah
  {tier:"EMAS",     mult:200,lv:3,color:"#ffe36a"}, // 🦊 Rubah
  {tier:"EMAS",     mult:280,lv:3,color:"#ffe36a"}, // 🐺 Serigala
  {tier:"PLATINUM", mult:380,lv:4,color:"#b9fbff"}, // 🦚 Merak
  {tier:"NAGA",     mult:500,lv:5,color:"#ff6a3d"}  // 🐉 Naga
];
// aturan: hadiah full gambar terkecil (x60) SELALU di atas SUPER WIN terbesar (x40; di scatter mode keduanya x2)
// Spin tambahan dari scatter: masuk mode scatter vs scatter di DALAM scatter (retrigger)
const SCATTER_SPINS_ENTER={3:6,4:10,5:15};
const SCATTER_SPINS_RETRIGGER={3:3,4:5,5:8};
// Peluang tiap spin diundi sendiri (tidak tergantung jumlah spin). Kosong jauh lebih sering.
const MODES={
  // normal : SUPER 0,2% | MEGA 1% | BIG 6% | scatter 1,2%  -> ±92% kosong
  normal :{rows3:0.002,rows2:0.010,rows1:0.052,scatter:0.012,full:0.0007,diag:0.08,mult:1},
  // scatter: SUPER 0,6% | MEGA 3% | BIG 17% | scatter di dalam scatter (tambah spin) 3%
  scatter:{rows3:0.006,rows2:0.030,rows1:0.150,scatter:0.030,full:0.0015,diag:0.18,mult:2}
};
// Hadiah juga acak dalam rentang (bukan angka tetap)
const PRIZE_RANGE={3:[20,40],2:[8,16],1:[2,6]};
// DIAGONAL: min 3 gambar sama berurutan menyilang (↘ atau ↗), tidak perlu satu baris penuh. Hadiah (x BET) SELALU lebih kecil dari 1 baris (BIG WIN min x2)
const DIAG_LEN_W=[[3,70],[4,22],[5,8]];
const DIAG_PRIZE={3:[0.5,1.0],4:[0.9,1.5],5:[1.3,1.9]};
const HORIZ_PRIZE={3:[0.4,0.8],4:[0.7,1.2],5:[1.0,1.6]};   // horizontal sebagian (bukan 6 gambar penuh)
function rnd(a,b){return a+Math.random()*(b-a)}
const SPEEDS=[{n:"NORMAL",f:1},{n:"TURBO",f:.5},{n:"SUPER",f:.22}];
let SPD=SPEEDS[0];
let scatterMode=false,scatterTotal=0;
let board=[],busy=false,auto=false,balance=500000000,bet=17600000,freeSpins=0,voiceOn=true;
let spinCount=0,acct=null,modalOpen=false,stateRev=0;
const REAL_STEP=1000000,FREE_STEP=10000,FREE_CHIPS=500000,BET_MAX=2000000000;
let BET_STEP=REAL_STEP,freeMode=false,stash=null;
let audioUnlocked=false;
/* VOICE_SRCS (suara) dipindah ke daf-assets.js */
const voices=VOICE_SRCS.map(src=>{const a=new Audio(src);a.preload="auto";a.volume=1;return a});
// suara: BIG WIN = bigwin.mp3, MEGA WIN = megawin.mp3, SUPER WIN = superwin.mp3
function voiceForLevel(level){return voices[Math.max(0,Math.min(2,level-1))]}
const voiceBufs=[null,null,null];
let voiceNode=null;
function stopVoices(){
  voices.forEach(v=>{try{v.pause();v.currentTime=0}catch(e){}});
  if(voiceNode){try{voiceNode.onended=null;voiceNode.stop()}catch(e){}voiceNode=null}
}
let decodeP=null;
function decodeVoices(){
  if(decodeP)return decodeP;
  const a=ac();if(!a)return Promise.resolve();
  decodeP=Promise.all(VOICE_SRCS.map(async(src,i)=>{
    try{
      const bin=atob(src.split(",")[1]),u=new Uint8Array(bin.length);
      for(let k=0;k<bin.length;k++)u[k]=bin.charCodeAt(k);
      voiceBufs[i]=await a.decodeAudioData(u.buffer);
    }catch(e){voiceBufs[i]=null}
  }));
  return decodeP;
}

function sleep(ms){return new Promise(r=>setTimeout(r,ms*SPD.f));}
function sleepRaw(ms){return new Promise(r=>setTimeout(r,ms));}
let reelSkip=null;
function reelWait(ms){return new Promise(r=>{const t=setTimeout(done,ms*SPD.f);function done(){clearTimeout(t);reelSkip=null;r()}reelSkip=done})}
function syncSpinBtn(){
  const b=document.getElementById("spin");if(!b)return;
  const st=!!(busy||auto);
  b.textContent=st?"STOP":"SPIN";b.classList.toggle("isStop",st);
}
function pick(a){return a[Math.floor(Math.random()*a.length)];}
function money(n){return Math.max(0,Math.floor(n)).toLocaleString("id-ID");}

let unlockP=null;
function unlockAudio(){
  ac();decodeVoices();
  if(audioUnlocked)return unlockP;
  audioUnlocked=true;
  // buka kunci ketiga suara dari klik user (kebijakan autoplay browser)
  unlockP=Promise.all(voices.map(v=>new Promise(res=>{
    try{
      v.muted=true;
      const done=()=>{v.pause();v.currentTime=0;v.muted=false;res()};
      const p=v.play();
      if(p&&p.then)p.then(done).catch(()=>{v.muted=false;audioUnlocked=false;res()});else done();
    }catch(e){res()}
  })));
  return unlockP;
}
function duck(on){
  try{if(master&&AC)master.gain.setTargetAtTime(on?.15:.55,AC.currentTime,.05)}catch(e){}
}
async function speakWin(level=1){
  if(!voiceOn)return;
  const idx=Math.max(0,Math.min(2,level-1));
  const label=document.getElementById("voiceState");
  const done=()=>{voicePlaying=false;duck(false);label.textContent="VOICE: READY"};
  // jalur 1: WebAudio (sama dengan efek koin/alarm)
  try{
    const a=ac();
    if(a){
      await decodeVoices();
      await a.resume();
      if(voiceBufs[idx]&&a.state==="running"){
        stopVoices();
        const src=a.createBufferSource(),g=a.createGain();
        src.buffer=voiceBufs[idx];g.gain.value=1;
        src.connect(g);g.connect(a.destination);   // langsung ke speaker, tidak lewat master
        voiceNode=src;
        duck(true);voicePlaying=true;label.textContent="VOICE: PLAYING 🔊";
        src.onended=done;setTimeout(done,Math.ceil((voiceBufs[idx].duration||3.4)*1000)+250);
        src.start();
        return;
      }
    }
  }catch(e){}
  // jalur 2 (cadangan): <audio>
  const v=voiceForLevel(level);
  try{
    if(unlockP)await unlockP;
    stopVoices();v.muted=false;v.volume=1;v.currentTime=0;
    duck(true);voicePlaying=true;label.textContent="VOICE: PLAYING";
    v.onended=done;setTimeout(done,3600);
    await v.play();
  }catch(e){
    voicePlaying=false;duck(false);label.textContent="VOICE: TAP LAYAR / KLIK SPIN DULU";
  }
}

/* ===== SOUND ENGINE (WebAudio, tanpa file luar) ===== */
let AC=null,master=null,bgmTimer=null,bgmStep=0,rainTimer=null;
let sndEnd=0,noTrack=false,voicePlaying=false;   // pelacak: kapan semua efek suara hadiah selesai (BGM tidak dihitung)
async function waitAudioIdle(maxMs=12000){        // tunggu efek suara + voice hadiah benar-benar habis (tidak ikut dipercepat)
  const t0=performance.now();
  while(performance.now()-t0<maxMs){
    const rem=(AC&&voiceOn)?(sndEnd-AC.currentTime):0;
    if(rem<=.05&&!voicePlaying)break;
    await sleepRaw(80);
  }
}
function ac(){
  if(!AC){
    try{AC=new (window.AudioContext||window.webkitAudioContext)();master=AC.createGain();master.gain.value=.55;master.connect(AC.destination);}catch(e){}
  }
  if(AC&&AC.state==="suspended")AC.resume();
  return AC;
}
function tone(f,t0,d,type="sine",vol=.2,slide=0){
  const a=ac();if(!a||!voiceOn)return;
  const t=a.currentTime+t0,o=a.createOscillator(),g=a.createGain();
  if(!noTrack)sndEnd=Math.max(sndEnd,t+d+.05);
  o.type=type;o.frequency.setValueAtTime(f,t);
  if(slide)o.frequency.exponentialRampToValueAtTime(Math.max(30,f+slide),t+d);
  g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(vol,t+.012);g.gain.exponentialRampToValueAtTime(.0001,t+d);
  o.connect(g);g.connect(master);o.start(t);o.stop(t+d+.05);
}
function hat(t0,vol=.05){
  const a=ac();if(!a||!voiceOn)return;
  const len=a.sampleRate*.04,buf=a.createBuffer(1,len,a.sampleRate),d=buf.getChannelData(0);
  for(let i=0;i<len;i++)d[i]=(Math.random()*2-1)*(1-i/len);
  const src=a.createBufferSource(),g=a.createGain(),hp=a.createBiquadFilter();
  hp.type="highpass";hp.frequency.value=6000;g.gain.value=vol;
  if(!noTrack)sndEnd=Math.max(sndEnd,a.currentTime+t0+.05);
  src.buffer=buf;src.connect(hp);hp.connect(g);g.connect(master);src.start(a.currentTime+t0);
}
// satu koin: dua nada logam tidak harmonis + klik
function coinPing(t0,vol=.07){
  const f=1800+Math.random()*2400;
  tone(f,t0,.14,"sine",vol);
  tone(f*2.76,t0,.07,"sine",vol*.55);
  if(Math.random()<.5)hat(t0,.035);
}
// hamburan koin: rapat di awal lalu menjarang, seperti koin tumpah
function coinShower(dur=2,count=40,vol=.07){
  for(let i=0;i<count;i++){
    const t=Math.pow(Math.random(),1.5)*dur;
    coinPing(t,vol*(0.6+Math.random()*.7));
  }
}
// jam weker: palu memukul dua bel bergantian, 3 rentetan
function alarmClock(rings=3,off=0,v=1){
  for(let r=0;r<rings;r++){
    const base=off+r*.62;
    for(let i=0;i<9;i++){
      const t=base+i*.052;
      tone(i%2?2480:2780,t,.045,"square",.07*v);
      tone(i%2?3720:4170,t,.03,"sine",.04*v);
    }
  }
}

/* ===== AUDIO JACKPOT: BEDA TIAP TIER, ±5 DETIK ===== */
const NT=n=>261.63*Math.pow(2,n/12);
function noiseBurst(t0,d,vol,ftype="highpass",freq=4000){
  const a=ac();if(!a||!voiceOn)return;
  const len=Math.floor(a.sampleRate*d),buf=a.createBuffer(1,len,a.sampleRate),data=buf.getChannelData(0);
  for(let i=0;i<len;i++)data[i]=(Math.random()*2-1)*Math.pow(1-i/len,1.5);
  const src=a.createBufferSource(),g=a.createGain(),f=a.createBiquadFilter();
  f.type=ftype;f.frequency.value=freq;g.gain.value=vol;
  if(!noTrack)sndEnd=Math.max(sndEnd,a.currentTime+t0+d+.05);
  src.buffer=buf;src.connect(f);f.connect(g);g.connect(master);src.start(a.currentTime+t0);
}
function kick(t){tone(150,t,.26,"sine",.45,-112);noiseBurst(t,.03,.15,"lowpass",900)}
function snare(t,v=.2){noiseBurst(t,.16,v,"bandpass",1900);tone(210,t,.1,"triangle",v*.7)}
function crash(t,v=.2,d=1.4){noiseBurst(t,d,v,"highpass",4500)}
function chordAt(notes,t,d,type="sawtooth",vol=.07,fat=false){
  notes.forEach(n=>{
    tone(NT(n),t,d,type,vol);
    if(fat){tone(NT(n)*1.007,t,d,type,vol*.8);tone(NT(n)*.993,t,d,type,vol*.8)}
  });
}
function seqNotes(notes,t0,step,type,vol,dur){notes.forEach((n,i)=>{if(n!==null)tone(NT(n),t0+i*step,dur,type,vol)})}
const JPSND={
  // MINI: fanfare arpeggio ceria + koin (5 dtk)
  MINI(){
    const arp=[0,4,7,12,16,19,24,19,16,12,7,4];
    for(let i=0;i<40;i++){
      const n=arp[i%arp.length];
      tone(NT(n),i*.125,.16,"triangle",.11);
      tone(NT(n+12),i*.125,.1,"square",.035);
      hat(i*.125,.05);
    }
    for(let k=0;k<10;k++)kick(k*.5);
    chordAt([0,4,7,12,16],4.35,.9,"triangle",.1);
    crash(4.35,.14,.9);
    coinShower(5,110,.075);
  },
  // MINOR: brass sawtooth + drum beat, lebih ngebut (5 dtk)
  MINOR(){
    const prog=[[0,4,7],[5,9,12],[7,11,14],[0,4,7],[7,11,14]];
    prog.forEach((c,bar)=>{
      for(let k=0;k<4;k++)chordAt(c,bar+k*.25,.2,"sawtooth",.06);
      seqNotes([12,16,19,24,19,16,19,24],bar,.125,"square",.04,.11);
    });
    for(let k=0;k<20;k++){k%2?snare(k*.25,.17):kick(k*.25)}
    for(let k=0;k<40;k++)hat(k*.125,.05);
    crash(0,.2);crash(2.5,.15);
    chordAt([0,4,7,12,16],4.25,.9,"sawtooth",.08,true);crash(4.25,.22,1);
    coinShower(5,150,.075);
  },
  // MAJOR: sirine + bass berdenyut + lonceng + riser (5 dtk)
  MAJOR(){
    for(let i=0;i<14;i++)tone(i%2?980:700,i*.22,.21,"sawtooth",.05);
    tone(180,0,2.6,"sawtooth",.05,2600);
    for(let i=0;i<40;i++)tone([55,55,82.4,55][i%4],i*.125,.11,"sawtooth",.08);
    for(let k=0;k<20;k++){kick(k*.25);if(k%2)snare(k*.25,.14)}
    for(let k=0;k<10;k++)tone(1568,k*.5,.4,"sine",.1);
    crash(0,.18);
    [0,.28,.56].forEach(t=>{chordAt([0,4,7,12,16],3.1+t,.3,"sawtooth",.08,true);kick(3.1+t);snare(3.1+t,.2)});
    chordAt([0,4,7,12,16,19],3.95,1.1,"sawtooth",.08,true);crash(3.95,.22,1.2);
    seqNotes([24,28,31,36,31,28,31,36],3.1,.12,"square",.035,.1);
    coinShower(5,200,.08);
  },
  // GRAND: build-up epik -> DROP -> kemenangan -> jam weker -> crash final (5 dtk)
  GRAND(){
    tone(150,0,1.5,"sawtooth",.07,3800);
    noiseBurst(0,1.5,.12,"bandpass",3000);
    for(let i=0;i<18;i++)snare(i*.083,.06+i*.012);
    // DROP di 1.5 dtk
    crash(1.5,.3,1.8);kick(1.5);
    chordAt([0,7,12,16,19,24],1.5,1.1,"sawtooth",.075,true);
    [2,2.5,3].forEach(t=>{kick(t);chordAt([0,7,12,16,19],t,.45,"sawtooth",.07,true)});
    for(let k=0;k<14;k++)kick(1.5+k*.25);
    for(let k=0;k<14;k++)if(k%2)snare(1.5+k*.25,.17);
    seqNotes([12,16,19,24,19,24,28,31,28,24,28,31,36,31,28,24],1.5,.16,"square",.045,.13);
    seqNotes([0,0,7,0,5,5,7,7],1.5,.2,"sawtooth",.08,.17);
    alarmClock(2,3.0);
    for(let k=0;k<8;k++)tone(2093,3+k*.25,.3,"sine",.09);
    crash(4.3,.3,1.4);kick(4.3);
    chordAt([0,4,7,12,16,19,24],4.3,1.2,"sawtooth",.085,true);
    coinShower(5,220,.085);
    coinShower(1.2,40,.09);
  }
};

/* ===== JAM WEKER SCATTER: nyaring, berlapis, ±3,7 detik, langsung ke speaker lewat compressor ===== */
function scatterAlarm(){
  const a=ac();if(!a||!voiceOn)return;
  const comp=a.createDynamicsCompressor();
  comp.threshold.value=-14;comp.knee.value=10;comp.ratio.value=10;comp.attack.value=.001;comp.release.value=.12;
  const bus=a.createGain();bus.gain.value=1.6;
  bus.connect(comp);comp.connect(a.destination);
  const T=a.currentTime+.03;
  sndEnd=Math.max(sndEnd,T+6*.62+.4);
  const osc=(type,f,t,d,v,slide)=>{
    const o=a.createOscillator(),g=a.createGain();
    o.type=type;o.frequency.setValueAtTime(f,t);
    if(slide)o.frequency.exponentialRampToValueAtTime(Math.max(30,f+slide),t+d);
    g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(v,t+.004);g.gain.exponentialRampToValueAtTime(.0001,t+d);
    o.connect(g);g.connect(bus);o.start(t);o.stop(t+d+.03);
  };
  const clang=(t,d,v)=>{
    const len=Math.floor(a.sampleRate*d),buf=a.createBuffer(1,len,a.sampleRate),dt=buf.getChannelData(0);
    for(let i=0;i<len;i++)dt[i]=(Math.random()*2-1)*Math.pow(1-i/len,2);
    const src=a.createBufferSource(),f=a.createBiquadFilter(),g=a.createGain();
    f.type="highpass";f.frequency.value=3200;g.gain.value=v;
    src.buffer=buf;src.connect(f);f.connect(g);g.connect(bus);src.start(t);
  };
  const RINGS=6,RING=.52,GAP=.1,HIT=.04,per=Math.floor(RING/HIT);
  for(let r=0;r<RINGS;r++){
    const b=T+r*(RING+GAP);
    osc("sine",120,b,.38,1,-70);          // dentuman palu
    clang(b,.14,.55);
    for(let i=0;i<per;i++){               // palu memukul dua bel bergantian = bunyi "kring" jam weker
      const t=b+i*HIT,f=i%2?2350:2680;
      osc("square",f,t,.05,.5);
      osc("sawtooth",f*1.505,t,.045,.28);
      osc("sine",f*2.76,t,.035,.25);
      osc("square",f*.5,t,.05,.22);
    }
  }
  duck(true);setTimeout(()=>duck(false),RINGS*(RING+GAP)*1000+300);
}
const SFX={
  spin(){const f=SPD.f;for(let i=0;i<12;i++){tone(260+i*35,i*.065*f,.05,"square",.06);hat(i*.065*f,.035)}},
  full(level=1){
    const base=[0,4,7,12,16,19,24,28],n=4+level*2;
    for(let i=0;i<n;i++){const nt=base[i%base.length];tone(NT(nt),i*.1,.22,"triangle",.1);tone(NT(nt+12),i*.1,.12,"sine",.05)}
    chordAt([0,4,7,12],n*.1,.9,"triangle",.1);crash(n*.1,.1+level*.02,.9);
    coinShower(2+level*.5,30+level*25,.07);
  },
  land(){tone(140,0,.18,"sine",.35,-80);hat(0,.08)},
  coins(n=8){coinShower(.6,n,.08)},
  win(level=1){
    const sc=[659,784,1047];
    sc.forEach((f,i)=>tone(f,i*.07,.16,"triangle",.1));
    coinShower(1.6+level*.8,[0,28,55,95][level],.075);
  },
  scatter(){scatterAlarm()},
  jackpot(tier="MINI"){(JPSND[tier]||JPSND.MINI)()},
  modeSwitch(on){
    if(!on)[784,659,523,392].forEach((f,i)=>tone(f,i*.12,.3,"triangle",.14));
  }
};
// musik latar beda untuk tiap mode
const BGM={
  normal :{ms:260,bass:[65.4,65.4,98,65.4,87.3,87.3,98,73.4],lead:[523,0,659,0,784,0,659,587]},
  scatter:{ms:150,bass:[98,98,130.8,98,110,110,146.8,130.8],lead:[1047,1319,1568,1319,1175,1568,1760,1568]}
};
function bgmTick(){
  if(!voiceOn||!AC)return;
  noTrack=true;try{bgmTick2()}finally{noTrack=false}
}
function bgmTick2(){
  const B=BGM[scatterMode?"scatter":"normal"],i=bgmStep++%8;
  tone(B.bass[i],0,B.ms/1000*1.6,"triangle",.07);
  if(B.lead[i])tone(B.lead[i],0,B.ms/1000*.9,"sine",scatterMode?.018:.035);
  hat(0,scatterMode?.02:.025);
}
function startBgm(){
  stopBgm();
  if(!voiceOn||!ac())return;
  bgmTimer=setInterval(bgmTick,BGM[scatterMode?"scatter":"normal"].ms);
}
function stopBgm(){clearInterval(bgmTimer);bgmTimer=null}
function startRain(){
  stopRain();
  const host=document.getElementById("rain"),icons=["🎁","💎","🪙","✨","🐉"];
  rainTimer=setInterval(()=>{
    const d=document.createElement("span");d.className="drop";d.textContent=pick(icons);
    d.style.left=Math.random()*96+"%";d.style.animationDuration=(2.5+Math.random()*2.5)+"s";
    host.appendChild(d);setTimeout(()=>d.remove(),5200);
  },200);
}
function stopRain(){clearInterval(rainTimer);rainTimer=null;document.getElementById("rain").innerHTML=""}
document.addEventListener("pointerdown",()=>{unlockAudio();if(!bgmTimer&&inGame&&voiceOn)startBgm()},{once:true});

function updateUI(){
  document.getElementById("balance").textContent=isAdmin()?"∞ ADMIN":money(balance);
  document.getElementById("chipLabel").textContent=freeMode?"CHIP GRATIS":"CHIP";
  document.getElementById("bet").textContent=money(bet);
  document.getElementById("free").textContent=freeSpins;
  document.getElementById("spinCount").textContent=spinCount.toLocaleString("id-ID");
  for(const t in JP_MULT)document.querySelector("#jp-"+t+" strong").textContent=money(bet*JP_MULT[t]);
  saveGame();
}

/* ===== GAMBAR HD (512px). Ganti URL di bawah dengan FOTO ASLI milik kamu kalau mau (jpg/png/webp/base64). Kalau gagal dimuat -> otomatis kembali ke emoji ===== */
const NOTO=c=>"https://fonts.gstatic.com/s/e/notoemoji/latest/"+c+"/512.png";
const ANIMAL_IMG={"🐯":NOTO("1f42f"),"🦁":NOTO("1f981"),"🐼":NOTO("1f43c"),"🐘":NOTO("1f418"),"🦊":NOTO("1f98a"),"🐺":NOTO("1f43a"),"🦚":NOTO("1f99a"),"🐉":NOTO("1f409"),"🎁":NOTO("1f381")};
Object.values(ANIMAL_IMG).forEach(u=>{const i=new Image();i.decoding="async";i.src=u});
/* ===== FOTO HEWAN: tertanam di EMBED_PHOTO. Mau ganti foto? ganti data base64 / URL di EMBED_PHOTO. ===== */
const PHOTO_OVERRIDE={};
const WIKI_TITLE_UNUSED={"🐯":"Tiger","🦁":"Lion","🐼":"Giant_panda","🐘":"African_bush_elephant","🦊":"Red_fox","🐺":"Wolf","🦚":"Indian_peafowl","🐉":"Komodo_dragon"};
/* FOTO TERTANAM (base64, 384px) — jalan offline */
/* EMBED_PHOTO (foto hewan) dipindah ke daf-assets.js */
const PHOTO=Object.assign({},EMBED_PHOTO);
function loadPhotos(){}   // foto sudah tertanam di file, tidak perlu internet
function picNode(e,name){
  const photo=PHOTO[e],u=ANIMAL_IMG[e];
  if(!photo&&!u)return document.createTextNode(e);
  const im=document.createElement("img");
  im.className=photo?"photo":"pic";im.src=photo||u;im.alt=e;im.draggable=false;im.decoding="async";
  if(name)im.title=name;
  im.onerror=()=>{
    if(photo){delete PHOTO[e];im.replaceWith(picNode(e,name))}   // foto gagal -> pakai gambar HD cadangan
    else im.replaceWith(document.createTextNode(e));
  };
  return im;
}
function randomBoard(){
  return Array.from({length:ROWS},()=>Array.from({length:COLS},()=>pickAnimal()));
}
// POLA KEMENANGAN SEBAGIAN (bukan baris penuh): minimal 3 gambar sama berurutan, HANYA dibaca dari KIRI→KANAN
//  - HORIZONTAL : mulai dari kolom paling kiri lurus ke kanan, 3–5 gambar (6 gambar = baris penuh, hadiah sendiri)
//  - DIAGONAL   : mulai dari kolom paling kiri menyilang naik/turun ke kanan, 3–5 gambar
// scatter tidak dihitung sebagai gambar
function lineRuns(b=board){
  const runs=[];
  const walk=(r0,c0,dr,dc,kind,side)=>{
    const e=b[r0][c0].e;if(e===SCATTER)return;
    const cells=[[r0,c0]];let r=r0+dr,c=c0+dc;
    while(r>=0&&r<ROWS&&c>=0&&c<COLS&&b[r][c].e===e){cells.push([r,c]);r+=dr;c+=dc}
    if(cells.length>=3&&cells.length<COLS)runs.push({e,cells,kind,side});
  };
  for(let r=0;r<ROWS;r++){
    walk(r,0,0,1,"H","L");                             // hanya KIRI→KANAN (arah kebalikannya tidak dihitung)
    for(const dr of [1,-1])walk(r,0,dr,1,"D","L");
  }
  return runs;
}
const diagRuns=lineRuns;
// hilangkan pola/baris penuh yang kebetulan jadi (supaya kemenangan hanya muncul sesuai peluang); sel terkunci tidak diubah
function sanitizeDiag(locked){
  const isL=(r,c)=>locked.has(r*COLS+c);
  const swap=(r,c,e)=>{let a;do{a=pickAnimal()}while(a.e===e);board[r][c]=a};
  for(let it=0;it<100;it++){
    let changed=false;
    for(let r=0;r<ROWS;r++){                       // baris penuh tak disengaja
      const e=board[r][0].e;
      if(e!==SCATTER&&board[r].every(x=>x.e===e)){
        const free=[];for(let c=0;c<COLS;c++)if(!isL(r,c))free.push(c);
        if(free.length){swap(r,free[Math.floor(Math.random()*free.length)],e);changed=true}
      }
    }
    lineRuns().filter(run=>!run.cells.every(([r,c])=>isL(r,c))).forEach(run=>{
      const free=run.cells.filter(([r,c])=>!isL(r,c));
      const [r,c]=free[Math.floor(Math.random()*free.length)];
      swap(r,c,run.e);changed=true;
    });
    if(!changed)return;
  }
}
function plantLine(locked,dcells){
  let x=Math.random()*100,L=3;
  for(const [n,w] of DIAG_LEN_W){x-=w;if(x<0){L=n;break}}
  const kind=Math.random()<.4?"H":"D",side="L";
  const dc=side==="L"?1:-1,c0=side==="L"?0:COLS-1,cells=[];
  if(kind==="H"){const r=Math.floor(Math.random()*ROWS);for(let i=0;i<L;i++)cells.push([r,c0+dc*i])}
  else{
    const dr=Math.random()<.5?1:-1;
    const rs=dr===1?Math.floor(Math.random()*(ROWS-L+1)):(L-1)+Math.floor(Math.random()*(ROWS-L+1));
    for(let i=0;i<L;i++)cells.push([rs+dr*i,c0+dc*i]);
  }
  const a=(an!=null&&animals[an])?animals[an]:pickAnimal();
  cells.forEach(([r,c])=>{board[r][c]=a;locked.add(r*COLS+c);dcells.add(r*COLS+c)});
}
function seedResult(mode="normal",plain=false,gacor=false,luck=1){
  board=randomBoard();
  const M=MODES[mode],locked=new Set(),dcells=new Set();
  if(plain){sanitizeDiag(locked);return}   // spin jackpot / full gambar: papan polos, hasil ditentukan terpisah
  const roll=Math.random();
  let rows=0;
  if(gacor){   // akun gacor (terdaftar admin): TIAP spin menang -> kemenangan beruntun. Besar kecilnya tetap acak
    const q=Math.random();
    rows=q<.50?1:q<.64?2:q<.70?3:0;   // 50% 1 baris, 14% 2 baris, 6% 3 baris, 30% pola sebagian (horizontal/diagonal)
  }else{
    const W=Math.min(6,Math.max(.5,Math.pow(luck||1,.6)));   // akun hoki: peluang menang biasa ikut naik
    const r3=M.rows3*W,r2=M.rows2*W,r1=M.rows1*W;
    if(roll<r3)rows=3;else if(roll<r3+r2)rows=2;else if(roll<r3+r2+r1)rows=1;
  }
  if(rows){
    const animal=pickAnimal();
    const selected=[0,1,2,3,4].sort(()=>Math.random()-.5).slice(0,rows);
    selected.forEach(r=>{for(let c=0;c<COLS;c++){board[r][c]=animal;locked.add(r*COLS+c)}});
  }else if(gacor||Math.random()<Math.min(.6,M.diag*Math.min(6,Math.max(.5,Math.pow(luck||1,.6)))))plantLine(locked,dcells);   // M.diag = peluang pola sebagian (horizontal/diagonal)
  sanitizeDiag(locked);
  if(Math.random()<M.scatter){
    const count=scatterCount();
    let placed=0;
    while(placed<count){
      const r=Math.floor(Math.random()*ROWS),c=Math.floor(Math.random()*COLS);
      if(board[r][c].e!==SCATTER&&!dcells.has(r*COLS+c)){board[r][c]={e:SCATTER,n:"Scatter",v:0};placed++}
    }
  }
}
function plantLineSpec(kind,L,locked,dcells,an){
  const cells=[];
  if(kind==="H"){const r=Math.floor(Math.random()*ROWS);for(let i=0;i<L;i++)cells.push([r,i])}
  else{const dr=Math.random()<.5?1:-1,rs=dr===1?Math.floor(Math.random()*(ROWS-L+1)):(L-1)+Math.floor(Math.random()*(ROWS-L+1));for(let i=0;i<L;i++)cells.push([rs+dr*i,i])}
  const a=pickAnimal();
  cells.forEach(([r,c])=>{board[r][c]=a;locked.add(r*COLS+c);dcells.add(r*COLS+c)});
}
/* papan dibentuk dari rencana hasil SERVER (baris / pola sebagian / scatter) */
function seedFromPlan(p){
  board=randomBoard();
  const locked=new Set(),dcells=new Set();
  if(p.rows){
    const animal=(p.an!=null&&animals[p.an])?animals[p.an]:pickAnimal();
    [0,1,2,3,4].sort(()=>Math.random()-.5).slice(0,p.rows).forEach(r=>{for(let c=0;c<COLS;c++){board[r][c]=animal;locked.add(r*COLS+c)}});
  }else if(p.line)plantLineSpec(p.line.kind,p.line.L,locked,dcells,p.an);
  sanitizeDiag(locked);
  if(p.scatter>=3){
    let placed=0,guard=0;
    while(placed<p.scatter&&guard++<500){
      const r=Math.floor(Math.random()*ROWS),c=Math.floor(Math.random()*COLS);
      if(board[r][c].e!==SCATTER&&!locked.has(r*COLS+c)){board[r][c]={e:SCATTER,n:"Scatter",v:0};placed++}
    }
  }
}
function countRows(){
  const rows=[];
  for(let r=0;r<ROWS;r++){
    const first=board[r][0].e;
    if(first!==SCATTER && board[r].every(x=>x.e===first))rows.push(r);
  }
  return rows;
}
function countScatter(){
  let n=0;
  board.flat().forEach(x=>{if(x.e===SCATTER)n++});
  return n;
}
function tier(rows,mode="normal"){
  const k=MODES[mode].mult;
  const m=n=>Math.round(rnd(PRIZE_RANGE[n][0],PRIZE_RANGE[n][1])*k*10)/10;
  if(rows>=3)return {name:"SUPER WIN",mult:m(3),pct:100};
  if(rows===2)return {name:"MEGA WIN",mult:m(2),pct:70};
  if(rows===1)return {name:"BIG WIN",mult:m(1),pct:40};
  return null;
}
let diagHL=false;   // true hanya pada spin biasa (bukan full gambar / jackpot)
function render(falling=true){
  const root=document.getElementById("reels");
  root.innerHTML="";
  const dset=new Set();
  if(diagHL)diagRuns(board).forEach(run=>run.cells.forEach(([r,c])=>dset.add(r*COLS+c)));
  for(let r=0;r<ROWS;r++){
    const win=countRows().includes(r);
    for(let c=0;c<COLS;c++){
      const d=document.createElement("div");
      const isScatter=board[r][c].e===SCATTER;
      d.className="cell"+(falling?" falling ":"")+((win||dset.has(r*COLS+c))?" win ":"")+(isScatter?" scatter":"");
      d.style.animationDelay=((r*COLS+c)*0.012)+"s";
      d.appendChild(picNode(board[r][c].e,board[r][c].n));
      d.title=board[r][c].n;
      root.appendChild(d);
    }
  }
}
function burstCoins(big=false,hostId="particles"){
  const host=document.getElementById(hostId);
  const n=big?85:45;
  for(let i=0;i<n;i++){
    const c=document.createElement("span");
    c.className="coin";c.textContent=Math.random()<.18?"💎":"🪙";
    c.style.left=(40+Math.random()*20)+"%";c.style.top=(38+Math.random()*12)+"%";
    const dx=(Math.random()-.5)*(big?620:420),dy=-(80+Math.random()*(big?420:290));
    const rot=(Math.random()*720-360);
    const dur=800+Math.random()*900;
    c.animate([
      {transform:"translate(0,0) rotate(0) scale(.4)",opacity:1},
      {transform:`translate(${dx}px,${dy}px) rotate(${rot}deg) scale(1.1)`,opacity:1,offset:.62},
      {transform:`translate(${dx*1.05}px,${dy+230}px) rotate(${rot*1.4}deg) scale(.7)`,opacity:0}
    ],{duration:dur,easing:"cubic-bezier(.15,.65,.25,1)"});
    host.appendChild(c);setTimeout(()=>c.remove(),dur+50);
  }
}
function coinRain(n=60,span=2200,hostId="particles"){
  const host=document.getElementById(hostId);
  const H=(host.clientHeight||600)+80;
  for(let i=0;i<n;i++){
    const c=document.createElement("span");
    c.className="coin";c.textContent=Math.random()<.12?"💎":"🪙";
    c.style.left=(Math.random()*96)+"%";c.style.top="-40px";
    c.style.fontSize=(18+Math.random()*26)+"px";
    const delay=Math.random()*span,dur=900+Math.random()*900,rot=(Math.random()*1080-540);
    const a=c.animate([
      {transform:"translateY(0) rotate(0deg)",opacity:1},
      {transform:`translateY(${H*0.9}px) rotate(${rot}deg)`,opacity:1,offset:.85},
      {transform:`translateY(${H*0.82}px) rotate(${rot*1.1}deg)`,opacity:0}
    ],{duration:dur,delay:delay,easing:"cubic-bezier(.35,0,.85,.6)",fill:"backwards"});
    host.appendChild(c);setTimeout(()=>c.remove(),delay+dur+80);
  }
}
async function showOverlay(title,sub,pct,mega=false,amt=0){
  const isJackpot=title.startsWith("JACKPOT");
  const level=pct>=100?3:pct>=70?2:1;
  document.getElementById("winText").textContent=title;
  document.getElementById("winSub").textContent=sub;
  document.getElementById("meter").style.width=pct+"%";
  document.getElementById("overlay").classList.add("show");
  document.getElementById("cabinet").classList.add("shake");
  // animasi: ledakan koin + hujan koin sepanjang layar (jackpot paling deras)
  burstCoins(true);
  const jpTier=isJackpot?title.split(" ")[1]:null;
  if(amt>0)showAmt(isJackpot?jpTier:(level===3?"SUPER":level===2?"MEGA":"BIG"),amt,isJackpot);else clearAmt();
  if(isJackpot){
    const JP={MINI:{n:40,b:2,sh:""},MINOR:{n:70,b:3,sh:""},MAJOR:{n:110,b:5,sh:"shakeLong"},GRAND:{n:240,b:7,sh:"shakeLong"}}[jpTier]||{n:40,b:2,sh:""};
    const wt=document.getElementById("winText"),ov=document.getElementById("overlay"),cab=document.getElementById("cabinet");
    wt.className="winText t-"+jpTier;          // animasi judul beda tiap tier
    ov.classList.add("jp"+jpTier);
    jpFX(jpTier);                              // animasi layar beda tiap tier
    coinRain(JP.n,4200);
    if(JP.sh)cab.classList.add(JP.sh);
    for(let k=1;k<=JP.b;k++)setTimeout(()=>burstCoins(true),k*(4200/JP.b));
    SFX.jackpot(jpTier);         // audio beda tiap tier, ±5 detik
    await sleepRaw(5000);        // jackpot selalu tampil penuh, tidak ikut dipercepat
    await waitAudioIdle();       // dan tunggu audionya habis
    jpFXOff();
    wt.className="winText";
    ov.classList.remove("jp"+jpTier);
    if(JP.sh)cab.classList.remove(JP.sh);
  }else{
    coinRain([0,45,90,150][level],1500+level*500);
    SFX.win(level);              // suara koin dominan
    speakWin(level);             // BIG / MEGA / SUPER WIN = audio lo
    await sleepRaw(3000);        // tunggu voice selesai (tidak ikut dipercepat)
    await waitAudioIdle();
  }
  document.getElementById("overlay").classList.remove("show");
  document.getElementById("cabinet").classList.remove("shake");
  clearAmt();
}

/* ===== ANGKA HADIAH BESAR: hitung naik + transisi masuk beda tiap tier ===== */
const AMT_STYLE={
  BIG:    {k:"rise",  g:["#fff6c9","#ffe27a","#ffb23a"],gl:"#ffb000",ms:1100},
  MEGA:   {k:"blur",  g:["#fff1d0","#ffb347","#ff6a1a"],gl:"#ff7a1a",ms:1500,shine:1},
  SUPER:  {k:"zoom",  g:["#ffffff","#ffe85a","#ff9b16"],gl:"#ffcf33",ms:2000,shine:1},
  DIAG:   {k:"rise",  g:["#f4ffe8","#b6f46a","#4fb82a"],gl:"#7dff4d",ms:900},
  MINI:   {k:"drop",  g:["#eafff0","#7dffb0","#1fbf5a"],gl:"#2fe36b",ms:2400},
  MINOR:  {k:"reveal",g:["#f0fbff","#8fdcff","#2a8cff"],gl:"#29a8ff",ms:2600,shine:1},
  MAJOR:  {k:"spread",g:["#fff0ff","#f08aff","#9a2cff"],gl:"#d84dff",ms:3000,shine:1},
  GRAND:  {k:"flip",  g:["#ffffff","#ffe36a","#ff8a00"],gl:"#ff9b16",ms:3400,shine:1},
  F1:     {k:"rise",  g:["#ffe3c9","#ffb36b","#b8641c"],gl:"#ff9b3d",ms:1800},
  F2:     {k:"reveal",g:["#ffffff","#e8f0ff","#9fb4d8"],gl:"#cfe0ff",ms:2000,shine:1},
  F3:     {k:"blur",  g:["#fffbe0","#ffe36a","#e89a10"],gl:"#ffd34d",ms:2300,shine:1},
  F4:     {k:"spread",g:["#ffffff","#b9fbff","#43c6ff"],gl:"#29e8ff",ms:2600,shine:1},
  F5:     {k:"flip",  g:["#fff1b8","#ff8a3d","#e02a00"],gl:"#ff5a1a",ms:3000,shine:1}
};
let amtTok=0;
function clearAmt(){amtTok++;const el=document.getElementById("winAmt");if(el){el.className="winAmt";el.textContent="";el.removeAttribute("data-t");el.removeAttribute("style")}}
function showAmt(key,amount,raw=false,elId="winAmt"){
  const st=AMT_STYLE[key],el=document.getElementById(elId);if(!st||!el)return;
  const tok=++amtTok;
  el.className="winAmt";void el.offsetWidth;                       // restart animasi
  el.style.setProperty("--g1",st.g[0]);el.style.setProperty("--g2",st.g[1]);el.style.setProperty("--g3",st.g[2]);el.style.setProperty("--gl",st.gl);
  el.className="winAmt k-"+st.k+(st.shine?" shine":"");
  const dur=st.ms,t0=performance.now();      // hitung angka hadiah selalu penuh, tidak ikut turbo/super
  const ease=x=>x>=1?1:1-Math.pow(2,-10*x);                          // easeOutExpo: cepat lalu melambat halus
  const paint=v=>{const t=money(v);el.textContent=t;el.setAttribute("data-t",t)};
  paint(0);
  (function step(now){
    if(tok!==amtTok)return;
    const x=Math.min(1,(now-t0)/dur);
    paint(Math.floor(amount*ease(x)));
    if(x<1)requestAnimationFrame(step);else paint(amount);
  })(t0);
}
async function showDiag(len,mult,amt,kind="D",side="L"){
  const wt=document.getElementById("winText"),ov=document.getElementById("overlay");
  wt.textContent=kind==="H"?"↔ HORIZONTAL WIN ↔":"↗ DIAGONAL WIN ↘";wt.className="winText diag";
  document.getElementById("winSub").textContent=`${len} GAMBAR • ${side==="L"?"KIRI → KANAN":"KANAN → KIRI"} • ×${mult} • +${money(amt)}`;
  document.getElementById("meter").style.width="25%";
  ov.classList.add("show");
  showAmt("DIAG",amt);
  burstCoins(false);coinRain(18,900);
  SFX.win(1);
  await sleepRaw(1900);
  await waitAudioIdle();
  ov.classList.remove("show");wt.className="winText";clearAmt();
}
function updateBanner(){
  document.getElementById("modeBanner").textContent=
    `⚡ SCATTER MODE ×${MODES.scatter.mult} • SISA ${freeSpins} SPIN • TOTAL +${money(scatterTotal)}`;
}
function setMode(on){
  scatterMode=on;
  if(on)scatterTotal=0;
  document.body.classList.toggle("scatter-mode",on);
  document.getElementById("mode").textContent=on?"SCATTER":"NORMAL";
  updateBanner();
  SFX.modeSwitch(on);
  if(on)startRain();else stopRain();
  if(bgmTimer)startBgm();
}
// tier -> gambar yang memenuhi layar (GRAND = 🐉)
function setFullBoard(a){
  board=Array.from({length:ROWS},()=>Array.from({length:COLS},()=>a));
}

/* ===== BONUS JACKPOT: 12 KARTU TERTUTUP (MINI/MINOR/MAJOR/GRAND masing-masing 3). Buka kartu SATU PER SATU sampai ada 3 simbol sama.
   Hasil tier sudah ditentukan dari undian jackpot; kartu hanya cara menampilkannya. Urutan kartu = pengocokan acak murni
   (Fisher-Yates + angka acak kriptografis) yang hanya disaring supaya tier yang pertama lengkap 3 = tier hadiah. Tidak ada pola tetap. ===== */
/* JP_IMG (gambar jackpot) dipindah ke daf-assets.js */
const JP_COL={MINI:"#2fe36b",MINOR:"#29a8ff",MAJOR:"#d84dff",GRAND:"#ffd34d"};
const JP_LIST=["MINI","MINOR","MAJOR","GRAND"];
function secInt(n){   // angka acak kriptografis 0..n-1 (tidak bisa ditebak dari pola)
  try{const a=new Uint32Array(1),lim=Math.floor(4294967296/n)*n;do{crypto.getRandomValues(a)}while(a[0]>=lim);return a[0]%n}catch(e){return Math.floor(Math.random()*n)}
}
function fyShuffle(a){a=a.slice();for(let i=a.length-1;i>0;i--){const j=secInt(i+1);const t=a[i];a[i]=a[j];a[j]=t}return a}
function jpPlan(tier){
  // Kocok 12 kartu (tiap tier 3) secara acak murni, ulangi sampai tier yang pertama kali lengkap 3 kartu = tier hadiah.
  // Hasil: urutan kartu benar-benar acak (bisa 3 kartu pertama sudah sama, bisa sampai kartu ke-10) — tidak ada pola tetap yang bisa ditebak.
  const deck=[];JP_LIST.forEach(t=>{for(let k=0;k<3;k++)deck.push(t)});
  for(let tries=0;tries<500;tries++){
    const d=fyShuffle(deck),c={};
    for(let i=0;i<d.length;i++){
      c[d[i]]=(c[d[i]]||0)+1;
      if(c[d[i]]===3){if(d[i]===tier)return d.slice(0,i+1);break}
    }
  }
  return [tier,tier,tier];
}
async function jpCards(tier,amt,reason,onWin,srv){   // srv=true: tier BELUM diketahui, tiap kartu diminta ke SERVER saat diklik
  const g=id=>document.getElementById(id);
  const root=g("jpGame"),grid=g("jpGrid"),sub=g("jpSub"),title=g("jpTitle"),prize=g("jpPrize"),claim=g("jpClaim"),frame=g("jpFrame"),tallyEl=g("jpTally");
  const plan=srv?null:jpPlan(tier);
  let col="#ffd34d",inflight=false,srvRest=null;
  const cnt={MINI:0,MINOR:0,MAJOR:0,GRAND:0};
  const shown={MINI:0,MINOR:0,MAJOR:0,GRAND:0};   // hitungan yang BOLEH terlihat: baru naik setelah kartu itu selesai berbalik (cnt = internal)
  const tally=()=>{tallyEl.innerHTML=JP_LIST.map(t=>`<span class="${shown[t]>=2?"hot":""}" style="--c:${JP_COL[t]}">${t} ${shown[t]}/3</span>`).join("")};
  grid.innerHTML="";prize.className="winAmt";prize.textContent="";prize.removeAttribute("style");prize.removeAttribute("data-t");
  claim.hidden=true;claim.onclick=null;
  title.textContent="🎰 JACKPOT BONUS 🎰";
  sub.textContent="Buka kartu satu per satu — 3 simbol sama = JACKPOT!";
  tally();
  root.style.setProperty("--jc","#ffd34d");root.className="jpGame show";
  frame.style.removeProperty("--jc");
  g("msg").textContent="JACKPOT BONUS — buka kartunya!";
  const cards=[];
  for(let i=0;i<12;i++){
    const el=document.createElement("button");el.type="button";el.className="jpCard";el.style.setProperty("--i",i);
    el.setAttribute("aria-label","Kartu "+(i+1));
    el.innerHTML='<div class="in"><div class="f back"></div><div class="f front"></div></div>';
    grid.appendChild(el);cards.push({el,front:el.querySelector(".front"),opened:false,tier:null});
  }
  const show=(c,t,dim)=>{
    c.opened=true;c.tier=t;c.front.style.setProperty("--c",JP_COL[t]);
    c.front.innerHTML=`<img src="${JP_IMG[t]}" alt="${t}" draggable="false"><b>${t}</b>`;
    if(dim)c.el.classList.add("dim");
    void c.el.offsetWidth;c.el.classList.add("open");
  };
  let n=0,done=false;
  await new Promise(res=>{
    let idle=null;
    const arm=()=>{clearTimeout(idle);idle=setTimeout(()=>{      // tidak disentuh / mode AUTO -> kartu dibuka otomatis
      const free=cards.filter(c=>!c.opened);if(free.length&&!done)pick(free[Math.floor(Math.random()*free.length)]);
    },20000)};   // selalu tunggu 20 detik (juga saat AUTO) — auto spin lanjut setelah semua kartu terbuka
    const pick=async c=>{
      if(c.opened||done||inflight||(!srv&&n>=plan.length))return;
      let t,fin=false;
      if(srv){
        inflight=true;
        const r=await apiCall("/jp/open",{},LS.get("daf_token"));
        inflight=false;
        if(done||c.opened)return;
        if(!(r.ok&&r.j&&r.j.t)){sub.textContent=(r.j&&r.j.error)||"Koneksi bermasalah, tekan kartu lagi";arm();return}
        t=r.j.t;fin=!!r.j.done;
        if(fin){tier=t;amt=Number(r.j.amt)||amt;srvRest=Array.isArray(r.j.rest)?r.j.rest:null}
      }else t=plan[n];
      n++;cnt[t]++;
      show(c,t,false);
      tone(NT(8+Math.min(n,6)*2),0,.28,"triangle",.14);coinPing(.05,.09);
      const nOpen=n;
      // tally & teks "tinggal 1 lagi" baru muncul SETELAH kartu selesai berbalik (flip .75s), supaya hasil tidak bocor duluan
      setTimeout(()=>{
        shown[t]++;tally();
        if(srv?fin:(cnt[tier]>=3&&nOpen===plan.length))return;
        if(nOpen!==n)return;
        const hot=JP_LIST.filter(x=>shown[x]===2);
        sub.textContent=hot.length?`🔥 ${hot.join(" & ")} tinggal 1 lagi! (${nOpen} kartu terbuka)`:`Buka kartu satu per satu — 3 simbol sama = JACKPOT! (${nOpen} kartu terbuka)`;
      },780);
      if(srv?fin:cnt[tier]>=3){done=true;clearTimeout(idle);res();return}
      arm();
    };
    cards.forEach(c=>{c.el.onclick=()=>{unlockAudio();arm();pick(c)}});
    arm();
  });
  cards.forEach(c=>c.el.onclick=null);
  await sleepRaw(1000);   // tunggu flip kartu ke-3 selesai dulu
  JP_LIST.forEach(x=>shown[x]=cnt[x]);tally();
  // 3 kartu sama -> JACKPOT
  col=JP_COL[tier];
  if(onWin)onWin(tier,amt);
  root.style.setProperty("--jc",col);frame.style.setProperty("--jc",col);root.classList.add("won");
  cards.filter(c=>c.opened&&c.tier===tier).forEach(c=>c.el.classList.add("match"));
  cards.filter(c=>c.opened&&c.tier!==tier).forEach(c=>c.el.classList.add("dim"));
  title.textContent=`👑 JACKPOT ${tier}! 👑`;
  sub.textContent=`3 × ${tier} • ${reason}`;
  g("msg").textContent=`JACKPOT ${tier}!`;
  frame.classList.add("shake");setTimeout(()=>frame.classList.remove("shake"),600);
  const JP={MINI:{n:40,b:2},MINOR:{n:70,b:3},MAJOR:{n:110,b:5},GRAND:{n:240,b:7}}[tier];
  coinRain(JP.n,4200,"jpParticles");
  for(let k=0;k<JP.b;k++)setTimeout(()=>burstCoins(true,"jpParticles"),k*(4200/JP.b));
  SFX.jackpot(tier);
  await sleepRaw(700);
  // semua kartu sisa dibuka (tiap tier tetap total 3 kartu)
  const rest=[];JP_LIST.forEach(t=>{for(let k=cnt[t];k<3;k++)rest.push(t)});
  const restS=fyShuffle(rest);rest.length=0;restS.forEach(x=>rest.push(x));
  if(srvRest&&srvRest.length===rest.length)srvRest.forEach((x,i)=>rest[i]=x);   // urutan sisa kartu dari server
  const left=cards.filter(c=>!c.opened);
  for(let i=0;i<left.length;i++){show(left[i],rest[i],true);cnt[rest[i]]++;shown[rest[i]]++;tally();await sleepRaw(170)}
  JP_LIST.forEach(x=>shown[x]=cnt[x]);tally();
  await sleepRaw(300);
  showAmt(tier,amt,true,"jpPrize");
  await sleepRaw(3600);
  await waitAudioIdle();           // audio jackpot habis dulu baru boleh klaim / lanjut auto
  claim.hidden=false;
  await new Promise(r=>{claim.onclick=r;setTimeout(r,auto?1200:9000)});
  claim.onclick=null;
  root.className="jpGame";grid.innerHTML="";prize.textContent="";tallyEl.innerHTML="";
  amtTok++;
  return{tier,amt};
}
/* JACKPOT MINI/MINOR/MAJOR/GRAND — tanpa full gambar, tiap tier animasi sendiri */
async function awardJackpot(tier,reason,sp,special){
  const srv=!tier;   // akun server: tier disembunyikan server sampai kartu ke-3 terbuka
  document.getElementById("msg").textContent="JACKPOT BONUS — buka kartunya!";   // tier TIDAK dibocorkan sebelum kartu terbuka
  const res=await jpCards(tier,srv?0:jpAmount(tier),reason,(t,a)=>{   // dipanggil saat 3 kartu sama sudah terbuka: baru kotak tier menyala & chip masuk
    document.getElementById("jp-"+t).classList.add("hit");
    balance+=a;
    if(scatterMode)scatterTotal+=a;
    updateUI();
  },srv);
  const amt=res.amt;
  if(special)special.tier=res.tier;
  if(srv&&sp){sp.balance+=amt;sp.win=amt}   // saldo akhir dari server sudah termasuk jackpot
  await sleepRaw(300);
  document.getElementById("jp-"+res.tier).classList.remove("hit");
  return amt;
}
/* FULL GAMBAR — hadiah terpisah, tier & jumlah beda tiap gambar */
async function awardFull(a,reason){
  const P=FULL_PRIZE[animals.indexOf(a)],k=scatterMode?MODES.scatter.mult:1;
  const mult=P.mult*k,amt=bet*mult;
  diagHL=false;
  setFullBoard(a);
  render(true);
  const reels=document.getElementById("reels");
  reels.classList.add("jpFull");
  document.getElementById("msg").textContent=`FULL GAMBAR ${a.n.toUpperCase()} ${a.e} — ${P.tier}!`;
  await sleepRaw(1100);
  balance+=amt;
  if(scatterMode)scatterTotal+=amt;
  updateUI();updateBanner();
  const wt=document.getElementById("winText");
  wt.className="winText t-FULL";wt.style.color=P.color;
  document.getElementById("winText").textContent="FULL GAMBAR "+a.n.toUpperCase();
  const wp=document.getElementById("winPic");wp.innerHTML="";wp.appendChild(picNode(a.e,a.n));wp.style.setProperty("--pc",P.color);wp.classList.add("show");
  document.getElementById("winSub").textContent=`${P.tier} • ${reason} • ×${mult} • +${money(amt)}`;
  document.getElementById("meter").style.width=(40+P.lv*12)+"%";
  showAmt("F"+P.lv,amt);
  document.getElementById("overlay").classList.add("show");
  document.getElementById("cabinet").classList.add("shake");
  burstCoins(true);
  coinRain(30+P.lv*30,2000+P.lv*400);
  SFX.full(P.lv);
  speakWin(3);                 // FULL GAMBAR selalu pakai audio SUPER WIN
  await sleepRaw(3000+P.lv*300);
  await waitAudioIdle();
  document.getElementById("overlay").classList.remove("show");
  document.getElementById("cabinet").classList.remove("shake");
  wt.className="winText";wt.style.color="";
  const wp2=document.getElementById("winPic");wp2.classList.remove("show");wp2.innerHTML="";
  clearAmt();
  reels.classList.remove("jpFull");
  return amt;
}
function renderFullTable(){
  const groups={};
  FULL_PRIZE.forEach((p,i)=>{(groups[p.tier]=groups[p.tier]||{color:p.color,items:[]}).items.push(animals[i].e+"×"+p.mult)});
  document.getElementById("fullTable").innerHTML="<b>FULL GAMBAR (×BET):</b> "+
    Object.entries(groups).map(([t,g])=>`<span style="color:${g.color}">${t} ${g.items.join(" ")}</span>`).join("")+
    `<span style="color:#b6f46a">↔ HORIZONTAL & ↗↘ DIAGONAL 3–5 gambar dari KIRI → KANAN: ×0.4–1.9</span>`;
}
/* ===== ANIMASI LAYAR JACKPOT (beda tiap tier) ===== */
let jpFXTimer=null;
function fxEl(fx,cls,txt,st){
  const d=document.createElement("div");d.className="p "+cls;if(txt)d.textContent=txt;
  for(const k in st){if(k.startsWith("--"))d.style.setProperty(k,st[k]);else d.style[k]=st[k]}
  fx.appendChild(d);return d;
}
function fxBurst(fx,x,y,icons,n,dist){
  for(let i=0;i<n;i++){
    const ang=Math.PI*2*i/n+Math.random()*.4,d=dist*(.6+Math.random()*.6);
    const e=fxEl(fx,"",pick(icons),{left:x+"%",top:y+"%",fontSize:(18+Math.random()*18)+"px",
      "--dx":Math.cos(ang)*d+"px","--dy":Math.sin(ang)*d+"px",animation:"jpBurst "+(.9+Math.random()*.5)+"s ease-out forwards"});
    setTimeout(()=>e.remove(),1700);
  }
}
function jpFX(t){
  const fx=document.getElementById("jpfx");
  jpFXOff();
  fx.className="jpfx on "+t;
  const R=(a,b)=>a+Math.random()*(b-a);
  if(t==="MINI"){            // 🍀 hijau: ring melebar + semanggi melayang naik
    for(let i=0;i<3;i++)fxEl(fx,"ring","",{"--c":"#7dffb0",animation:`jpRing 1.8s ease-out ${i*.6}s infinite`});
    for(let i=0;i<26;i++)fxEl(fx,"",pick(["🍀","✨","🍀","🪙"]),{left:R(2,95)+"%",top:"100%",fontSize:R(22,42)+"px","--r":R(-70,70)+"deg",animation:`jpRise ${R(2.6,4.2)}s ease-out ${R(0,3)}s infinite`});
  }else if(t==="MINOR"){     // 💎 biru: kilau menyapu + berlian berjatuhan
    for(let i=0;i<2;i++)fxEl(fx,"sweep","",{animationDelay:(i*.55)+"s"});
    for(let i=0;i<24;i++)fxEl(fx,"",pick(["💎","💎","✨","🔷"]),{left:R(2,95)+"%",top:"-12%",fontSize:R(24,46)+"px","--r":R(-360,360)+"deg",animation:`jpFall ${R(1.8,3.2)}s linear ${R(0,3)}s infinite`});
  }else if(t==="MAJOR"){     // 🔥 ungu: strobo + kembang api meledak beruntun
    fxEl(fx,"strobe","",{"--c":"#d84dff",animation:"jpStrobe .4s steps(2) infinite"});
    const go=()=>fxBurst(fx,R(12,88),R(15,80),["🔥","💥","✦","🔥"],14,190);
    go();jpFXTimer=setInterval(go,380);
  }else{                     // 👑 GRAND emas: sinar berputar + naga terbang + mahkota jatuh + strobo
    fxEl(fx,"rays2","",{});
    fxEl(fx,"strobe","",{"--c":"#fff2a8",animation:"jpStrobe .28s steps(2) infinite"});
    fxEl(fx,"","🐉",{top:"10%",fontSize:"120px",animation:"jpFly 2.6s linear infinite"});
    fxEl(fx,"","🐉",{top:"62%",fontSize:"90px",animation:"jpFlyBack 3.1s linear .8s infinite"});
    fxEl(fx,"","👑",{left:"50%",top:"3%",marginLeft:"-50px",fontSize:"100px",animation:"jpCrown 1s cubic-bezier(.2,1.6,.4,1) both"});
    const go=()=>fxBurst(fx,R(10,90),R(15,85),["🪙","✦","🔥","👑"],16,230);
    go();jpFXTimer=setInterval(go,300);
  }
}
function jpFXOff(){
  if(jpFXTimer){clearInterval(jpFXTimer);jpFXTimer=null}
  const fx=document.getElementById("jpfx");fx.className="jpfx";fx.innerHTML="";
}
async function showScatter(count){
  const entering=!scatterMode;
  clearAmt();
  const extra=(entering?SCATTER_SPINS_ENTER:SCATTER_SPINS_RETRIGGER)[count]||(entering?6:3);
  freeSpins+=extra;
  if(entering)setMode(true);
  updateUI();updateBanner();
  const wt=document.getElementById("winText"),ov=document.getElementById("overlay");
  wt.textContent=entering?"⏰ SCATTER! ⏰":"⏰ RETRIGGER! ⏰";
  wt.classList.add("alarm");
  document.getElementById("winSub").textContent=`${count} SCATTER • +${extra} FREE SPIN • SISA ${freeSpins}${entering?" • WIN ×"+MODES.scatter.mult:""}`;
  ov.classList.add("show","alarmflash");
  document.getElementById("cabinet").classList.add("shake");
  document.getElementById("meter").style.width="100%";
  burstCoins(false);
  SFX.scatter();                 // suara jam weker menggelegar
  await sleepRaw(3600);          // beri waktu alarm bunyi sampai habis
  await waitAudioIdle();
  ov.classList.remove("show","alarmflash");
  wt.classList.remove("alarm");
  document.getElementById("cabinet").classList.remove("shake");
    document.getElementById("msg").textContent="Scatter aktif — free spin dimulai!";
  return 0;
}
async function endScatterMode(){
  clearAmt();
  document.getElementById("winText").textContent="SCATTER SELESAI";
  document.getElementById("winSub").textContent=`TOTAL SCATTER MODE +${money(scatterTotal)}`;
  document.getElementById("overlay").classList.add("show");
  await sleepRaw(1500);
  document.getElementById("overlay").classList.remove("show");
  setMode(false);
  document.getElementById("msg").textContent="Kembali ke mode NORMAL";
}
async function spin(isFree=false){
  if(busy||modalOpen)return 0;
  if(freeSpins>0)isFree=true;
  if(!isFree)clampBet();          // bet otomatis turun kalau chip tidak cukup
  if(!isFree&&!isAdmin()&&balance<BET_STEP){openBroke();return 0}   // chip habis -> tawarkan mode gratis
  busy=true;syncSpinBtn();
  spinCount++;stateRev++;
  const spinBet=bet;
  unlockAudio();
  document.getElementById("meter").style.width="0%";
  if(!bgmTimer)startBgm();
  SFX.spin();
  let sp=null;     // hasil undian dari SERVER (akun server, mode normal)
  if(acct&&acct.server&&!freeMode&&!isAdmin()){
    const r=await apiCall("/spin",{bet},LS.get("daf_token"));
    if(!(r.ok&&r.j&&r.j.plan)){
      spinCount--;
      if(r.j&&typeof r.j.balance==="number"){balance=r.j.balance;clampBet()}
      if(r.status===401){LS.del("daf_token");busy=false;syncSpinBtn();resetSession("Sesi habis, silakan login lagi");openWelcome();return 0}
      stopAuto();busy=false;syncSpinBtn();updateUI();
      setMsg((r.j&&r.j.error)||"Spin gagal, coba lagi");
      return 0;
    }
    sp=r.j.plan;isFree=sp.free;
  }
  const mode=isFree?"scatter":"normal";
  let win=0,rescue=false;

  if(isFree){
    freeSpins=sp?sp.fsMid:Math.max(0,freeSpins-1);
    if(!scatterMode)setMode(true);
  }else{
        if(sp)freeSpins=sp.fsMid;else if(!isAdmin())balance-=bet;             // hanya admin yang chipnya tidak pernah berkurang
  }
  if(sp)balance=sp.balance-sp.win;
  updateUI();updateBanner();
  document.getElementById("msg").textContent=isFree?"SCATTER MODE — FREE SPIN…":"REELS BERPUTAR…";
  // tentukan dulu apakah spin ini FULL GAMBAR / JACKPOT (dua hadiah terpisah), semua murni hoki
  let special=null;
  if(sp){
    if(sp.special)special=sp.special.kind==="full"?{kind:"full",animal:animals[sp.special.animal]}:{kind:"jp",tier:sp.special.tier};
    diagHL=!special;
    if(special)seedResult(mode,true);else seedFromPlan(sp);
  }else{
  // semua akun bisa kena (hoki); akun terdaftar admin = gacor (peluang dikali GACOR_*). Mode gratis tidak pernah dapat.
  const L=(acct&&acct.luck>0)?acct.luck:1,GV=(acct&&acct.gv>0)?acct.gv:1;
  const gF=can("full")?GACOR_FULL*GV:1,gJ=can("jp")?GACOR_JP*GV:1;   // gacor hanya untuk akun yang diizinkan admin; pemain biasa murni acak (tanpa hoki permanen)
     // terdaftar = gacor (bervariasi per akun); lainnya = kehokian pribadi
  if(!freeMode&&Math.random()<Math.min(GACOR_CAP,MODES[mode].full*gF))special={kind:"full",animal:pickAnimal()};
  else if(!freeMode){const jp=rollJackpotSpin(gJ);if(jp)special={kind:"jp",tier:jp}}
  diagHL=!special;
  const gacorSpin=!special&&!freeMode&&(can("full")||can("jp"));   // gacor: hanya akun yang diizinkan admin
  seedResult(mode,!!special,gacorSpin,1);
  if(gacorSpin)for(let k=0;k<8&&!(countRows().length||diagRuns(board).length);k++)seedResult(mode,false,true);   // gacor: pastikan menang
  }
  render(true);
  await reelWait(850);            // tombol STOP boleh mempercepat berhentinya reel (hasil/animasi hadiah tetap penuh)
  SFX.land();

  if(special){
    const why=isFree?"FREE SPIN":"SPIN";
    win=special.kind==="full"?await awardFull(special.animal,why):await awardJackpot(special.tier,why,sp,special);
    document.getElementById("lastWin").textContent=money(win);
  }else{
    const rows=countRows();
    const scat=sp?sp.scatter:countScatter();
    const t=sp?(sp.rows?Object.assign(tier(sp.rows,mode),{mult:sp.mult}):null):tier(rows.length,mode);
    if(t){
      win=t.mult*bet;balance+=win;
      if(scatterMode)scatterTotal+=win;
      document.getElementById("msg").textContent=`${t.name} • ${rows.length} BARIS • +${money(win)}`;
      updateUI();updateBanner();
      await showOverlay(t.name,`${rows.length} BARIS PENUH • ×${t.mult} • +${money(win)}`,t.pct,rows.length>=2,win);
    }else if(sp?(!!sp.line&&diagRuns(board).length>0):diagRuns(board).length){
      const run=diagRuns(board).sort((x,y)=>y.cells.length-x.cells.length)[0];
      const L=Math.min(5,run.cells.length),k=MODES[mode].mult,R=(run.kind==="H"?HORIZ_PRIZE:DIAG_PRIZE)[L];
      const m=(sp&&sp.line)?sp.mult:Math.round(rnd(R[0],R[1])*k*100)/100;
      win=m*bet;balance+=win;
      if(scatterMode)scatterTotal+=win;
      document.getElementById("msg").textContent=`${run.kind==="H"?"HORIZONTAL":"DIAGONAL"} • ${L} GAMBAR • ${run.side==="L"?"KIRI→KANAN":"KANAN→KIRI"} • +${money(win)}`;
      updateUI();updateBanner();
      await showDiag(L,m,win,run.kind,run.side);
    }else{
      document.getElementById("msg").textContent=isFree?"SCATTER MODE — belum kena":"Tidak kena — CHIP berkurang";
      await sleep(260);
    }
    if(scat>=3){
      win+=await showScatter(scat);
    }
    document.getElementById("lastWin").textContent=money(win);
  }

  if(sp){balance=sp.balance;freeSpins=sp.fsEnd;stateRev++;updateUI()}
  if(scatterMode && freeSpins===0)await endScatterMode();
  if(freeSpins===0)clampBet();    // chip berubah setelah spin -> sesuaikan bet
  updateUI();
  await waitAudioIdle();          // jangan lanjut (termasuk auto spin) sebelum semua audio hadiah habis
  busy=false;syncSpinBtn();
  if(!isAdmin()&&freeSpins===0&&balance<BET_STEP)openBroke();
  try{roomAfterSpin({win,bet:spinBet,isFree,special})}catch(e){console.warn(e)}
  return win;
}
let autoLeft=null,autoRunning=false;      // autoLeft: null = AUTO tanpa batas, angka = sisa spin (pilihan 10/20/50/100/200/500)
function autoLabel(){
  syncSpinBtn();
  document.getElementById("auto").textContent=!auto?"AUTO":(autoLeft===null?"AUTO ON":"AUTO "+autoLeft);
  const n=document.getElementById("spinN"),counted=auto&&autoLeft!==null;
  n.classList.toggle("on",counted);
  n.querySelector("small").textContent=counted?autoLeft+"×":"AUTO";
}
function stopAuto(){auto=false;autoLeft=null;autoLabel()}
function startAuto(n){
  unlockAudio();
  auto=true;autoLeft=n>0?n:null;autoLabel();closeSpinPick();
  setMsg(n>0?`AUTO ${n}× SPIN dimulai`:"AUTO ON");
  autoLoop();
}
async function autoLoop(){
  if(autoRunning)return;autoRunning=true;
  try{
    while(auto){
      if(!busy){
        const wasFree=freeSpins>0,before=spinCount;
        await spin(wasFree);
        if(!auto)break;
        if(autoLeft!==null){
          if(!wasFree&&spinCount!==before)autoLeft--;      // free spin tidak mengurangi jatah
          if(autoLeft<=0&&freeSpins===0){stopAuto();setMsg("AUTO selesai");break}
          autoLabel();
        }
      }
      await sleep(350);
    }
  }finally{autoRunning=false}
}
/* ----- tombol SPIN: tap = spin, TAHAN = pilih jumlah auto spin; tombol ▾ di sampingnya juga membuka pilihan ----- */
const spinBtn=document.getElementById("spin"),pickEl=document.getElementById("spinPick");
let lpTimer=null,lpFired=false;
const lpClear=()=>{clearTimeout(lpTimer);lpTimer=null};
function openSpinPick(){unlockAudio();pickEl.hidden=false}
function closeSpinPick(){pickEl.hidden=true}
spinBtn.addEventListener("pointerdown",()=>{
  lpFired=false;lpClear();
  if(busy||auto)return;          // mode STOP: tidak ada long-press
  lpTimer=setTimeout(()=>{lpTimer=null;lpFired=true;try{if(navigator.vibrate)navigator.vibrate(30)}catch(e){}openSpinPick()},500);
});
["pointerup","pointerleave","pointercancel"].forEach(ev=>spinBtn.addEventListener(ev,lpClear));
spinBtn.addEventListener("contextmenu",e=>e.preventDefault());
spinBtn.addEventListener("click",()=>{
  if(lpFired){lpFired=false;return}
  if(busy||auto){                 // sedang spin / auto -> tombol ini adalah STOP
    const wasAuto=auto;
    stopAuto();closeSpinPick();
    if(reelSkip){reelSkip();setMsg(wasAuto?"STOP — AUTO dihentikan":"STOP")}
    else if(!busy)setMsg("AUTO dihentikan");
    return;
  }
  spin(freeSpins>0);
});
document.getElementById("spinN").addEventListener("click",()=>{pickEl.hidden?openSpinPick():closeSpinPick()});
pickEl.addEventListener("click",e=>{
  if(e.target.closest("[data-close]")){closeSpinPick();return}
  const b=e.target.closest("[data-n]");if(!b)return;
  startAuto(parseInt(b.dataset.n,10)||0);
});
document.addEventListener("pointerdown",e=>{if(!pickEl.hidden&&!e.target.closest("#spinPick,#spinN"))closeSpinPick()});
document.getElementById("auto").addEventListener("click",()=>{
  unlockAudio();
  if(auto)stopAuto();else startAuto(0);
});
document.getElementById("speed").addEventListener("click",()=>setSpeedIdx(SPEEDS.indexOf(SPD)+1));
document.getElementById("minus").addEventListener("click",()=>{
  if(busy)return;
  bet=freeMode?Math.max(BET_STEP,bet-BET_STEP):betLadderStep(-1);clampBet();updateUI();   // mode asli: loncat sesuai tangga bet (1M…2B)
});
document.getElementById("maxbet").addEventListener("click",()=>{
  if(busy)return;
  unlockAudio();
  bet=BET_MAX;clampBet();updateUI();   // bet tertinggi yang masih terjangkau chip (admin: batas maksimum)
});
document.getElementById("plus").addEventListener("click",()=>{
  if(busy)return;
  bet=freeMode?Math.min(BET_MAX,bet+BET_STEP):betLadderStep(1);clampBet();updateUI();   // tidak bisa melebihi chip
});
/* ===== BET CEPAT: tangga 1M–2B untuk tombol −/+, dan panel pilih bet (ketuk kotak BET) ===== */
const BET_LADDER=[1,2,3,5,10,20,30,50,100,200,300,500,1000,1500,2000].map(x=>x*1e6);
function betLadderStep(d){
  const L=BET_LADDER;
  if(d>0){for(const v of L)if(v>bet)return Math.min(v,BET_MAX);return BET_MAX}
  for(let i=L.length-1;i>=0;i--)if(L[i]<bet)return L[i];
  return L[0];
}
const betShort=n=>n>=1e9?(n/1e9)+"B":(n/1e6)+"M";
function betPanelEnsure(){
  let el=document.getElementById("betPanel");if(el)return el;
  el=document.createElement("div");el.id="betPanel";el.hidden=true;
  el.innerHTML=`<div class="bpBox"><div class="bpHead"><b>💰 PILIH BET</b><button type="button" data-x="1" aria-label="Tutup">✕</button></div>
  <div class="bpVal" id="bpVal"></div>
  <input id="bpRange" type="range" min="0" max="1000" step="1" aria-label="Geser bet">
  <div class="bpMM"><span>1M</span><span>2B</span></div>
  <div class="bpGrid" id="bpGrid">${BET_LADDER.map(v=>`<button type="button" data-v="${v}">${betShort(v)}</button>`).join("")}</div>
  <div class="bpRow"><button type="button" data-a="half">½</button><button type="button" data-a="dbl">×2</button><button type="button" data-a="max">MAX</button><button type="button" data-a="ok" class="ok">OK</button></div></div>`;
  document.body.appendChild(el);
  const val=el.querySelector("#bpVal"),rg=el.querySelector("#bpRange");
  const lo=Math.log(1e6),hi=Math.log(2e9);
  const toPos=b=>Math.round((Math.log(Math.max(1e6,b))-lo)/(hi-lo)*1000);
  const fromPos=p=>{const raw=Math.exp(lo+(hi-lo)*p/1000);const mag=Math.pow(10,Math.floor(Math.log10(raw))-1);return Math.min(2e9,Math.max(1e6,Math.round(raw/mag)*mag))};   // dibulatkan 2 angka penting
  const apply=v=>{bet=Math.max(1e6,Math.min(BET_MAX,Math.round(v/1e6)*1e6));clampBet();updateUI();sync()};
  const sync=()=>{val.textContent=money(bet);rg.value=toPos(bet);el.querySelectorAll("#bpGrid button").forEach(b=>b.classList.toggle("on",+b.dataset.v===bet))};
  rg.addEventListener("input",()=>apply(fromPos(+rg.value)));
  el.addEventListener("click",e=>{
    const b=e.target.closest("button");
    if(e.target===el||(b&&b.dataset.x)){el.hidden=true;return}
    if(!b)return;
    if(b.dataset.v)apply(+b.dataset.v);
    else if(b.dataset.a==="half")apply(bet/2);
    else if(b.dataset.a==="dbl")apply(bet*2);
    else if(b.dataset.a==="max"){bet=BET_MAX;clampBet();updateUI();sync()}
    else if(b.dataset.a==="ok")el.hidden=true;
    try{UISND.tick()}catch(_){}
  });
  el._sync=sync;return el;
}
document.querySelector(".betbox").addEventListener("click",()=>{
  if(busy||freeMode||auto)return;
  const el=betPanelEnsure();el._sync();el.hidden=false;
});
document.getElementById("voiceTest").addEventListener("click",e=>{const b=e.target.closest("button");if(!b||!isAdmin())return;unlockAudio();if(b.dataset.l==="alarm")SFX.scatter();else speakWin(+b.dataset.l)});
/* ===== SETTING ATAS (gabungan profil, suara, lobi, login, dll.) ===== */
(function(){
  const mb=document.getElementById("menuBtn"),mp=document.getElementById("menuPanel"),dot=document.getElementById("menuDot"),daily=document.getElementById("dailyBtn");
  function setMenu(o){mp.hidden=!o;mb.setAttribute("aria-expanded",o?"true":"false")}
  mb.addEventListener("click",e=>{e.stopPropagation();setMenu(mp.hidden)});
  mp.addEventListener("click",e=>{if(e.target.closest("button"))setTimeout(()=>setMenu(false),0)});   // suara tetap terbuka agar bisa on/off
  document.addEventListener("pointerdown",e=>{if(!mp.hidden&&!e.target.closest("#menuPanel,#menuBtn"))setMenu(false)});
  document.addEventListener("keydown",e=>{if(e.key==="Escape")setMenu(false)});
  const sync=()=>{dot.hidden=daily.hidden};sync();      // titik merah: hadiah harian siap diambil
  new MutationObserver(sync).observe(daily,{attributes:true,attributeFilter:["hidden"]});
})();
/* ===== TABEL HADIAH (dipindah ke menu) ===== */
document.getElementById("tableBtn").addEventListener("click",()=>{
  openModal(`<h2>📖 TABEL HADIAH</h2><div class="fulltable" style="font-size:13px;justify-content:center">${document.getElementById("fullTable").innerHTML}</div><button class="btn small" type="button" style="font-size:15px" onclick="closeModal()">TUTUP</button>`);
});

function tmo(p,ms,label){let t;return Promise.race([Promise.resolve(p),new Promise((_,rj)=>{t=setTimeout(()=>rj({code:"timeout",message:(label||"proses")+" terlalu lama (>"+Math.round(ms/1000)+" dtk) — cek koneksi / Rules"}),ms)})]).finally(()=>clearTimeout(t))}
/* ===== PANEL ADMIN: atur izin tiap akun (kirim chip / full gambar / jackpot) — lewat server Cloudflare, tanpa Firebase ===== */
let admT=null,admAcc=[],admErr="",admSaving=false;   // admT: akun yang sedang diedit {pid,name,perm,luck}
function permOf(x){return Object.assign({},DEFAULT_PERM,x||{})}
function permBadge(p){return p?(p.send?"📤":"")+(p.full?"🖼️":"")+(p.jp?"🎰":""):""}
function admLeft(u){if(!u)return"tanpa batas waktu";const m=Math.ceil((u-Date.now())/60000);return m<=0?"habis":m>=1440?Math.floor(m/1440)+" hari "+Math.floor(m%1440/60)+" jam":m>=60?Math.floor(m/60)+" jam "+m%60+" mnt":m+" mnt"}
function admMinsRow(){const o=[[30,"30 mnt"],[60,"1 jam"],[180,"3 jam"],[1440,"24 jam"],[0,"Tanpa batas"]];
  return `<div class="admRow" style="flex-wrap:wrap;gap:6px"><b style="width:100%">⏱ Durasi gacor (mulai dari tombol SIMPAN)</b>${o.map(([m,l])=>`<button type="button" class="tg ${admT.mins===m?"on":""}" onclick="admT.mins=${m};admRender()">${l}</button>`).join("")}</div>`}
function admTg(k,label){return `<div class="admRow"><b>${label}</b><button class="tg ${admT.perm[k]?"on":""}" type="button" onclick="admToggle('${k}')">${admT.perm[k]?"ON":"OFF"}</button></div>`}
function admListHtml(){
  if(admErr)return `<div style="font-size:12px;color:#ff8a8a">${esc(admErr)}</div>`;
  const btn=a=>`<button class="ubtn" type="button" data-pid="${esc(a.id)}" onclick="admPick(this.dataset.pid)">${esc(a.name)} • ${esc(a.id)} ${permBadge(a.perms)}</button>`;
  const ok=admAcc.filter(a=>permBadge(a.perms)),rest=admAcc.filter(a=>!permBadge(a.perms));
  return `<b style="color:#fff;font-size:12px">✅ ID yang diizinkan (semua perangkat)</b><div class="admList">${ok.map(btn).join("")||"<div style='font-size:12px;color:#ffd978'>Belum ada</div>"}</div>
  <b style="color:#fff;font-size:12px">🌐 Semua akun</b><div class="admList">${rest.map(btn).join("")||"<div style='font-size:12px;color:#ffd978'>Belum ada / memuat…</div>"}</div>`;
}
function admRender(msg){
  const editor=admT?`<div class="pstats" style="grid-template-columns:1fr"><div>${esc(admT.name)} • ID ${esc(admT.pid)}${(admT.perm.full||admT.perm.jp)?" • gacor sisa: "+admLeft(admT.until):""}</div></div>
    ${admTg("send","📤 Boleh kirim chip")}${admTg("full","🖼️ GACOR Full Gambar (peluang dinaikkan)")}${admTg("jp","🎰 GACOR Jackpot (peluang dinaikkan)")}${admMinsRow()}
    <button class="btn spin" type="button" style="font-size:16px" onclick="admSave()">💾 SIMPAN IZIN</button>
    <div class="rowin"><input id="admNewPw" type="text" placeholder="Sandi baru untuk pemain ini" autocomplete="off" autocapitalize="off"><button class="ubtn gold" type="button" onclick="admReset()">RESET SANDI</button></div>`
    :`<p class="pwNote">Cari pemain lewat ID/username, atau pilih dari daftar di bawah.</p>`;
  openModal(`<h2>🛠 PANEL ADMIN</h2>
  <div class="rowin"><input id="admQ" type="text" placeholder="ID pemain / username" autocapitalize="off" autocomplete="off" onkeydown="if(event.key==='Enter')admSearch()"><button class="ubtn gold" type="button" onclick="admSearch()">CARI</button></div>
  <div id="admMsg" class="pwErr" style="color:#ffd978">${msg||""}</div>
  ${editor}
  <div id="admOnl">${admListHtml()}</div>
  <button class="btn small" type="button" style="font-size:14px" onclick="closeModal()">TUTUP</button>`);
}
function openAdminPanel(){if(!isAdmin())return;admT=null;admRender();admLoad()}
async function admApi(path,body){
  if(!admToken)return{ok:false,status:401,j:{error:"Sesi admin habis — login admin lagi"}};
  const r=await apiCall(path,body,admToken);
  if(r.status===401||r.status===403)r.j={error:"Sesi admin habis — login admin lagi"};
  return r;
}
async function admLoad(){
  const r=await admApi("/admin/accounts");
  if(r.ok){admErr="";admAcc=Array.isArray(r.j.accounts)?r.j.accounts:[]}
  else admErr="Gagal memuat daftar akun: "+(r.j.error||("HTTP "+r.status));
  const el=document.getElementById("admOnl");if(el)el.innerHTML=admListHtml();
  return r.ok;
}
function admPick(pid){
  const a=admAcc.find(x=>String(x.id)===String(pid));if(!a)return;
  admT={pid:a.id,name:a.name,perm:permOf(a.perms),until:a.gacorUntil|0,mins:60};admRender();
}
async function admSearch(){
  const q=document.getElementById("admQ").value.trim().replace(/^#/,"");if(!q)return;
  document.getElementById("admMsg").textContent="Mencari…";
  await admLoad();
  const lq=q.toLowerCase();
  const a=admAcc.find(x=>String(x.id)===q||String(x.name).toLowerCase()===lq);
  if(!a){admT=null;admRender(admErr?"":"Pemain tidak ditemukan");return}
  admT={pid:a.id,name:a.name,perm:permOf(a.perms),until:a.gacorUntil|0,mins:60};admRender();
}
function admToggle(k){if(!admT)return;admT.perm[k]=!admT.perm[k];admRender()}
async function admReset(){
  if(!admT||!isAdmin())return;
  const el=document.getElementById("admNewPw"),m=document.getElementById("admMsg"),p=el?el.value:"";
  const say=(t,c)=>{if(m){m.style.color=c;m.textContent=t}};
  if(p.length<4||p.length>72){say("Sandi baru 4–72 karakter","#ff8a8a");return}
  say("Menyimpan…","#ffd978");
  const r=await admApi("/admin/resetpw",{id:admT.pid,pass:p});
  if(r.ok&&r.j&&r.j.ok){if(el)el.value="";say("✅ Sandi "+admT.name+" direset. Beri tahu pemain sandi barunya.","#9dffb0")}
  else say("❌ "+((r.j&&r.j.error)||"Gagal"),"#ff8a8a");
}
async function admSave(){
  if(!admT||!isAdmin()||admSaving)return;
  admSaving=true;
  const t=admT,perm={send:!!t.perm.send,full:!!t.perm.full,jp:!!t.perm.jp};
  const mm=document.getElementById("admMsg");if(mm){mm.style.color="#ffd978";mm.textContent="Menyimpan…"}
  const r=await admApi("/admin/perms",{id:t.pid,send:perm.send,full:perm.full,jp:perm.jp,mins:t.mins|0});
  admSaving=false;
  const p=r.ok&&r.j&&r.j.perms;
  if(!p||!!p.send!==perm.send||!!p.full!==perm.full||!!p.jp!==perm.jp){
    admT=t;admRender();
    const m=document.getElementById("admMsg");if(m){m.style.color="#ff8a8a";m.textContent="❌ Izin BELUM tersimpan: "+((r.j&&r.j.error)||"respons server tidak cocok")}
    return;
  }
  const i=admAcc.findIndex(x=>String(x.id)===String(t.pid));if(i>=0){admAcc[i].perms=perm;admAcc[i].gacorUntil=r.j.gacorUntil|0;t.until=r.j.gacorUntil|0}
  admT=t;
  admRender("✅ "+esc(t.name)+": izin tersimpan di server (aktif di pemain dalam ±2 menit atau saat login)");
  admLoad();
}
/* ===== AUDIO TOMBOL (UI) ===== */
const UISND={
  _q(fn){const k=noTrack;noTrack=true;try{fn()}finally{noTrack=k}},   // suara UI tidak mengganggu pelacak suara hadiah
  tick(){this._q(()=>{tone(1250,0,.045,"triangle",.09);hat(0,.03)})},
  up(){this._q(()=>{tone(700,0,.06,"triangle",.11);tone(1050,.05,.08,"triangle",.1)})},
  down(){this._q(()=>{tone(900,0,.06,"triangle",.11);tone(600,.05,.08,"triangle",.1)})},
  deny(){this._q(()=>{tone(180,0,.12,"square",.07,-50)})},
  max(){this._q(()=>{[523,659,784,1047,1319].forEach((f,i)=>{tone(f,i*.05,.14,"triangle",.11);tone(f*2,i*.05,.07,"sine",.04)});coinPing(.25,.07);coinPing(.3,.06)})},
  auto(on){this._q(()=>{if(on){tone(660,0,.07,"square",.06);tone(990,.07,.1,"square",.06)}else{tone(990,0,.07,"square",.06);tone(660,.07,.1,"square",.06)}})},
  speed(){this._q(()=>{tone(500,0,.05,"square",.06);tone(800,.05,.07,"square",.06)})},
  open(){this._q(()=>{tone(600,0,.06,"sine",.1);tone(900,.06,.09,"sine",.1)})},
  close(){this._q(()=>{tone(800,0,.06,"sine",.09);tone(500,.06,.09,"sine",.09)})}
};
let _uiBet=0,_uiAuto=false;
document.addEventListener("click",e=>{_uiBet=bet;_uiAuto=auto},true);   // keadaan sebelum tombol diproses
document.addEventListener("click",e=>{
  const b=e.target.closest("button,#soundToggle");if(!b||!voiceOn&&b.id!=="soundToggle")return;
  const id=b.id;
  try{
    if(id==="spin"||id==="jpClaim"||b.closest("#voiceTest"))return;      // sudah punya suara sendiri
    if(id==="minus"||id==="plus"){
      if(busy||bet===_uiBet)UISND.deny();else if(bet>_uiBet)UISND.up();else UISND.down();
    }else if(id==="maxbet"){
      if(busy||bet===_uiBet)UISND.deny();else UISND.max();
    }else if(id==="auto"){UISND.auto(auto&&!_uiAuto)}
    else if(id==="speed"){UISND.speed()}
    else if(id==="spinN"){pickEl.hidden?UISND.close():UISND.open()}
    else if(b.dataset&&b.dataset.n!==undefined){UISND.auto(true)}
    else if(b.dataset&&b.dataset.close){UISND.close()}
    else if(id==="menuBtn"){document.getElementById("menuPanel").hidden?UISND.close():UISND.open()}
    else if(id==="soundToggle"){if(voiceOn)UISND.open()}
    else UISND.tick();                                                  // tombol lain (login, profil, harian, modal, dll.)
  }catch(err){}
});
function toggleSound(){setVoice(!voiceOn)}
document.getElementById("soundToggle").addEventListener("click",toggleSound);
document.getElementById("soundToggle").addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();toggleSound();}});
document.addEventListener("keydown",e=>{
  if(e.code==="Space" && document.activeElement===document.body){e.preventDefault();spin(freeSpins>0);}
});
