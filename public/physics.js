export const FIELD={width:1200,height:600,wall:24,goalWidth:170,playerRadius:18,ballRadius:9,style:'classic',grass:'#234a37',stripe:'#2a523e',line:'#b5d2b5',border:'#1a3729'};
export const STADIUMS={
 Classic:{...FIELD},
 Easy:{...FIELD,width:1420,height:660,wall:30,goalWidth:225,playerRadius:20,ballRadius:10,style:'easy',grass:'#356b43',stripe:'#3d754a',line:'#d4e9c8',border:'#264f32'},
 Small:{...FIELD,width:860,height:520,wall:20,goalWidth:145,playerRadius:17,ballRadius:9,style:'small',grass:'#244d3b',stripe:'#2d5945',line:'#d2e5d0',border:'#1a3529'},
 Big:{...FIELD,width:1540,height:700,wall:28,goalWidth:215,playerRadius:18,ballRadius:9,style:'big',grass:'#1f4938',stripe:'#28533f',line:'#b6d9ca',border:'#17382b'},
 Huge:{...FIELD,width:2800,height:1200,wall:42,goalWidth:330,playerRadius:18,ballRadius:9,style:'huge',grass:'#203d35',stripe:'#29483f',line:'#c4d9cf',border:'#172e28'},
 Rounded:{...FIELD,width:1180,height:660,wall:26,goalWidth:170,rounded:true,style:'rounded',grass:'#2b5140',stripe:'#345c49',line:'#c7e0cf',border:'#1c382b'},
 Hockey:{...FIELD,width:1120,height:600,wall:18,goalWidth:150,style:'hockey',grass:'#254c59',stripe:'#2c5663',line:'#e8f1e9',border:'#183640'}
};
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x)),cap=(o,max)=>{let n=Math.hypot(o.vx,o.vy);if(n>max){o.vx*=max/n;o.vy*=max/n;}};
export function normalizePlayerNumber(value,fallback='1'){
 const text=String(value??'').trim().normalize('NFC');if(!text)return fallback;
 if(/^\p{N}{1,2}$/u.test(text)||/^\p{L}{1,2}$/u.test(text))return text;
 const parts=typeof Intl.Segmenter==='function'?[...new Intl.Segmenter('es',{granularity:'grapheme'}).segment(text)].map(x=>x.segment):[...text];
 if(parts.length===1&&(/\p{Extended_Pictographic}/u.test(parts[0])||/\u20e3/u.test(parts[0])||/^\p{Regional_Indicator}{2}$/u.test(parts[0])))return parts[0];
 return fallback;
}
export function createMatch(stadium='Classic',options={}){const selected=STADIUMS[stadium]?stadium:'Classic';const f={...STADIUMS[selected],name:selected};return{field:f,stadium:selected,players:[],ball:{x:f.width/2,y:f.height/2,vx:0,vy:0,charged:false,spin:0,r:f.ballRadius,baseRadius:f.ballRadius},score:[0,0],time:Math.max(30,Math.min(1800,Number(options.time)||300)),duration:Math.max(30,Math.min(1800,Number(options.time)||300)),goalLimit:Math.max(0,Math.min(99,Number(options.goalLimit)||0)),kickRate:.18,paused:false,teamsLocked:false,kickoff:0,kickoffPlayerId:null,events:{powerShots:false,curveShots:false,fastPitch:false,giantBall:false,superBounce:false,reverseControls:false},over:false};}
function formationSlot(f,team,index,count){
 const center=f.height/2;let distance=.42,y=.5;
 if(count>1){
  if(index===0){distance=.075;y=.5;}
  else if(count===2){distance=.46;y=.5;}
  else if(index===1){distance=.25;y=count===3?.5:.34;}
  else if(index===2){distance=count===3?.46:.25;y=count===3?.5:.66;}
  else if(count===4){distance=.46;y=.5;}
  else if(index===3){distance=.41;y=.35;}
  else if(index===4){distance=.41;y=.65;}
  else{distance=.47;y=(index-4)/(count-3);}
 }
 return{x:f.width*(team===0?distance:1-distance),y:center+(y-.5)*(f.height-2*f.wall)*.72};
}
function arrangeTeam(m,team){const f=m.field,players=m.players.filter(p=>p.team===team);players.forEach((p,i)=>{const spot=formationSlot(f,team,i,players.length);p.x=spot.x;p.y=spot.y;});}
function kickoffPlayer(m,team){const mid=m.field.width/2;return m.players.filter(p=>p.team===team).sort((a,b)=>Math.abs(mid-a.x)-Math.abs(mid-b.x))[0]?.id??null;}
export function addPlayer(m,id,name,team=0,number=null){const count=m.players.filter(p=>p.team===team).length,spot=formationSlot(m.field,team,count,count+1),p={id,name:String(name||'Player').slice(0,18),number:normalizePlayerNumber(number,String(count+1)),team,x:spot.x,y:spot.y,vx:0,vy:0,r:m.field.playerRadius,kickReady:false,kickFlash:0,input:{x:0,y:0,kick:false}};m.players.push(p);if(m.kickoff!==null){arrangeTeam(m,0);arrangeTeam(m,1);m.kickoffPlayerId=kickoffPlayer(m,m.kickoff);}return p;}
export function resetPositions(m,kickoffTeam=0){const f=m.field;arrangeTeam(m,0);arrangeTeam(m,1);m.players.filter(p=>p.team===2).forEach(p=>{p.x=f.width/2;p.y=f.height/2;});m.players.forEach(p=>{p.vx=p.vy=0;p.kickHeld=false;p.kickSpent=false;p.kickReady=false;p.kickFlash=0;p.kickCooldown=0;p.input={x:0,y:0,kick:false};});Object.assign(m.ball,{x:f.width/2,y:f.height/2,vx:0,vy:0,charged:false,spin:0});m.kickoff=kickoffTeam;m.kickoffPlayerId=kickoffPlayer(m,kickoffTeam);m.possessorId=null;m.possessionTime=0;}
function collide(a,b,e){let dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy)||.001,min=a.r+b.r;if(d>=min)return;let nx=dx/d,ny=dy/d,o=min-d,invA=1/a.mass,invB=1/b.mass,total=invA+invB;a.x-=nx*o*invA/total;a.y-=ny*o*invA/total;b.x+=nx*o*invB/total;b.y+=ny*o*invB/total;let rel=(b.vx-a.vx)*nx+(b.vy-a.vy)*ny;if(rel<0){let j=-(1+e)*rel/total;a.vx-=j*nx*invA;a.vy-=j*ny*invA;b.vx+=j*nx*invB;b.vy+=j*ny*invB;}}
export function collideSegment(o,x1,y1,x2,y2,radius,restitution=.7){const sx=x2-x1,sy=y2-y1,len2=sx*sx+sy*sy;if(!len2)return;const t=clamp(((o.x-x1)*sx+(o.y-y1)*sy)/len2,0,1),qx=x1+sx*t,qy=y1+sy*t;let dx=o.x-qx,dy=o.y-qy,d=Math.hypot(dx,dy),min=o.r+radius;if(d>=min)return;let nx,ny;if(d<1e-6){const len=Math.sqrt(len2);nx=-sy/len;ny=sx/len;}else{nx=dx/d;ny=dy/d;}o.x+=nx*(min-d);o.y+=ny*(min-d);const vn=o.vx*nx+o.vy*ny;if(vn<0){const impulse=-(1+restitution)*vn;o.vx+=impulse*nx;o.vy+=impulse*ny;}}
export function collideGoalRails(o,f,restitution=.7){const top=(f.height-f.goalWidth)/2,bottom=top+f.goalWidth,radius=Math.max(2,f.width/360),depth=f.wall+18;collideSegment(o,0,top,depth,top,radius,restitution);collideSegment(o,0,bottom,depth,bottom,radius,restitution);collideSegment(o,f.width-depth,top,f.width,top,radius,restitution);collideSegment(o,f.width-depth,bottom,f.width,bottom,radius,restitution);}
export function stepMatch(m,dt=1/60){
 if(m.ball)m.ball.r=(m.ball.baseRadius||m.field.ballRadius)*(m.events?.giantBall?1.5:1);
 if(m.paused||m.over)return null;
 const f=m.field;
 m.time=Math.max(0,m.time-dt);
 if(!m.time)m.over=true;
 if(m.kickoff!==null&&!m.players.some(p=>p.id===m.kickoffPlayerId&&p.team===m.kickoff))m.kickoffPlayerId=m.players.find(p=>p.team===m.kickoff)?.id??null;
 for(const p of m.players){
  if(p.team===2){p.vx=p.vy=0;p.input={x:0,y:0,kick:false};p.kickReady=false;p.kickFlash=0;p.kickSpent=false;p.mass=1;continue;}
  const reverse=m.events?.reverseControls?-1:1,ix=p.input.x*reverse,iy=p.input.y*reverse,n=Math.hypot(ix,iy)||1;
  p.vx+=ix/n*900*dt;p.vy+=iy/n*900*dt;
  const drag=Math.exp(-3.2*dt);p.vx*=drag;p.vy*=drag;cap(p,260);
  p.x=clamp(p.x+p.vx*dt,p.r,f.width-p.r);p.y=clamp(p.y+p.vy*dt,p.r,f.height-p.r);
  if(m.kickoff!==null){
   const mid=f.width/2,dy=p.y-f.height/2,circle=Math.min((f.height-2*f.wall)*.17,85),kickingTeam=p.team===m.kickoff;
   const beforeX=p.x;
   if(kickingTeam){const inside=Math.sqrt(Math.max(0,(circle-p.r)**2-dy*dy));p.x=p.team===0?Math.min(p.x,mid+inside):Math.max(p.x,mid-inside);}
   else{const edge=Math.sqrt(Math.max(0,circle*circle-dy*dy))+p.r;p.x=p.team===0?Math.min(p.x,mid-edge):Math.max(p.x,mid+edge);}
   if(p.x!==beforeX)p.vx=0;
  }
  p.mass=1;p.kickCooldown=Math.max(0,(p.kickCooldown||0)-dt);p.kickFlash=Math.max(0,(p.kickFlash||0)-dt);
 }
 const b=m.ball,ballCap=m.events?.fastPitch?900:720,ballDrag=m.events?.fastPitch ? .25 : .75;b.mass=.45;b.x+=b.vx*dt;b.y+=b.vy*dt;
 b.vx*=Math.exp(-ballDrag*dt);b.vy*=Math.exp(-ballDrag*dt);cap(b,ballCap);
 for(const p of m.players)if(p.team!==2)collideGoalRails(p,f,.65);
 const bounce=m.events?.superBounce ? .98 : .82;
 collideGoalRails(b,f,m.events?.superBounce ? .98 : .78);
 for(const p of m.players){
  if(p.team===2)continue;
  if(!p.input.kick)p.kickSpent=false;
  p.kickReady=!!p.input.kick&&!p.kickSpent;
  collide(p,b,m.events?.superBounce ? .98 : .82);
  const dx=b.x-p.x,dy=b.y-p.y,d=Math.hypot(dx,dy)||1;
  if(d<=p.r+b.r+1&&p.vx*dx+p.vy*dy>0){const pushDrag=Math.exp(-.14*dt);p.vx*=pushDrag;p.vy*=pushDrag;}
  if(p.input.kick&&!p.kickSpent&&p.kickCooldown<=0){
   const kx=b.x-p.x,ky=b.y-p.y,kd=Math.hypot(kx,ky);
   if(kd<p.r+b.r+22){const charged=!!(m.events?.powerShots&&b.charged&&b.chargedBy===p.id),strength=charged?620:380,dirX=kd?kx/kd:(p.team===0?1:-1),dirY=kd?ky/kd:0;b.vx+=dirX*strength+p.vx*.48;b.vy+=dirY*strength+p.vy*.48;cap(b,ballCap);b.spin=m.events?.curveShots?(p.team===0?1:-1)*1.1:0;b.charged=false;b.chargedBy=null;m.possessorId=null;m.possessionTime=0;p.kickCooldown=m.kickRate??.18;p.kickSpent=true;p.kickReady=false;p.kickFlash=.18;}
  }
  p.kickHeld=!!p.input.kick;
 }
 for(let i=0;i<m.players.length;i++)for(let j=i+1;j<m.players.length;j++)if(m.players[i].team!==2&&m.players[j].team!==2)collide(m.players[i],m.players[j],.7);
 let nearest=null,nearestDistance=Infinity;
 for(const p of m.players){if(p.team===2)continue;const d=Math.hypot(b.x-p.x,b.y-p.y);if(d<=p.r+b.r+3&&d<nearestDistance){nearest=p;nearestDistance=d;}}
 if(nearest){m.possessionTime=m.possessorId===nearest.id?(m.possessionTime||0)+dt:dt;m.possessorId=nearest.id;b.charged=!!m.events?.powerShots&&m.possessionTime>=2;b.chargedBy=b.charged?nearest.id:null;}
 else{m.possessorId=null;m.possessionTime=0;b.charged=false;b.chargedBy=null;}
 if(m.kickoff!==null&&Math.hypot(b.x-f.width/2,b.y-f.height/2)>b.r+2){m.kickoff=null;m.kickoffPlayerId=null;}
 const t=(f.height-f.goalWidth)/2,u=t+f.goalWidth;
 const top=f.wall+b.r,bottom=f.height-f.wall-b.r;
 if(b.spin){const oldVx=b.vx,oldVy=b.vy;b.vx+=-oldVy*b.spin*dt;b.vy+=oldVx*b.spin*dt;b.spin*=Math.exp(-.7*dt);}
 if(b.y<top){b.y=top;b.vy=Math.abs(b.vy)*bounce;}
 if(b.y>bottom){b.y=bottom;b.vy=-Math.abs(b.vy)*bounce;}
 if(b.x<f.wall+b.r&&!(b.y>t&&b.y<u)){b.x=f.wall+b.r;b.vx=Math.abs(b.vx)*bounce;}
 if(b.x>f.width-f.wall-b.r&&!(b.y>t&&b.y<u)){b.x=f.width-f.wall-b.r;b.vx=-Math.abs(b.vx)*bounce;}
 let goal=null;
 if(b.x<f.wall&&b.y>t&&b.y<u){m.score[1]++;goal=1;}
 else if(b.x>f.width-f.wall&&b.y>t&&b.y<u){m.score[0]++;goal=0;}
 if(goal!==null){resetPositions(m,goal===1?0:1);if(m.goalLimit&&m.score[goal]>=m.goalLimit)m.over=true;return'goal';}
 return null;
}
