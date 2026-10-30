const out=(data,status=200,headers={})=>Response.json(data,{status,headers:{'cache-control':'no-store',...headers}});
const hash=async s=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))).map(x=>x.toString(16).padStart(2,'0')).join('');
async function pass(p,s){const k=await crypto.subtle.importKey('raw',new TextEncoder().encode(p),'PBKDF2',false,['deriveBits']);return Array.from(new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',salt:new TextEncoder().encode(s),iterations:210000,hash:'SHA-256'},k,256))).map(x=>x.toString(16).padStart(2,'0')).join('')}
const ck=(t,age)=>`bunchie_session=${t}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${age}`;
const clean=(v,n=5000)=>String(v??'').trim().slice(0,n);
const link=v=>{try{const u=new URL(v);return ['http:','https:'].includes(u.protocol)?u.href:''}catch{return ''}};
export async function onRequest({request,env}){
 if(!env.DB)return out({error:'Bind D1 as DB in Pages Settings'},503);
 const db=env.DB,path=new URL(request.url).pathname.split('/').slice(2),verb=request.method;
 const raw=request.headers.get('cookie')?.match(/(?:^|;\s*)bunchie_session=([a-f0-9]{64})/)?.[1];
 const me=raw?await db.prepare('SELECT u.id,u.email,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?').bind(await hash(raw),Date.now()).first():null;
 const admin=me?.role==='admin';const id=()=>crypto.randomUUID();
 const run=(sql,...args)=>db.prepare(sql).bind(...args).run();
 try{
 if(verb==='GET'&&path[0]==='me')return out({user:me});
 if(verb==='POST'&&path[0]==='auth'){
  const d=await request.json();if(path[1]==='logout'){if(raw)await run('DELETE FROM sessions WHERE token_hash=?',await hash(raw));return out({ok:true},200,{'set-cookie':ck('',0)})}
  const email=clean(d.email,254).toLowerCase(),pw=String(d.password||'');if(!/^\S+@\S+\.\S+$/.test(email)||pw.length<8||pw.length>128)return out({error:'Email or password invalid (8+ characters)'},400);
  let u;if(path[1]==='register'){if(await db.prepare('SELECT 1 FROM users WHERE email=?').bind(email).first())return out({error:'Email already exists'},409);const salt=id(),uid=id();await run('INSERT INTO users(id,email,password_hash,salt) VALUES(?,?,?,?)',uid,email,await pass(pw,salt),salt);u={id:uid,email,role:'member'}}else if(path[1]==='login'){const found=await db.prepare('SELECT * FROM users WHERE email=?').bind(email).first();if(!found||await pass(pw,found.salt)!==found.password_hash)return out({error:'Wrong email or password'},401);u={id:found.id,email,role:found.role}}else return out({error:'Unknown action'},404);
  const token=Array.from(crypto.getRandomValues(new Uint8Array(32))).map(x=>x.toString(16).padStart(2,'0')).join('');await run('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)',await hash(token),u.id,Date.now()+604800000);return out({user:u},200,{'set-cookie':ck(token,604800)});
 }
 if(verb==='POST'&&path[0]==='admin-claim'){if(!me)return out({error:'Login first'},401);const d=await request.json();if(!env.ADMIN_SETUP_CODE||d.code!==env.ADMIN_SETUP_CODE)return out({error:'Wrong setup code'},403);if(await db.prepare("SELECT 1 FROM users WHERE role='admin'").first())return out({error:'Owner already set'},409);await run("UPDATE users SET role='admin' WHERE id=?",me.id);return out({ok:true})}
 if(verb==='GET'&&path[0]==='content'){const get=async sql=>(await db.prepare(sql).all()).results;return out({settings:await db.prepare('SELECT * FROM settings WHERE id=1').first(),characters:await get('SELECT * FROM characters ORDER BY created_at DESC'),artworks:await get('SELECT * FROM artworks ORDER BY created_at DESC'),stories:await get('SELECT * FROM stories ORDER BY created_at DESC'),letters:await get('SELECT * FROM letters '+(admin?'':'WHERE is_published=1 ')+'ORDER BY created_at DESC'),foods:await get('SELECT * FROM foods')})}
 if(verb==='GET'&&path[0]==='pets')return out({mine:me?await db.prepare('SELECT * FROM pets WHERE user_id=?').bind(me.id).first():null,publicPets:(await db.prepare('SELECT name,affection,baby_image,teen_image,adult_image FROM pets WHERE is_public=1 LIMIT 50').all()).results});
 if(verb==='POST'&&path[0]==='pet'){if(!me)return out({error:'Login first'},401);const d=await request.json(),today=new Date().toISOString().slice(0,10);
 if(path[1]==='adopt'){await run('INSERT INTO pets(user_id,name,baby_image) VALUES(?,?,?)',me.id,clean(d.name,32),link(d.image_url));return out({ok:true})}
 if(path[1]==='edit'){await run('UPDATE pets SET name=?,baby_image=?,teen_image=?,adult_image=?,is_public=? WHERE user_id=?',clean(d.name,32),link(d.baby_image),link(d.teen_image),link(d.adult_image),d.is_public?1:0,me.id);return out({ok:true})}
 if(path[1]==='checkin'){const r=await run('UPDATE pets SET affection=affection+10,last_checkin=? WHERE user_id=? AND (last_checkin IS NULL OR last_checkin<>?)',today,me.id,today);return r.meta.changes?out({hearts:10}):out({error:'Already checked in or no pet'},409)}
 if(path[1]==='feed'){const f=await db.prepare('SELECT * FROM foods WHERE id=?').bind(clean(d.food_id,80)).first();if(!f)return out({error:'Food not found'},404);const n=f.min_hearts+Math.floor(Math.random()*(f.max_hearts-f.min_hearts+1));const r=await run('UPDATE pets SET affection=affection+?,feed_day=?,feed_count=CASE WHEN feed_day=? THEN feed_count+1 ELSE 1 END WHERE user_id=? AND (feed_day IS NULL OR feed_day<>? OR feed_count<3)',n,today,today,me.id,today);return r.meta.changes?out({hearts:n}):out({error:'Daily feeding limit reached'},409)}
 }
 if(verb==='POST'&&path[0]==='letter'){if(!me)return out({error:'Login first'},401);const d=await request.json();await run('INSERT INTO letters(id,author_id,title,body,font,is_published) VALUES(?,?,?,?,?,0)',id(),me.id,clean(d.title,100),clean(d.body,5000),clean(d.font,40));return out({ok:true})}
 if(verb==='POST'&&path[0]==='admin'){if(!admin)return out({error:'Owner only'},403);const d=await request.json(),p=path[1];
 if(p==='settings')await run('UPDATE settings SET welcome_title=?,welcome_text=? WHERE id=1',clean(d.welcome_title,150),clean(d.welcome_text,800));
 else if(p==='characters')await run('INSERT INTO characters(id,name,description) VALUES(?,?,?)',id(),clean(d.name,100),clean(d.description,1000));
 else if(p==='artworks')await run('INSERT INTO artworks(id,title,image_url,category,character_id,artist,artist_url,description) VALUES(?,?,?,?,?,?,?,?)',id(),clean(d.title,150),link(d.image_url),d.category==='fanart'?'fanart':'commission',clean(d.character_id,80),clean(d.artist,100),link(d.artist_url),clean(d.description,2000));
 else if(p==='stories')await run('INSERT INTO stories(id,title,summary,cover_url,body) VALUES(?,?,?,?,?)',id(),clean(d.title,150),clean(d.summary,300),link(d.cover_url),clean(d.body,20000));
 else if(p==='letters')await run('INSERT INTO letters(id,author_id,title,body,font,is_published) VALUES(?,?,?,?,?,1)',id(),me.id,clean(d.title,100),clean(d.body,5000),clean(d.font,40));
 else if(p==='foods')await run('INSERT INTO foods(id,name,emoji,min_hearts,max_hearts) VALUES(?,?,?,?,?)',id(),clean(d.name,100),clean(d.emoji,8),Math.max(1,Math.min(20,Number(d.min_hearts)||2)),Math.max(1,Math.min(20,Number(d.max_hearts)||7)));
 else if(p==='approve')await run('UPDATE letters SET is_published=1 WHERE id=?',clean(d.id,80));else return out({error:'Not found'},404);return out({ok:true})}
 return out({error:'Not found'},404)
 }catch(e){console.error(e);return out({error:'Request failed'},500)}
    }
                                  
