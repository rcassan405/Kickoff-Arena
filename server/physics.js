export const FIELD = { width: 1200, height: 600, wall: 24, goalWidth: 170, playerRadius: 18, ballRadius: 9 };
export const STADIUMS = {
  Classic: { ...FIELD }, Easy: { ...FIELD, width: 1400, height: 700, goalWidth: 210 }, Small: { ...FIELD, width: 900, height: 480, goalWidth: 145 }, Big: { ...FIELD, width: 1500, height: 760, goalWidth: 220 }, Huge: { ...FIELD, width: 1800, height: 900, goalWidth: 250 }, Rounded: { ...FIELD, rounded: true }, Hockey: { ...FIELD, width: 1100, height: 560, goalWidth: 150 }
};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const cap=(o,max)=>{ const s=Math.hypot(o.vx,o.vy); if(s>max){o.vx*=max/s;o.vy*=max/s;} };
export function createMatch(stadium='Classic') {
 const f={...(STADIUMS[stadium]||FIELD)};
 return {field:f,players:[],ball:{x:f.width/2,y:f.height/2,vx:0,vy:0,r:f.ballRadius},score:[0,0],time:300,paused:false,kickoff:0,over:false};
}
export function addPlayer(match,id,name,team=0){ const p={id,name:String(name||'Player').slice(0,18),team,x:match.field.width*(team===1?.72:.28),y:match.field.height/2,vx:0,vy:0,r:match.field.playerRadius,input:{x:0,y:0,kick:false}};match.players.push(p);return p; }
export function resetPositions(m){ const f=m.field;m.players.forEach((p,i)=>{p.x=f.width*(p.team===1?.72:.28);p.y=f.height/2+(i%3-1)*34;p.vx=p.vy=0;});Object.assign(m.ball,{x:f.width/2,y:f.height/2,vx:0,vy:0});m.kickoff=1; }
function collide(a,b,restitution){let dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy)||.001,min=a.r+b.r;if(d>=min)return;const nx=dx/d,ny=dy/d,overlap=min-d;a.x-=nx*overlap*.5;a.y-=ny*overlap*.5;b.x+=nx*overlap*.5;b.y+=ny*overlap*.5;const rel=(b.vx-a.vx)*nx+(b.vy-a.vy)*ny;if(rel<0){const impulse=-(1+restitution)*rel/(1/a.mass+1/b.mass);a.vx-=impulse*nx/a.mass;a.vy-=impulse*ny/a.mass;b.vx+=impulse*nx/b.mass;b.vy+=impulse*ny/b.mass;}}
export function stepMatch(m,dt=1/60){if(m.paused||m.over)return null;const f=m.field;m.time=Math.max(0,m.time-dt);if(m.time===0)m.over=true;
 for(const p of m.players){const n=Math.hypot(p.input.x,p.input.y)||1,acc=900;p.vx+=p.input.x/n*acc*dt;p.vy+=p.input.y/n*acc*dt;const drag=Math.exp(-3.2*dt);p.vx*=drag;p.vy*=drag;cap(p,260);p.x+=p.vx*dt;p.y+=p.vy*dt;p.x=clamp(p.x,p.r,f.width-p.r);p.y=clamp(p.y,p.r,f.height-p.r);p.mass=1;}
 const b=m.ball;b.mass=.45;b.x+=b.vx*dt;b.y+=b.vy*dt;b.vx*=Math.exp(-.75*dt);b.vy*=Math.exp(-.75*dt);cap(b,720);
 for(const p of m.players){collide(p,b,.82);if(p.input.kick){const dx=b.x-p.x,dy=b.y-p.y,d=Math.hypot(dx,dy);if(d<p.r+b.r+22){const nx=d?dx/d:(p.team===0?1:-1),ny=d?dy/d:0;b.vx+=nx*380+p.vx*.48;b.vy+=ny*380+p.vy*.48;cap(b,720);}}}
 for(let i=0;i<m.players.length;i++)for(let j=i+1;j<m.players.length;j++)collide(m.players[i],m.players[j],.7);
 if(b.y<b.r){b.y=b.r;b.vy=Math.abs(b.vy)*.82;}if(b.y>f.height-b.r){b.y=f.height-b.r;b.vy=-Math.abs(b.vy)*.82;}
 const goalTop=(f.height-f.goalWidth)/2,goalBottom=goalTop+f.goalWidth;
 if(b.x<f.wall+b.r&&!(b.y>goalTop&&b.y<goalBottom)){b.x=f.wall+b.r;b.vx=Math.abs(b.vx)*.82;}if(b.x>f.width-f.wall-b.r&&!(b.y>goalTop&&b.y<goalBottom)){b.x=f.width-f.wall-b.r;b.vx=-Math.abs(b.vx)*.82;}
 if(b.x<0&&b.y>goalTop&&b.y<goalBottom){m.score[1]++;resetPositions(m);return 'goal';}if(b.x>f.width&&b.y>goalTop&&b.y<goalBottom){m.score[0]++;resetPositions(m);return 'goal';}return null;}
