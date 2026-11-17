import { createMatch, addPlayer, stepMatch } from './physics.js';

const $ = s => document.querySelector(s);
const menu = $('#menu'), game = $('#game'), canvas = $('#field'), ctx = canvas.getContext('2d');
const stored = JSON.parse(localStorage.getItem('kickoff-settings') || '{}');
let match, socket, local = false, host = false, myId = '', keys = new Set(), last = performance.now(), targets, toastTimer, pendingBindings = false;
let bindings = stored.bindings || {up:'w',left:'a',down:'s',right:'d',kick:' '};
const keyName = k => k === ' ' ? 'Space' : k.length === 1 ? k.toUpperCase() : k;
function movement() {
 const has = (key, arrow) => keys.has(bindings[key]) || keys.has(arrow);
 return {x:Number(has('right','ArrowRight'))-Number(has('left','ArrowLeft')),y:Number(has('down','ArrowDown'))-Number(has('up','ArrowUp')),kick:keys.has(bindings.kick)};
}
function matchOptions() { return { time:Number($('#duration').value)||300, goalLimit:Number($('#goalLimit').value)||0 }; }
function enter(m, online = false, code = 'LOCAL') {
 match=m;local=!online;menu.classList.add('hidden');game.classList.remove('hidden');$('#roomLabel').textContent=code;
 $('#connection').textContent=online?'● CONECTADO':'● LOCAL';$('#hostControls').classList.toggle('hidden',!host);
 if(local){addPlayer(match,'local',$('#playerName').value||'Jugador',0);addPlayer(match,'bot','Rival de práctica',1);}
 keys.clear();last=performance.now();requestAnimationFrame(draw);
}
function botInput(bot, ball, field) {
 // The practice rival aims behind the ball, so its contact tends to send it toward the left goal.
 const gx=field.width*.06, gy=field.height/2;
 let tx=ball.x,ty=ball.y;
 const aimX=ball.x-gx,aimY=ball.y-gy,n=Math.hypot(aimX,aimY)||1;
 tx=ball.x+aimX/n*(bot.r+ball.r+4);ty=ball.y+aimY/n*(bot.r+ball.r+4);
 if(ball.x>field.width*.65){tx=field.width*.72;ty=field.height/2;}
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
function render(){if(!match)return;const f=match.field,dpr=devicePixelRatio||1,w=canvas.clientWidth,h=canvas.clientHeight;if(!w||!h)return;if(canvas.width!==w*dpr||canvas.height!==h*dpr){canvas.width=w*dpr;canvas.height=h*dpr;}ctx.setTransform(canvas.width/f.width,0,0,canvas.height/f.height,0,0);ctx.clearRect(0,0,f.width,f.height);ctx.fillStyle='#234a37';ctx.fillRect(0,0,f.width,f.height);ctx.strokeStyle='#b5d2b5';ctx.lineWidth=2;ctx.strokeRect(f.wall,f.wall,f.width-2*f.wall,f.height-2*f.wall);ctx.beginPath();ctx.moveTo(f.width/2,f.wall);ctx.lineTo(f.width/2,f.height-f.wall);ctx.stroke();ctx.beginPath();ctx.arc(f.width/2,f.height/2,85,0,Math.PI*2);ctx.stroke();ctx.beginPath();ctx.arc(f.width/2,f.height/2,4,0,Math.PI*2);ctx.fillStyle='#dceadc';ctx.fill();const gt=(f.height-f.goalWidth)/2;ctx.fillStyle='#15281e';ctx.fillRect(0,gt,f.wall,f.goalWidth);ctx.fillRect(f.width-f.wall,gt,f.wall,f.goalWidth);ctx.strokeRect(0,gt,f.wall,f.goalWidth);ctx.strokeRect(f.width-f.wall,gt,f.wall,f.goalWidth);
 for(const p of match.players){ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,Math.PI*2);ctx.fillStyle=p.team?'#4b9ff0':'#ee5b58';ctx.fill();ctx.lineWidth=2;ctx.strokeStyle='#ffffffaa';ctx.stroke();ctx.fillStyle='#fff';ctx.font='12px Manrope';ctx.textAlign='center';ctx.fillText(p.name,p.x,p.y-p.r-7);}
 const b=match.ball;ctx.beginPath();ctx.arc(b.x,b.y,b.r,0,Math.PI*2);ctx.fillStyle='#f3f1e9';ctx.fill();ctx.lineWidth=2;ctx.strokeStyle='#d1d6d0';ctx.stroke();$('#scoreRed').textContent=match.score[0];$('#scoreBlue').textContent=match.score[1];$('#clock').textContent=`${String(Math.floor(match.time/60)).padStart(2,'0')}:${String(Math.floor(match.time%60)).padStart(2,'0')}`;$('#redRoster').textContent=match.players.filter(p=>p.team===0).map(p=>p.name).join(', ')||'—';$('#blueRoster').textContent=match.players.filter(p=>p.team===1).map(p=>p.name).join(', ')||'—';$('#pauseBtn').textContent=match.paused?'Reanudar':'Pausar';if(match.over&&!$('#toast').classList.contains('hidden'))return;if(match.over)showToast('FIN DEL PARTIDO');}
function showToast(t){const el=$('#toast');el.textContent=t;el.classList.remove('hidden');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.add('hidden'),2200);}
function connect(action, opts) {
 if(socket)socket.disconnect();socket=io();targets=null;
 socket.once('connect',()=>socket.emit(action,opts,r=>{if(r.error){alert(r.error);socket.disconnect();socket=null;return;}host=!!r.host;myId=socket.id;enter(createMatch(opts.stadium,opts),true,r.code);$('#hostControls').classList.toggle('hidden',!host);}));
 socket.on('state',s=>{if(!targets){targets={prev:s,next:s,at:performance.now()};match={...s};}else{targets.prev=targets.next;targets.next=s;targets.at=performance.now();}});
 socket.on('roster',ps=>{if(!match)return;match.players=ps.map(p=>match.players.find(q=>q.id===p.id)?{...match.players.find(q=>q.id===p.id),...p}:{...p,x:match.field.width*(p.team?.72:.28),y:match.field.height/2,vx:0,vy:0,r:match.field.playerRadius});});
 socket.on('chat',m=>message(m.name,m.text));socket.on('disconnect',()=>{if(!game.classList.contains('hidden'))showToast('Conexión perdida');});
}
$('#localBtn').onclick=()=>{host=true;enter(createMatch($('#stadium').value,matchOptions()));};
$('#createBtn').onclick=()=>connect('createRoom',{name:$('#roomName').value.trim()||'Kickoff Arena',playerName:$('#playerName').value,stadium:$('#stadium').value,...matchOptions(),public:$('#isPublic').checked,password:$('#createPassword').value});
$('#joinBtn').onclick=()=>connect('joinRoom',{code:$('#roomCode').value.trim().toUpperCase(),password:$('#roomPassword').value,playerName:$('#playerName').value});
function sendInput(){if(socket&&match)socket.emit('input',movement());}
window.addEventListener('keydown',e=>{if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(e.key))e.preventDefault();const key=e.key===' '? ' ':e.key.length===1?e.key.toLowerCase():e.key;if(pendingBindings){if(!['Escape','Tab'].includes(e.key)){const action=$('#bindingAction').value;bindings[action]=key;localStorage.setItem('kickoff-settings',JSON.stringify({bindings}));renderBindings();pendingBindings=false;showToast(`${action}: ${keyName(key)}`);}return;}keys.add(key);sendInput();});
window.addEventListener('keyup',e=>{keys.delete(e.key===' '?' ':e.key.length===1?e.key.toLowerCase():e.key);sendInput();});
document.querySelectorAll('.teamBtn').forEach(b=>b.onclick=()=>{const t=Number(b.dataset.team);if(socket)socket.emit('team',t);else if(match){match.players[0].team=t;}});
$('#pauseBtn').onclick=()=>{if(socket)socket.emit('admin','pause');else match.paused=!match.paused;};
$('#resetBtn').onclick=()=>{if(socket)socket.emit('admin','reset');else{match.score=[0,0];match.time=Number($('#duration').value)||300;match.over=false;match.paused=false;match.players.forEach(p=>{p.x=match.field.width*(p.team?.72:.28);p.y=match.field.height/2;p.vx=p.vy=0;});Object.assign(match.ball,{x:match.field.width/2,y:match.field.height/2,vx:0,vy:0});}};
function message(name,text){const p=document.createElement('p'),b=document.createElement('b');b.textContent=name+': ';p.append(b,document.createTextNode(text));$('#messages').append(p);$('#messages').scrollTop=$('#messages').scrollHeight;}
$('#chatForm').onsubmit=e=>{e.preventDefault();const t=$('#chatInput').value.trim();if(!t)return;if(socket)socket.emit('chat',t);else message($('#playerName').value,t);$('#chatInput').value='';};
$('#leaveBtn').onclick=()=>{socket?.disconnect();socket=null;targets=null;keys.clear();game.classList.add('hidden');menu.classList.remove('hidden');};
$('#roomsBtn').onclick=async()=>{const modal=$('#roomsModal'),list=$('#roomList');modal.classList.remove('hidden');list.textContent='Cargando…';try{const rooms=await(await fetch('/api/rooms')).json();list.replaceChildren();const publicRooms=rooms.filter(r=>r.public);if(!publicRooms.length){list.textContent='No hay salas públicas ahora mismo.';return;}for(const r of publicRooms){const row=document.createElement('div');row.className='roomrow';const info=document.createElement('div'),title=document.createElement('strong'),sub=document.createElement('small');title.textContent=r.name;sub.textContent=`${r.code} · ${r.count}/${r.maxPlayers} jugadores · ${r.stadium}`;info.append(title,sub);const btn=document.createElement('button');btn.textContent='Entrar';btn.onclick=()=>{$('#roomCode').value=r.code;modal.classList.add('hidden');$('#joinBtn').click();};row.append(info,btn);list.append(row);}}catch{list.textContent='No se pudo consultar el servidor.';}};
$('#closeRooms').onclick=()=>$('#roomsModal').classList.add('hidden');$('#settingsBtn').onclick=()=>$('#settingsModal').classList.remove('hidden');$('#closeSettings').onclick=()=>$('#settingsModal').classList.add('hidden');
function renderBindings(){const container=$('#bindings');container.replaceChildren();for(const [action,key] of Object.entries(bindings)){const row=document.createElement('label');row.className='binding-row';row.textContent={up:'Arriba',left:'Izquierda',down:'Abajo',right:'Derecha',kick:'Golpear'}[action];const btn=document.createElement('button');btn.textContent=keyName(key);btn.onclick=()=>{$('#bindingAction').value=action;pendingBindings=true;btn.textContent='Pulsa una tecla…';};row.append(btn);container.append(row);}}
renderBindings();
// On-screen controls also feed the same input path as the keyboard.
for(const btn of document.querySelectorAll('[data-touch]')){const code=btn.dataset.touch;const down=e=>{e.preventDefault();keys.add(code);sendInput();btn.classList.add('pressed');};const up=e=>{e.preventDefault();keys.delete(code);sendInput();btn.classList.remove('pressed');};btn.addEventListener('pointerdown',down);btn.addEventListener('pointerup',up);btn.addEventListener('pointercancel',up);btn.addEventListener('pointerleave',e=>{if(e.buttons)up(e);});}
