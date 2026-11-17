import { createMatch, addPlayer, stepMatch, STADIUMS } from './physics.js';

const $ = s => document.querySelector(s);
const menu = $('#menu'), game = $('#game'), canvas = $('#field'), ctx = canvas.getContext('2d');
let stored = {};
try { stored = JSON.parse(localStorage.getItem('kickoff-settings') || '{}') || {}; } catch { stored = {}; }
let match, socket, local = false, host = false, myId = '', keys = new Set(), last = performance.now(), targets, toastTimer, pendingBindings = false;
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
function enter(m, online = false, code = 'LOCAL') {
 match=m;local=!online;if(!online)myId='local';menu.classList.add('hidden');game.classList.remove('hidden');$('#roomLabel').textContent=code;const stadiumName=m.stadium||m.field.name||$('#stadium').value;$('#activeStadium').textContent=stadiumName.toUpperCase();canvas.style.aspectRatio=m.field.width+' / '+m.field.height;
 $('#connection').textContent=online?'● CONECTADO':'● LOCAL';$('#hostControls').classList.toggle('hidden',!host);
 if(local){addPlayer(match,'local',$('#playerName').value||'Jugador',0);addPlayer(match,'bot','Rival de práctica',1);}
 keys.clear();last=performance.now();requestAnimationFrame(draw);
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
 const dt=Math.min(.05,(now-last)/1000);last=now;
 if(local&&!match.paused&&!match.over){match.players[0].input=movement();match.players[1].input=botInput(match.players[1],match.ball,match.field);const scored=stepMatch(match,dt);if(scored)showToast('¡GOL!');}
 if(targets&&socket){const a=targets.prev,b=targets.next,alpha=Math.max(0,Math.min(1,(now-targets.at)/70));match={...b,players:b.players.map(p=>{const q=a.players.find(z=>z.id===p.id)||p;return{...p,x:q.x+(p.x-q.x)*alpha,y:q.y+(p.y-q.y)*alpha};}),ball:{...b.ball,x:a.ball.x+(b.ball.x-a.ball.x)*alpha,y:a.ball.y+(b.ball.y-a.ball.y)*alpha}};}
 render();requestAnimationFrame(draw);
}
function render(){
 if(!match)return;
 const f=match.field,dpr=devicePixelRatio||1,w=canvas.clientWidth,h=canvas.clientHeight;if(!w||!h)return;
 if(canvas.width!==w*dpr||canvas.height!==h*dpr){canvas.width=w*dpr;canvas.height=h*dpr;}
 ctx.setTransform(canvas.width/f.width,0,0,canvas.height/f.height,0,0);ctx.clearRect(0,0,f.width,f.height);
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
 for(const p of match.players){ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,Math.PI*2);ctx.fillStyle=p.team?'#4b9ff0':'#ee5b58';ctx.fill();ctx.lineWidth=2;ctx.strokeStyle='#ffffffaa';ctx.stroke();if(p.id===myId){ctx.beginPath();ctx.arc(p.x,p.y,p.r+4,0,Math.PI*2);ctx.lineWidth=2;ctx.strokeStyle='#c4f36b';ctx.stroke();}ctx.fillStyle='#fff';ctx.font='12px Manrope';ctx.textAlign='center';ctx.fillText(p.name,p.x,p.y-p.r-7);}
 const b=match.ball;ctx.beginPath();ctx.ellipse(b.x+2,b.y+4,b.r*1.25,b.r*.65,0,0,Math.PI*2);ctx.fillStyle='#08150e66';ctx.fill();ctx.beginPath();ctx.arc(b.x,b.y,b.r,0,Math.PI*2);ctx.fillStyle='#f3f1e9';ctx.fill();ctx.lineWidth=2;ctx.strokeStyle='#d1d6d0';ctx.stroke();
 $('#scoreRed').textContent=match.score[0];$('#scoreBlue').textContent=match.score[1];$('#clock').textContent=String(Math.floor(match.time/60)).padStart(2,'0')+':'+String(Math.floor(match.time%60)).padStart(2,'0');$('#redRoster').textContent=match.players.filter(p=>p.team===0).map(p=>p.name).join(', ')||'?';$('#blueRoster').textContent=match.players.filter(p=>p.team===1).map(p=>p.name).join(', ')||'?';$('#pauseBtn').textContent=match.paused?'Reanudar':'Pausar';const status=$('#matchStatus');status.textContent=match.over?'PARTIDO TERMINADO':match.paused?'PARTIDO PAUSADO':'EN JUEGO';status.classList.toggle('stopped',match.over||match.paused);const arrows={up:'ArrowUp',left:'ArrowLeft',down:'ArrowDown',right:'ArrowRight'};for(const kbd of document.querySelectorAll('[data-action]')){const action=kbd.dataset.action;kbd.textContent=keyName(bindings[action]);kbd.classList.toggle('active-key',keys.has(bindings[action])||keys.has(arrows[action]));}if(match.over&&!$('#toast').classList.contains('hidden'))return;if(match.over)showToast('FIN DEL PARTIDO');
}
function showToast(t){const el=$('#toast');el.textContent=t;el.classList.remove('hidden');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.add('hidden'),2200);}
function connect(action, opts) {
 if(socket)socket.disconnect();socket=io();targets=null;
 $('#createBtn').disabled=true;$('#joinBtn').disabled=true;$('#connection').textContent='● CONECTANDO';
 socket.once('connect',()=>socket.emit(action,opts,r=>{if(r.error){alert(r.error);socket.disconnect();socket=null;return;}host=!!r.host;myId=socket.id;enter(createMatch(r.stadium||opts.stadium,opts),true,r.code);$('#hostControls').classList.toggle('hidden',!host);}));
 socket.on('state',s=>{if(!targets){targets={prev:s,next:s,at:performance.now()};match={...s};}else{if(s.score[0]!==targets.next.score[0]||s.score[1]!==targets.next.score[1])showToast('¡GOL!');targets.prev=targets.next;targets.next=s;targets.at=performance.now();}});
 socket.on('roster',ps=>{if(!match)return;match.players=ps.map(p=>match.players.find(q=>q.id===p.id)?{...match.players.find(q=>q.id===p.id),...p}:{...p,x:match.field.width*(p.team?.72:.28),y:match.field.height/2,vx:0,vy:0,r:match.field.playerRadius});});
 socket.on('chat',m=>message(m.name,m.text));
 socket.on('connect_error',()=>{if(game.classList.contains('hidden'))alert('No se pudo conectar. Comprueba que el servidor esté iniciado con npm start.');else showToast('No se pudo conectar al servidor');$('#createBtn').disabled=false;$('#joinBtn').disabled=false;$('#connection').textContent='● SIN CONEXIÓN';});
 socket.on('disconnect',()=>{if(!game.classList.contains('hidden'))showToast('Conexión perdida');$('#createBtn').disabled=false;$('#joinBtn').disabled=false;$('#connection').textContent='● SIN CONEXIÓN';});
}
$('#localBtn').onclick=()=>{host=true;enter(createMatch($('#stadium').value,matchOptions()));};
$('#createBtn').onclick=()=>connect('createRoom',{name:$('#roomName').value.trim()||'Kickoff Arena',playerName:$('#playerName').value,stadium:$('#stadium').value,...matchOptions(),public:$('#isPublic').checked,password:$('#createPassword').value});
$('#joinBtn').onclick=()=>connect('joinRoom',{code:$('#roomCode').value.trim().toUpperCase(),password:$('#roomPassword').value,playerName:$('#playerName').value});
function sendInput(){if(socket&&match)socket.emit('input',movement());}
window.addEventListener('keydown',e=>{if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(e.key))e.preventDefault();const key=e.key===' '? ' ':e.key.length===1?e.key.toLowerCase():e.key;if(pendingBindings){if(!['Escape','Tab'].includes(e.key)){const action=$('#bindingAction').value;const previous=Object.keys(bindings).find(k=>bindings[k]===key);if(previous)bindings[previous]=bindings[action];bindings[action]=key;localStorage.setItem('kickoff-settings',JSON.stringify({bindings}));renderBindings();pendingBindings=false;}return;}if(e.target instanceof HTMLInputElement||e.target instanceof HTMLTextAreaElement)return;keys.add(key);sendInput();});
window.addEventListener('keyup',e=>{keys.delete(e.key===' '?' ':e.key.length===1?e.key.toLowerCase():e.key);sendInput();});
document.querySelectorAll('.teamBtn').forEach(b=>b.onclick=()=>{const t=Number(b.dataset.team);if(socket)socket.emit('team',t);else if(match){const p=match.players[0];p.team=t;p.x=match.field.width*(t?.72:.28);p.y=match.field.height/2;p.vx=p.vy=0;}});
$('#pauseBtn').onclick=()=>{if(socket)socket.emit('admin','pause');else match.paused=!match.paused;};
$('#resetBtn').onclick=()=>{if(socket)socket.emit('admin','reset');else{match.score=[0,0];match.time=Number($('#duration').value)||300;match.over=false;match.paused=false;match.players.forEach(p=>{p.x=match.field.width*(p.team?.72:.28);p.y=match.field.height/2;p.vx=p.vy=0;});Object.assign(match.ball,{x:match.field.width/2,y:match.field.height/2,vx:0,vy:0});}};
function message(name,text){const p=document.createElement('p'),b=document.createElement('b');b.textContent=name+': ';p.append(b,document.createTextNode(text));$('#messages').append(p);$('#messages').scrollTop=$('#messages').scrollHeight;}
$('#chatForm').onsubmit=e=>{e.preventDefault();const t=$('#chatInput').value.trim();if(!t)return;if(socket)socket.emit('chat',t);else message($('#playerName').value,t);$('#chatInput').value='';};
$('#leaveBtn').onclick=()=>{socket?.disconnect();socket=null;targets=null;keys.clear();match=null;host=false;$('#createBtn').disabled=false;$('#joinBtn').disabled=false;$('#messages').replaceChildren();$('#toast').classList.add('hidden');game.classList.add('hidden');menu.classList.remove('hidden');};
$('#roomsBtn').onclick=async()=>{const modal=$('#roomsModal'),list=$('#roomList');modal.classList.remove('hidden');list.textContent='Cargando…';try{const rooms=await(await fetch('/api/rooms')).json();list.replaceChildren();const publicRooms=rooms.filter(r=>r.public);if(!publicRooms.length){list.textContent='No hay salas públicas ahora mismo.';return;}for(const r of publicRooms){const row=document.createElement('div');row.className='roomrow';const info=document.createElement('div'),title=document.createElement('strong'),sub=document.createElement('small');title.textContent=r.name;sub.textContent=`${r.code} · ${r.count}/${r.maxPlayers} jugadores · ${r.stadium}`;info.append(title,sub);const btn=document.createElement('button');btn.textContent='Entrar';btn.onclick=()=>{$('#roomCode').value=r.code;modal.classList.add('hidden');$('#joinBtn').click();};row.append(info,btn);list.append(row);}}catch{list.textContent='No se pudo consultar el servidor.';}};
$('#closeRooms').onclick=()=>$('#roomsModal').classList.add('hidden');$('#settingsBtn').onclick=()=>$('#settingsModal').classList.remove('hidden');$('#closeSettings').onclick=()=>{pendingBindings=false;$('#settingsModal').classList.add('hidden');};$('#keybindBtn').onclick=()=>$('#settingsModal').classList.remove('hidden');
function renderBindings(){const container=$('#bindings');container.replaceChildren();for(const [action,key] of Object.entries(bindings)){const row=document.createElement('label');row.className='binding-row';row.textContent={up:'Arriba',left:'Izquierda',down:'Abajo',right:'Derecha',kick:'Golpear'}[action];const btn=document.createElement('button');btn.textContent=keyName(key);btn.onclick=()=>{$('#bindingAction').value=action;pendingBindings=true;btn.textContent='Pulsa una tecla…';};row.append(btn);container.append(row);}}
renderBindings();
// On-screen controls also feed the same input path as the keyboard.
const touchAction={up:()=>bindings.up,left:()=>bindings.left,down:()=>bindings.down,right:()=>bindings.right,kick:()=>bindings.kick};
for(const btn of document.querySelectorAll('[data-touch]')){const action=btn.dataset.touch;let pressedKey;const down=e=>{e.preventDefault();btn.setPointerCapture?.(e.pointerId);pressedKey=touchAction[action]?.();if(pressedKey){keys.add(pressedKey);sendInput();btn.classList.add('pressed');}};const up=e=>{e.preventDefault();if(pressedKey)keys.delete(pressedKey);pressedKey=null;sendInput();btn.classList.remove('pressed');};btn.addEventListener('pointerdown',down);btn.addEventListener('pointerup',up);btn.addEventListener('pointercancel',up);}
