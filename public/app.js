import { createMatch, addPlayer, stepMatch, resetPositions, normalizePlayerNumber, STADIUMS } from './physics.js';

const $ = s => document.querySelector(s);
const menu = $('#menu'), game = $('#game'), canvas = $('#field'), ctx = canvas.getContext('2d');
let stored = {};
try { stored = JSON.parse(localStorage.getItem('kickoff-settings') || '{}') || {}; } catch { stored = {}; }
const FIXED_DT=1/60;
let match, socket, local = false, host = false, myId = '', keys = new Set(), last = performance.now(), accumulator=0, targets, toastTimer, pendingBindings = false;
let bindings = {...{up:'w',left:'a',down:'s',right:'d',kick:' '},...(stored.bindings || {})};
const keyName = k => k === ' ' ? 'Space' : k.length === 1 ? k.toUpperCase() : k;
function movement() {
 const has = (action, arrow) => keys.has(bindings[action]) || keys.has(arrow);
 const x=Number(has('right','ArrowRight'))-Number(has('left','ArrowLeft'));
 const y=Number(has('down','ArrowDown'))-Number(has('up','ArrowUp'));
 const n=Math.hypot(x,y)||1;
 return {x:x/n,y:y/n,kick:keys.has(bindings.kick)};
}
function matchOptions() { return { time:Number($('#duration').value)||300, goalLimit:Number($('#goalLimit').value)||0 }; }
function updateStadiumPreview(){const name=$('#stadium').value,field=STADIUMS[name]||STADIUMS.Classic;$('#previewName').textContent=name;$('#previewDimensions').textContent=field.width+' x '+field.height+' units';$('#previewPitch').style.setProperty('--pitch-grass',field.grass);$('#previewPitch').style.setProperty('--pitch-stripe',field.stripe);$('#previewPitch').classList.toggle('rounded-preview',!!field.rounded);$('#previewPitch').classList.toggle('hockey-preview',field.style==='hockey');}
$('#stadium').addEventListener('change',updateStadiumPreview);updateStadiumPreview();
let savedPlayerNumber='1';try{savedPlayerNumber=normalizePlayerNumber(localStorage.getItem('kickoff-player-number'),'1');}catch{}
$('#playerNumber').value=savedPlayerNumber;$('#numberSetting').value=savedPlayerNumber;
function playerNumberValue(){return normalizePlayerNumber($('#playerNumber').value,'1');}
$('#playerNumber').addEventListener('change',()=>{const n=playerNumberValue();$('#playerNumber').value=n;$('#numberSetting').value=n;try{localStorage.setItem('kickoff-player-number',n);}catch{}});
function enter(m, online = false, code = 'LOCAL') {
 match=m;local=!online;if(!online)myId='local';menu.classList.add('hidden');game.classList.remove('hidden');$('#roomLabel').textContent=code;const stadiumName=m.stadium||m.field.name||$('#stadium').value;$('#activeStadium').textContent=stadiumName.toUpperCase();canvas.style.aspectRatio=m.field.width+' / '+m.field.height;
 $('#connection').textContent=online?'● CONECTADO':'● LOCAL';$('#hostControls').classList.toggle('hidden',!host);
 if(local){addPlayer(match,'local',$('#playerName').value||'Jugador',0,playerNumberValue());addPlayer(match,'bot','Rival de práctica',1,'2');}
 $('#numberSetting').value=local?match.players[0].number:playerNumberValue();
 renderRosters();
 if(local)systemMessage('Partida iniciada');
 keys.clear();last=performance.now();accumulator=0;requestAnimationFrame(draw);
}
function botInput(bot, ball, field) {
 // Protect the right half, then approach behind the ball to aim at the left goal.
 let tx,ty;
 if(ball.x>field.width*.58){const ax=ball.x-field.width*.06,ay=ball.y-field.height/2,n=Math.hypot(ax,ay)||1;tx=ball.x+ax/n*(bot.r+ball.r+5);ty=ball.y+ay/n*(bot.r+ball.r+5);}
 else{tx=field.width*.72;ty=Math.max(field.height*.18,Math.min(field.height*.82,ball.y+(ball.vy||0)*.22));}
 const dx=tx-bot.x,dy=ty-bot.y,d=Math.hypot(dx,dy)||1;
 return {x:d<8?0:dx/d,y:d<8?0:dy/d,kick:Math.hypot(ball.x-bot.x,ball.y-bot.y)<bot.r+ball.r+24};
}
function draw(now) {
 if(game.classList.contains('hidden')) return;
 const elapsed=Math.max(0,Math.min(.25,(now-last)/1000));last=now;
 if(local){accumulator=Math.min(accumulator+elapsed,FIXED_DT*8);let steps=0;while(accumulator>=FIXED_DT&&steps<8){if(!match.paused&&!match.over){match.players[0].input=movement();match.players[1].input=botInput(match.players[1],match.ball,match.field);}const scored=stepMatch(match,FIXED_DT);if(scored){showToast('¡GOL!');systemMessage(`¡Gol! Rojo ${match.score[0]} – Azul ${match.score[1]}`);}accumulator-=FIXED_DT;steps++;}}else accumulator=0;
 if(targets&&socket){const a=targets.prev,b=targets.next,alpha=Math.max(0,Math.min(1,(now-targets.at)/70));match={...b,players:b.players.map(p=>{const q=a.players.find(z=>z.id===p.id)||p;return{...p,x:q.x+(p.x-q.x)*alpha,y:q.y+(p.y-q.y)*alpha};}),ball:{...b.ball,x:a.ball.x+(b.ball.x-a.ball.x)*alpha,y:a.ball.y+(b.ball.y-a.ball.y)*alpha}};}
 render();syncEventButtons();requestAnimationFrame(draw);
}
function renderRosters(){
 if(!match)return;
 const lists={0:$('#redRoster'),1:$('#blueRoster'),2:$('#spectatorRoster')};
 for(const list of Object.values(lists))list.replaceChildren();
 for(const p of match.players){
  const row=document.createElement('div');row.className='player-row';row.textContent=p.name+(p.id===myId?' (tú)':'');
  row.draggable=host;row.dataset.playerId=p.id;
  if(host)row.addEventListener('dragstart',e=>{e.dataTransfer.setData('text/plain',p.id);e.dataTransfer.effectAllowed='move';});
  (lists[p.team]||lists[2]).append(row);
 }
}
for(const lane of document.querySelectorAll('[data-drop-team]')){
 lane.addEventListener('dragover',e=>{if(host){e.preventDefault();lane.classList.add('drop-active');}});
 lane.addEventListener('dragleave',()=>lane.classList.remove('drop-active'));
 lane.addEventListener('drop',e=>{if(!host)return;e.preventDefault();lane.classList.remove('drop-active');const playerId=e.dataTransfer.getData('text/plain'),team=Number(lane.dataset.dropTeam);if(!playerId)return;if(socket)socket.emit('assignTeam',{playerId,team});else setPlayerTeam(playerId,team);});
}
function setPlayerTeam(id,team){const p=match?.players.find(q=>q.id===id);if(!p)return;const changed=p.team!==team;p.team=team;p.vx=p.vy=0;p.kickSpent=p.kickReady=p.kickHeld=false;p.input={x:0,y:0,kick:false};p.x=match.field.width*(team===1?.72:.28);p.y=match.field.height/2;renderRosters();if(changed)systemMessage(`${p.name} fue movido a ${['Rojo','Azul','Espectadores'][team]}`);}
function render(){
 if(!match)return;
 const f=match.field,dpr=devicePixelRatio||1,w=canvas.clientWidth,h=canvas.clientHeight;if(!w||!h)return;
 if(canvas.width!==w*dpr||canvas.height!==h*dpr){canvas.width=w*dpr;canvas.height=h*dpr;}
 const zoom=window.kickoffZoom||1,scale=Math.min(canvas.width/f.width,canvas.height/f.height)*zoom,focus=match.players.find(p=>p.id===myId&&p.team!==2)||{x:f.width/2,y:f.height/2},tx=canvas.width/2-focus.x*scale,ty=canvas.height/2-focus.y*scale;ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle=f.grass||'#234a37';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.setTransform(scale,0,0,scale,tx,ty);
 const wall=f.wall||24,left=wall,top=wall,right=f.width-wall,bottom=f.height-wall,insideW=right-left,insideH=bottom-top;
 ctx.fillStyle=f.border||'#1a3729';ctx.fillRect(0,0,f.width,f.height);ctx.save();
 if(f.rounded&&ctx.roundRect){ctx.beginPath();ctx.roundRect(left,top,insideW,insideH,Math.min(insideH*.12,72));ctx.clip();}
 ctx.fillStyle=f.grass||'#234a37';ctx.fillRect(left,top,insideW,insideH);
 const stripeCount=f.style==='hockey'?8:f.style==='huge'?14:10;for(let i=0;i<stripeCount;i++){if(i%2===0){ctx.fillStyle=f.stripe||'#2a523e';ctx.fillRect(left+insideW*i/stripeCount,top,insideW/stripeCount,insideH);}}
 ctx.strokeStyle=f.line||'#b5d2b5';ctx.lineWidth=Math.max(2,f.width/600);ctx.strokeRect(left,top,insideW,insideH);
 const mid=f.width/2,cy=f.height/2,goalTop=cy-f.goalWidth/2;
 if(f.style==='hockey'){
  ctx.strokeStyle='#eaf1ee';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(mid,top);ctx.lineTo(mid,bottom);ctx.stroke();ctx.strokeStyle='#d85355';ctx.lineWidth=7;ctx.beginPath();ctx.moveTo(mid,top);ctx.lineTo(mid,bottom);ctx.stroke();
  for(const x of [left+insideW*.28,left+insideW*.72]){ctx.strokeStyle='#66a9d5';ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(x,top);ctx.lineTo(x,bottom);ctx.stroke();}
  ctx.strokeStyle='#eaf1ee';ctx.lineWidth=3;for(const x of [left+insideW*.16,left+insideW*.5,left+insideW*.84])for(const y of [top+insideH*.25,top+insideH*.75]){ctx.beginPath();ctx.arc(x,y,insideH*.035,0,Math.PI*2);ctx.stroke();}
  ctx.fillStyle='#1b3742';ctx.fillRect(left,goalTop,wall,f.goalWidth);ctx.fillRect(right-wall,goalTop,wall,f.goalWidth);
  for(const x of [left+wall,right-wall]){ctx.strokeStyle='#df5d5a';ctx.lineWidth=3;ctx.beginPath();ctx.arc(x,cy,insideH*.16,x<mid?-Math.PI/2:Math.PI/2,x<mid?Math.PI/2:Math.PI*1.5);ctx.stroke();}
 }else{
  ctx.beginPath();ctx.moveTo(mid,top);ctx.lineTo(mid,bottom);ctx.stroke();ctx.beginPath();ctx.arc(mid,cy,Math.min(insideH*.17,85),0,Math.PI*2);ctx.stroke();const boxW=insideW*.12,boxH=f.goalWidth*.9;ctx.strokeRect(left,cy-boxH/2,boxW,boxH);ctx.strokeRect(right-boxW,cy-boxH/2,boxW,boxH);ctx.beginPath();ctx.arc(mid,cy,4,0,Math.PI*2);ctx.fillStyle=f.line||'#dceadc';ctx.fill();ctx.fillStyle=f.border||'#1a3729';ctx.fillRect(0,goalTop,wall,f.goalWidth);ctx.fillRect(right,goalTop,wall,f.goalWidth);
  if(f.rounded){ctx.beginPath();ctx.arc(mid,cy,insideH*.28,0,Math.PI*2);ctx.setLineDash([7,9]);ctx.stroke();ctx.setLineDash([]);}
 }
 ctx.restore();
 // Rounded, high contrast goal frames; the open face sits on the same goal line as the physics.
 const drawGoal=(side,accent)=>{const depth=wall+18,gx=side==='left'?0:right-18,gy=goalTop,gh=f.goalWidth,radius=Math.min(10,gh*.08),lw=Math.max(6,f.width/180),openX=side==='left'?gx+depth:gx,backX=side==='left'?gx:gx+depth;ctx.save();ctx.beginPath();if(ctx.roundRect)ctx.roundRect(gx,gy,depth,gh,radius);else ctx.rect(gx,gy,depth,gh);ctx.clip();ctx.fillStyle='#08140fbb';ctx.fillRect(gx,gy,depth,gh);ctx.strokeStyle='#d8e6dc55';ctx.lineWidth=1.5;for(let i=1;i<5;i++){const x=gx+depth*i/5;ctx.beginPath();ctx.moveTo(x,gy);ctx.lineTo(x,gy+gh);ctx.stroke();}for(let i=1;i<5;i++){const y=gy+gh*i/5;ctx.beginPath();ctx.moveTo(gx,y);ctx.lineTo(gx+depth,y);ctx.stroke();}ctx.restore();ctx.save();ctx.beginPath();const topY=gy+lw/2,bottomY=gy+gh-lw/2,corner=radius; if(side==='left'){ctx.moveTo(openX,topY);ctx.lineTo(gx+corner,topY);ctx.quadraticCurveTo(gx,topY,gx,gy+corner);ctx.lineTo(gx,gy+gh-corner);ctx.quadraticCurveTo(gx,bottomY,gx+corner,bottomY);ctx.lineTo(openX,bottomY);}else{ctx.moveTo(openX,topY);ctx.lineTo(gx+depth-corner,topY);ctx.quadraticCurveTo(gx+depth,topY,gx+depth,gy+corner);ctx.lineTo(gx+depth,gy+gh-corner);ctx.quadraticCurveTo(gx+depth,bottomY,gx+depth-corner,bottomY);ctx.lineTo(openX,bottomY);}ctx.lineJoin='round';ctx.lineCap='round';ctx.lineWidth=lw;ctx.strokeStyle='#f6fff7';ctx.shadowColor=accent;ctx.shadowBlur=10;ctx.stroke();ctx.shadowBlur=0;ctx.beginPath();ctx.moveTo(backX,gy+corner);ctx.lineTo(backX,gy+gh-corner);ctx.lineWidth=Math.max(2,lw*.38);ctx.strokeStyle=accent;ctx.stroke();ctx.restore();};
 drawGoal('left','#ff655e');drawGoal('right','#53a8ff');
 for(const p of match.players){if(p.team===2)continue;ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,Math.PI*2);ctx.fillStyle=p.team?'#4b9ff0':'#ee5b58';ctx.fill();ctx.lineWidth=2;ctx.strokeStyle='#ffffffaa';ctx.stroke();if(p.kickReady||p.kickFlash>0){ctx.beginPath();ctx.arc(p.x,p.y,p.r+3,0,Math.PI*2);ctx.lineWidth=3;ctx.strokeStyle='#fff';ctx.shadowColor='#fff';ctx.shadowBlur=8;ctx.stroke();ctx.shadowBlur=0;}if(p.id===myId){ctx.beginPath();ctx.arc(p.x,p.y,p.r+6,0,Math.PI*2);ctx.lineWidth=2;ctx.strokeStyle='#c4f36b';ctx.stroke();}ctx.fillStyle='#fff';ctx.font='bold 11px Manrope';ctx.textAlign='center';ctx.fillText(p.number||'1',p.x,p.y+4);ctx.font='12px Manrope';ctx.fillText(p.name,p.x,p.y-p.r-7);}
 const b=match.ball;ctx.beginPath();ctx.ellipse(b.x+2,b.y+4,b.r*1.25,b.r*.65,0,0,Math.PI*2);ctx.fillStyle='#08150e66';ctx.fill();ctx.beginPath();ctx.arc(b.x,b.y,b.r,0,Math.PI*2);ctx.fillStyle=b.charged?'#f44747':'#f3f1e9';ctx.fill();ctx.lineWidth=2;ctx.strokeStyle='#d1d6d0';ctx.stroke();
 $('#scoreRed').textContent=match.score[0];$('#scoreBlue').textContent=match.score[1];$('#clock').textContent=String(Math.floor(match.time/60)).padStart(2,'0')+':'+String(Math.floor(match.time%60)).padStart(2,'0');$('#pauseBtn').textContent=match.paused?'Reanudar':'Pausar';const status=$('#matchStatus');status.textContent=match.over?'PARTIDO TERMINADO':match.paused?'PARTIDO PAUSADO':'EN JUEGO';status.classList.toggle('stopped',match.over||match.paused);const arrows={up:'ArrowUp',left:'ArrowLeft',down:'ArrowDown',right:'ArrowRight'};for(const kbd of document.querySelectorAll('[data-action]')){const action=kbd.dataset.action;kbd.textContent=keyName(bindings[action]);kbd.classList.toggle('active-key',keys.has(bindings[action])||keys.has(arrows[action]));}if(match.over&&!$('#toast').classList.contains('hidden'))return;if(match.over)showToast('FIN DEL PARTIDO');
}
function showToast(t){const el=$('#toast');el.textContent=t;el.classList.remove('hidden');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.add('hidden'),2200);}
function syncEventButtons(){if(!match?.events)return;for(const [id,key] of [['powerEventBtn','powerShots'],['curveEventBtn','curveShots'],['fastPitchBtn','fastPitch'],['giantBallBtn','giantBall'],['superBounceBtn','superBounce'],['reverseControlsBtn','reverseControls']])$(`#${id}`).classList.toggle('event-active',!!match.events[key]);$('#lockTeamsBtn').textContent=match.teamsLocked?'Desbloquear equipos':'Bloquear equipos';$('#lockTeamsBtn').classList.toggle('event-active',!!match.teamsLocked);$('#kickRateSelect').value=String(match.kickRate??.18);}
function connect(action, opts) {
 if(socket)socket.disconnect();socket=io();targets=null;
 $('#createBtn').disabled=true;$('#joinBtn').disabled=true;$('#connection').textContent='● CONECTANDO';
 socket.once('connect',()=>socket.emit(action,opts,r=>{if(r.error){alert(r.error);socket.disconnect();socket=null;$('#createBtn').disabled=false;$('#joinBtn').disabled=false;$('#connection').textContent='● SIN CONEXIÓN';return;}host=!!r.host;myId=socket.id;enter(createMatch(r.stadium||opts.stadium,opts),true,r.code);$('#hostControls').classList.toggle('hidden',!host);}));
 socket.on('host',isHost=>{host=!!isHost;$('#hostControls').classList.toggle('hidden',!host);renderRosters();if(host)showToast('Ahora eres anfitrión');});
 socket.on('state',s=>{if(!targets){targets={prev:s,next:s,at:performance.now()};match={...s};renderRosters();}else{if(s.score[0]!==targets.next.score[0]||s.score[1]!==targets.next.score[1])showToast('¡GOL!');targets.prev=targets.next;targets.next=s;targets.at=performance.now();}});
 socket.on('roster',ps=>{if(!match)return;match.players=ps.map(p=>{const old=match.players.find(q=>q.id===p.id);return old?{...old,...p}:{...p,x:Number.isFinite(p.x)?p.x:match.field.width*(p.team===1?.72:.28),y:Number.isFinite(p.y)?p.y:match.field.height/2,vx:p.vx||0,vy:p.vy||0,r:match.field.playerRadius};});renderRosters();});
 socket.on('chat',m=>message(m.name,m.text,!!m.system));
 socket.on('connect_error',()=>{if(game.classList.contains('hidden'))alert('No se pudo conectar. Comprueba que el servidor esté iniciado con npm start.');else showToast('No se pudo conectar al servidor');$('#createBtn').disabled=false;$('#joinBtn').disabled=false;$('#connection').textContent='● SIN CONEXIÓN';});
 socket.on('disconnect',()=>{if(!game.classList.contains('hidden'))showToast('Conexión perdida');$('#createBtn').disabled=false;$('#joinBtn').disabled=false;$('#connection').textContent='● SIN CONEXIÓN';});
}
$('#localBtn').onclick=()=>{host=true;enter(createMatch($('#stadium').value,matchOptions()));};
$('#createBtn').onclick=()=>connect('createRoom',{name:$('#roomName').value.trim()||'Kickoff Arena',playerName:$('#playerName').value,number:playerNumberValue(),stadium:$('#stadium').value,...matchOptions(),public:$('#isPublic').checked,password:$('#createPassword').value});
$('#joinBtn').onclick=()=>connect('joinRoom',{code:$('#roomCode').value.trim().toUpperCase(),password:$('#roomPassword').value,playerName:$('#playerName').value,number:playerNumberValue()});
function sendInput(){if(socket&&match)socket.emit('input',movement());}
window.addEventListener('keydown',e=>{if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(e.key))e.preventDefault();const key=e.key===' '? ' ':e.key.length===1?e.key.toLowerCase():e.key;if(pendingBindings){if(!['Escape','Tab'].includes(e.key)){const action=$('#bindingAction').value;const previous=Object.keys(bindings).find(k=>bindings[k]===key);if(previous)bindings[previous]=bindings[action];bindings[action]=key;localStorage.setItem('kickoff-settings',JSON.stringify({bindings}));renderBindings();pendingBindings=false;}return;}if(e.target instanceof HTMLInputElement||e.target instanceof HTMLTextAreaElement)return;keys.add(key);sendInput();});
function toggleHud(){const open=game.classList.toggle('hud-open');$('#hudToggle').innerHTML=open?'Cerrar <kbd>Esc</kbd>':'Interfaz <kbd>Esc</kbd>';$('#hudToggle').setAttribute('aria-label',open?'Ocultar interfaz':'Mostrar interfaz');}
$('#hudToggle').onclick=toggleHud;
window.addEventListener('keydown',e=>{if(e.key==='Enter'&&!game.classList.contains('hidden')&&document.activeElement!==$('#chatInput')&&!(e.target instanceof HTMLInputElement)&&!(e.target instanceof HTMLTextAreaElement)){e.preventDefault();$('#chatInput').focus();}});
window.addEventListener('keydown',e=>{if(e.key!=='Escape'||game.classList.contains('hidden'))return;e.preventDefault();if(!$('#settingsModal').classList.contains('hidden')){$('#settingsModal').classList.add('hidden');pendingBindings=false;return;}if(!$('#roomsModal').classList.contains('hidden')){$('#roomsModal').classList.add('hidden');return;}toggleHud();});
const viewSizes={1:1.5,2:1.3,3:1.15,4:1.02};
function setViewSize(size,announce=false){if(!viewSizes[size])return;window.kickoffZoom=viewSizes[size];document.querySelector('.touch-controls').dataset.size=size;document.querySelectorAll('[data-size]').forEach(b=>b.classList.toggle('selected',Number(b.dataset.size)===size));try{localStorage.setItem('kickoff-view-size',String(size));}catch{}if(announce)showToast(`Vista ${size} de 4`);}
let savedViewSize=3;try{savedViewSize=Number(localStorage.getItem('kickoff-view-size'))||3;}catch{}setViewSize(savedViewSize);
document.querySelectorAll('[data-size]').forEach(b=>b.addEventListener('click',()=>setViewSize(Number(b.dataset.size),true)));
window.addEventListener('keydown',e=>{if(!game.classList.contains('hidden')&&/^[1-4]$/.test(e.key)&&!(e.target instanceof HTMLInputElement)&&!(e.target instanceof HTMLTextAreaElement)){setViewSize(Number(e.key),true);}});
window.addEventListener('keyup',e=>{keys.delete(e.key===' '?' ':e.key.length===1?e.key.toLowerCase():e.key);sendInput();});
function releaseInputs(){keys.clear();if(local&&match?.players[0])match.players[0].input={x:0,y:0,kick:false};if(socket)socket.emit('input',{x:0,y:0,kick:false});}
window.addEventListener('blur',releaseInputs);document.addEventListener('visibilitychange',()=>{if(document.hidden)releaseInputs();});
document.querySelectorAll('.teamBtn').forEach(b=>b.onclick=()=>{const t=Number(b.dataset.team);if(socket)socket.emit('team',t);else setPlayerTeam(myId,t);});
$('#saveNumberBtn').onclick=()=>{const n=normalizePlayerNumber($('#numberSetting').value,'1');$('#numberSetting').value=n;$('#playerNumber').value=n;try{localStorage.setItem('kickoff-player-number',n);}catch{}if(socket)socket.emit('number',n);else{const p=match?.players.find(q=>q.id===myId);if(p){p.number=n;systemMessage(`${p.name} cambió su número a ${n}`);}}};
function autoTeams(){if(!host||!match)return;let red=0,blue=0;const players=[...match.players].sort(()=>Math.random()-.5);for(const p of players){const team=red<=blue?0:1;if(team===0)red++;else blue++;if(socket)socket.emit('assignTeam',{playerId:p.id,team});else setPlayerTeam(p.id,team);}}
function randomSpectators(){if(!host||!match)return;const candidates=match.players.filter(p=>p.team===2).sort(()=>Math.random()-.5);if(candidates.length<2){systemMessage('Rand necesita al menos dos espectadores.');return;}[0,1].forEach(i=>{const p=candidates[i],team=i;if(socket)socket.emit('assignTeam',{playerId:p.id,team});else setPlayerTeam(p.id,team);});}
$('#autoTeamsBtn').onclick=autoTeams;$('#randomTeamsBtn').onclick=randomSpectators;
$('#lockTeamsBtn').onclick=()=>{if(!host||!match)return;if(socket)socket.emit('admin','teamsLock');else{match.teamsLocked=!match.teamsLocked;systemMessage(`Equipos ${match.teamsLocked?'bloqueados':'desbloqueados'}`);}};
$('#kickRateSelect').onchange=()=>{const rate=Number($('#kickRateSelect').value);if(socket)socket.emit('kickRate',rate);else if(host){match.kickRate=rate;systemMessage(`Frecuencia de chute: ${rate.toFixed(2)} s`);}};
function toggleMatchEvent(name){if(!host||!match)return;if(socket)socket.emit('admin',name);else{match.events[name]=!match.events[name];const label={powerShots:'tiros potentes',curveShots:'tiros con efecto',fastPitch:'campo rápido',giantBall:'balón gigante',superBounce:'rebote fuerte',reverseControls:'controles inversos'}[name];systemMessage(`${match.events[name]?'Activado':'Desactivado'}: ${label}`);}}
$('#powerEventBtn').onclick=()=>toggleMatchEvent('powerShots');$('#curveEventBtn').onclick=()=>toggleMatchEvent('curveShots');$('#fastPitchBtn').onclick=()=>toggleMatchEvent('fastPitch');$('#giantBallBtn').onclick=()=>toggleMatchEvent('giantBall');$('#superBounceBtn').onclick=()=>toggleMatchEvent('superBounce');$('#reverseControlsBtn').onclick=()=>toggleMatchEvent('reverseControls');
$('#pauseBtn').onclick=()=>{if(socket)socket.emit('admin','pause');else{match.paused=!match.paused;systemMessage(`${match.paused?'Juego detenido':'Juego reanudado'}`);}};
$('#resetBtn').onclick=()=>{if(socket)socket.emit('admin','reset');else{match.score=[0,0];match.time=match.duration;match.over=false;match.paused=false;resetPositions(match,0);systemMessage('Se reinició el partido');}};
function message(name,text,system=false){const p=document.createElement('p');if(system){p.className='system-message';p.textContent=text;}else{const b=document.createElement('b');b.textContent=name+': ';p.append(b,document.createTextNode(text));}$('#messages').append(p);$('#messages').scrollTop=$('#messages').scrollHeight;}
function systemMessage(text){message('',text,true);}
$('#chatForm').onsubmit=e=>{e.preventDefault();const t=$('#chatInput').value.trim();if(!t)return;if(socket)socket.emit('chat',t);else message($('#playerName').value,t);$('#chatInput').value='';};
$('#leaveBtn').onclick=()=>{socket?.disconnect();socket=null;targets=null;keys.clear();match=null;host=false;$('#createBtn').disabled=false;$('#joinBtn').disabled=false;$('#messages').replaceChildren();$('#toast').classList.add('hidden');game.classList.add('hidden');menu.classList.remove('hidden');};
$('#roomsBtn').onclick=async()=>{const modal=$('#roomsModal'),list=$('#roomList');modal.classList.remove('hidden');list.textContent='Cargando…';try{const rooms=await(await fetch('/api/rooms')).json();list.replaceChildren();const publicRooms=rooms.filter(r=>r.public);if(!publicRooms.length){list.textContent='No hay salas públicas ahora mismo.';return;}for(const r of publicRooms){const row=document.createElement('div');row.className='roomrow';const info=document.createElement('div'),title=document.createElement('strong'),sub=document.createElement('small');title.textContent=r.name;sub.textContent=`${r.code} · ${r.count}/${r.maxPlayers} jugadores · ${r.stadium}`;info.append(title,sub);const btn=document.createElement('button');btn.textContent='Entrar';btn.onclick=()=>{$('#roomCode').value=r.code;modal.classList.add('hidden');$('#joinBtn').click();};row.append(info,btn);list.append(row);}}catch{list.textContent='No se pudo consultar el servidor.';}};
$('#closeRooms').onclick=()=>$('#roomsModal').classList.add('hidden');$('#settingsBtn').onclick=()=>$('#settingsModal').classList.remove('hidden');$('#closeSettings').onclick=()=>{pendingBindings=false;$('#settingsModal').classList.add('hidden');};$('#keybindBtn').onclick=()=>$('#settingsModal').classList.remove('hidden');
function renderBindings(){const container=$('#bindings');container.replaceChildren();for(const [action,key] of Object.entries(bindings)){const row=document.createElement('label');row.className='binding-row';row.textContent={up:'Arriba',left:'Izquierda',down:'Abajo',right:'Derecha',kick:'Golpear'}[action];const btn=document.createElement('button');btn.textContent=keyName(key);btn.onclick=()=>{$('#bindingAction').value=action;pendingBindings=true;btn.textContent='Pulsa una tecla…';};row.append(btn);container.append(row);}}
renderBindings();
// On-screen controls also feed the same input path as the keyboard.
const touchAction={up:()=>bindings.up,left:()=>bindings.left,down:()=>bindings.down,right:()=>bindings.right,kick:()=>bindings.kick};
for(const btn of document.querySelectorAll('[data-touch]')){const action=btn.dataset.touch;let pressedKey;const down=e=>{e.preventDefault();btn.setPointerCapture?.(e.pointerId);pressedKey=touchAction[action]?.();if(pressedKey){keys.add(pressedKey);sendInput();btn.classList.add('pressed');}};const up=e=>{e.preventDefault();if(pressedKey)keys.delete(pressedKey);pressedKey=null;sendInput();btn.classList.remove('pressed');};btn.addEventListener('pointerdown',down);btn.addEventListener('pointerup',up);btn.addEventListener('pointercancel',up);}
