'use strict';
const http=require('node:http');
const net=require('node:net');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {one,all,run,transaction,getSetting,audit,notify}=require('./db');
const {randomToken,hashToken,hashPassword,checkPassword,parseCookies,parseMultipart,passwordValid,storeFile,validateFile,normalizeName,parseCsv,scanFile}=require('./security');
const V=require('./views');
const AV=require('./academic-views');
const {registerAcademicRoutes}=require('./academic-routes');
const {issueToken,peekToken,consumeToken}=require('./auth');
const ROLES=['administrador','funcionario','estudante','candidato'];
const STATES=Object.keys(V.STATUS), PRIORITIES=Object.keys(V.PRIORITY);
const VISIBILITIES=Object.keys(V.VISIBILITY);
const now=()=>new Date().toISOString().slice(0,19).replace('T',' ');
const num=x=>Number.parseInt(String(x||''),10)||0;
const s=(o,k)=>String(Array.isArray(o[k])?o[k][0]:o[k]??'').trim();
const ints=x=>[...new Set((Array.isArray(x)?x:x?[x]:[]).map(num).filter(Boolean))];
const validMail=m=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(m)&&m.length<=180;
const slugify=x=>x.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,90);
const LIMIT=30*1024*1024;

function makeApp({db,uploadDir=path.join(process.cwd(),'uploads'),environment='development',sessionHours=12}={}){
 if(!db)throw new Error('É necessária uma base de dados.');
 fs.mkdirSync(uploadDir,{recursive:true});
 const routes=[];
 let academicHome=null;
 function route(method,p,handler,{auth=false,roles=[]}={}){
   const keys=[];const rx='^'+p.split('/').map(bit=>bit.startsWith(':')?(keys.push(bit.slice(1)),'([^/]+)'):bit.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('/')+'/?$';
   routes.push({method,rx:new RegExp(rx),keys,handler,auth,roles});
 }
 const get=(p,h,o)=>route('GET',p,h,o),post=(p,h,o)=>route('POST',p,h,o);
 const secureCookie=environment==='production'?'; Secure':'';
 function cookie(ctx,name,value,maxAge){const previous=ctx.res.getHeader('Set-Cookie')||[];ctx.res.setHeader('Set-Cookie',[...(Array.isArray(previous)?previous:[previous]),`${name}=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${secureCookie}`]);}
 function redirect(ctx,url,alert='',isError=false){const target=alert?`${url}${url.includes('?')?'&':'?'}${isError?'erro':'mensagem'}=${encodeURIComponent(alert)}`:url;ctx.res.statusCode=303;ctx.res.setHeader('Location',target);ctx.res.end();}
 function goBack(ctx,message){const source=ctx.req.headers.referer||'';let target='/painel';try{const u=new URL(source);if(u.host===ctx.req.headers.host)target=u.pathname+u.search;}catch{}redirect(ctx,target,message,true);}
 function html(ctx,markup,status=200){ctx.res.writeHead(status,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});ctx.res.end(markup);}
 function fail(ctx,status,message){html(ctx,V.errorPage(status,message,ctx.user),status);}
 async function page(ctx,title,content,subtitle=''){
   const unread=(await one(db,'SELECT COUNT(*) AS n FROM notifications WHERE user_id=? AND read_at IS NULL',ctx.user.id)).n;
   html(ctx,V.layout({user:ctx.user,title,subtitle,content,route:ctx.url.pathname,csrf:ctx.csrf,unread,alert:ctx.url.searchParams.get('mensagem')||'',error:ctx.url.searchParams.get('erro')||'',institution:await getSetting(db,'institution_name')}));
 }
 function reject(message){throw new Error(message);}
 function sourceIp(ctx){
   const peer=ctx.req.socket.remoteAddress||'127.0.0.1';
   if(process.env.TRUST_PROXY!=='true')return peer;
   const first=String(ctx.req.headers['x-forwarded-for']||'').split(',')[0].trim();
   return net.isIP(first)?first:peer;
 }
 function limitKey(value){return hashToken(value);}
 async function checkBlocked(key){
   const hit=await one(db,'SELECT blocked_until FROM rate_limits WHERE key=?',limitKey(key));
   if(hit&&hit.blocked_until>Date.now())reject('Demasiadas tentativas. Volte a tentar dentro de alguns minutos.');
 }
 async function rate(ctx,key,max,ms){
   const raw=`rate:${key}:${sourceIp(ctx)}`,k=limitKey(raw),t=Date.now();
   const row=await one(db,'SELECT * FROM rate_limits WHERE key=?',k);
   if(row?.blocked_until>t||row&&t-row.window_start<ms&&row.count>=max)reject('Demasiadas tentativas. Volte a tentar mais tarde.');
   if(row&&t-row.window_start<ms)await run(db,'UPDATE rate_limits SET count=count+1 WHERE key=?',k);
   else await run(db,'INSERT INTO rate_limits(key,window_start,count,blocked_until) VALUES(?,?,1,0) ON CONFLICT(key) DO UPDATE SET window_start=excluded.window_start,count=1,blocked_until=0',k,t);
 }
 function loginKey(email){return 'login-falhas:'+email;}
 async function loginFailure(email){
   const key=limitKey(loginKey(email)),t=Date.now();
   const row=await one(db,'SELECT * FROM rate_limits WHERE key=?',key);
   const count=row&&t-row.window_start<30*60000?row.count+1:1;
   const blocked=t+(count>=10?30*60000:count>=5?5*60000:0);
   await run(db,'INSERT INTO rate_limits(key,window_start,count,blocked_until) VALUES(?,?,?,?) ON CONFLICT(key) DO UPDATE SET window_start=excluded.window_start,count=excluded.count,blocked_until=excluded.blocked_until',key,row&&t-row.window_start<30*60000?row.window_start:t,count,blocked);
   await audit(db,null,'tentativa_login_falhada','authentication',null);
 }
 async function scanUploads(ctx,files){
   for(const file of files)try{await scanFile(file.data);}catch(error){
     await audit(db,ctx.user,'upload_rejeitado_antivirus','upload',null);
     throw error;
   }
 }
 async function verifiedStudent(u){return u.role!=='estudante'||!!u.student_verified&&!!await one(db,"SELECT id FROM student_roster WHERE student_number=? AND status='activo'",u.student_number);}
 async function canRoster(u){return u.role==='administrador'||u.role==='funcionario'&&!!await one(db,`SELECT 1 FROM department_staff ds JOIN departments d ON d.id=ds.department_id WHERE ds.user_id=? AND d.slug='registo-academico'`,u.id);}
 async function slaHours(ticket){return Number(ticket.sla_hours)||num(await getSetting(db,'overdue_days','3'))*24;}
 function overdueSql(){return `t.status NOT IN ('respondido','fechado') AND EXTRACT(EPOCH FROM (now()::timestamp - t.created_at))/3600 > COALESCE(c.sla_hours,?)*1.0`;}

 async function canTicket(user,t){if(!user||!t)return false;if(user.role==='administrador')return true;if(['estudante','candidato'].includes(user.role))return user.id===t.user_id;return !!await one(db,'SELECT 1 FROM department_staff WHERE user_id=? AND department_id=?',user.id,t.department_id);}
 function staff(user){return !!user&&['administrador','funcionario'].includes(user.role);}
 async function canStaffDepartment(user,id){return user.role==='administrador'||!!await one(db,'SELECT 1 FROM department_staff WHERE user_id=? AND department_id=?',user.id,id);}
 async function departmentsFor(user,active=false){let sql='SELECT d.* FROM departments d';const params=[];if(user?.role==='funcionario'){sql+=' JOIN department_staff ds ON ds.department_id=d.id WHERE ds.user_id=?';params.push(user.id);}else sql+=' WHERE 1=1';if(active)sql+=' AND d.is_active=1';return await all(db,sql+' ORDER BY d.name',...params);}
 async function ticketRow(id){return await one(db,`SELECT t.*,u.name AS owner_name,u.email AS owner_email,d.name AS department_name,c.name AS category_name,c.sla_hours FROM tickets t JOIN users u ON u.id=t.user_id JOIN departments d ON d.id=t.department_id LEFT JOIN categories c ON c.id=t.category_id WHERE t.id=?`,id);}
 async function requireTicket(ctx){const ticket=await ticketRow(num(ctx.params.id));if(!ticket||!await canTicket(ctx.user,ticket)){fail(ctx,404,'Pedido não encontrado ou sem permissão.');return null;}return ticket;}
 async function canDocument(u,d){if(!d||d.deleted_at)return false;if(d.valid_until&&d.valid_until<new Date().toISOString().slice(0,10)&&!staff(u))return false;if(d.visibility==='publico')return true;if(!u)return false;if(u.role==='administrador')return true;if(u.role==='funcionario')return d.visibility!=='interno'||!!(d.department_id&&await canStaffDepartment(u,d.department_id));if(u.role==='estudante')return await verifiedStudent(u)&&d.visibility==='estudantes';if(u.role==='candidato')return d.visibility==='candidatos';return false;}
 async function manageDocument(u,d){if(!staff(u))return false;return u.role==='administrador'||!!(d.department_id&&await canStaffDepartment(u,d.department_id));}
 async function hasIssue(files,type='ticket'){
   const limit=type==='document'?Math.min(20,num(await getSetting(db,'max_document_mb','10')))*1024*1024:5*1024*1024;
   if(files.length>(type==='ticket'?5:1))reject(type==='ticket'?'Pode anexar, no máximo, 5 ficheiros.':'Seleccione apenas um ficheiro.');
   for(const f of files)validateFile(f,{type,maxBytes:limit});
 }
 async function saveFiles(files,kind){
   const limit=kind==='document'?Math.min(20,num(await getSetting(db,'max_document_mb','10')))*1024*1024:5*1024*1024;
   return files.map(f=>storeFile(uploadDir,f,{type:kind,maxBytes:limit}));
 }
 async function storeAttachments(files,ticketId,messageId=null){for(const f of await saveFiles(files,'ticket'))await run(db,'INSERT INTO attachments(ticket_id,message_id,original_name,path,mime,size) VALUES(?,?,?,?,?,?)',ticketId,messageId,f.original_name,f.path,f.mime,f.size);}
 async function notifyTicket(ticketId,actorId,title,body){const ticket=await ticketRow(ticketId);const recipientIds=new Set();if(ticket.user_id!==actorId)recipientIds.add(ticket.user_id);
  for(const x of await all(db,'SELECT user_id FROM department_staff WHERE department_id=?',ticket.department_id))if(x.user_id!==actorId)recipientIds.add(x.user_id);
  // Notificar também os administradores quando é criado um pedido.
  if(title.includes('Novo pedido'))for(const x of await all(db,"SELECT id AS user_id FROM users WHERE role='administrador' AND is_active=1"))if(x.user_id!==actorId)recipientIds.add(x.user_id);
  for(const id of recipientIds)await notify(db,id,title,body,`/pedidos/${ticketId}`);
 }
 async function setStatus(t,id,status,priority,actor){await transaction(db,async()=>{
   if(status!==t.status){await run(db,'UPDATE tickets SET status=?,updated_at=?,closed_at=? WHERE id=?',status,now(),status==='fechado'?now():null,id);await run(db,'INSERT INTO ticket_histories(ticket_id,user_id,action,from_value,to_value) VALUES (?,?,?,?,?)',id,actor.id,'estado_alterado',t.status,status);}
   if(priority!==t.priority){await run(db,'UPDATE tickets SET priority=?,updated_at=? WHERE id=?',priority,now(),id);await run(db,'INSERT INTO ticket_histories(ticket_id,user_id,action,from_value,to_value) VALUES (?,?,?,?,?)',id,actor.id,'prioridade_alterada',t.priority,priority);}
   await audit(db,actor,'actualizou_pedido','ticket',id,`${status} / ${priority}`);
 });}
 function verifyOrigin(ctx){const origin=ctx.req.headers.origin;if(!origin)return true;try{return new URL(origin).host===ctx.req.headers.host;}catch{return false;}}
 async function readBody(req){
   if(Number(req.headers['content-length'])>LIMIT)throw Object.assign(new Error('O formulário ultrapassa o limite de 30 MB.'),{status:413});
   const parts=[];let length=0;for await(const chunk of req){length+=chunk.length;if(length>LIMIT)throw Object.assign(new Error('O formulário ultrapassa o tamanho máximo permitido (30 MB).'),{status:413});parts.push(chunk);}
   const data=Buffer.concat(parts);const ct=req.headers['content-type']||'';
   if(ct.startsWith('application/x-www-form-urlencoded')){const q=new URLSearchParams(data.toString('utf8'));const fields={};for(const k of new Set(q.keys())){const values=q.getAll(k);fields[k]=values.length>1?values:values[0];}return {fields,files:[]};}
   const match=ct.match(/^multipart\/form-data;\s*boundary=(?:"([^"]+)"|([^;]+))/i);if(match)return parseMultipart(data,match[1]||match[2]);
   return {fields:{},files:[]};
 }
 function staticFile(ctx){const files={'/portal-v5.css':['portal-v5.css','text/css; charset=utf-8'],'/theme.css':['theme.css','text/css; charset=utf-8'],'/app.css':['app.css','text/css; charset=utf-8'],'/app.js':['app.js','text/javascript; charset=utf-8'],'/selo-ismma-referencia.svg':['selo-ismma-referencia.svg','image/svg+xml'],'/fonts/Butler_Regular.otf':['fonts/Butler_Regular.otf','font/otf'],'/fonts/Butler_Medium.otf':['fonts/Butler_Medium.otf','font/otf'],'/fonts/Butler_Bold.otf':['fonts/Butler_Bold.otf','font/otf'],'/fonts/Gordita-Regular.ttf':['fonts/Gordita-Regular.ttf','font/ttf'],'/fonts/Gordita-Medium.ttf':['fonts/Gordita-Medium.ttf','font/ttf'],'/fonts/Gordita-Bold.ttf':['fonts/Gordita-Bold.ttf','font/ttf']};const match=files[ctx.url.pathname];if(!match)return false;const data=fs.readFileSync(path.join(__dirname,'..','public',match[0]));const cache=match[0].startsWith('fonts/')?'public,max-age=31536000,immutable':'public,max-age=300';ctx.res.writeHead(200,{'Content-Type':match[1],'Cache-Control':cache});ctx.res.end(data);return true;}
 function sendFile(ctx,filename,display,mime){const full=path.join(uploadDir,filename);if(!filename||path.basename(filename)!==filename||!fs.existsSync(full)){fail(ctx,404,'Ficheiro indisponível.');return;}const stat=fs.statSync(full);ctx.res.writeHead(200,{'Content-Type':mime,'Content-Length':stat.size,'Content-Disposition':`attachment; filename="documento"; filename*=UTF-8''${encodeURIComponent(display)}`,'X-Content-Type-Options':'nosniff','Cache-Control':'no-store'});fs.createReadStream(full).pipe(ctx.res);}

 // Páginas públicas e autenticação.
 get('/',async ctx=>ctx.user?redirect(ctx,'/painel'):html(ctx,AV.portalLanding()));
 get('/instituicao',async ctx=>{const content=V.institutionPage();if(ctx.user)await page(ctx,'Conhecer o ISMMA',content,'Informações públicas verificadas no sítio oficial.');else html(ctx,V.publicLayout('Conhecer o ISMMA',content));});
 get('/saude',async ctx=>{let dbOk=false;try{dbOk=(await one(db,'SELECT 1 AS n')).n===1;}catch{}const space=fs.statfsSync(uploadDir);const freeMb=Math.floor(Number(space.bavail)*Number(space.bsize)/1024/1024);const status=dbOk&&freeMb>20?200:503;ctx.res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});ctx.res.end(JSON.stringify({estado:status===200?'operacional':'degradado',base_de_dados:dbOk?'ok':'erro',espaco_livre_mb:freeMb}));});
 get('/entrar',async ctx=>ctx.user?redirect(ctx,'/painel'):html(ctx,V.authForm('entrar',ctx.csrf,ctx.url.searchParams.get('erro')||'')));
 get('/registar',async ctx=>ctx.user?redirect(ctx,'/painel'):html(ctx,V.authForm('registar',ctx.csrf,ctx.url.searchParams.get('erro')||'')));
 get('/recuperar',async ctx=>html(ctx,V.recoveryRequestPage(ctx.csrf)));
 post('/recuperar',async ctx=>{
   await rate(ctx,'recuperar',5,3600000);
   const email=s(ctx.body,'email').toLowerCase();
   const user=validMail(email)?await one(db,'SELECT * FROM users WHERE email=? AND is_active=1',email):null;
   if(user)await issueToken(db,user,'reset_password');
   html(ctx,V.recoveryRequestPage(ctx.csrf,'Se existir uma conta com este email, receberá instruções de recuperação.'));
 });
 get('/recuperar/:token',async ctx=>{
   if(!await peekToken(db,ctx.params.token,'reset_password'))return fail(ctx,404,'Ligação inválida ou expirada.');
   html(ctx,V.recoveryPasswordPage(ctx.csrf,ctx.params.token));
 });
 post('/recuperar/:token',async ctx=>{
   const token=ctx.params.token,password=s(ctx.body,'password');
   if(!passwordValid(password))reject('A palavra-passe deve ter no mínimo 10 caracteres, maiúsculas, minúsculas e números.');
   const record=await consumeToken(db,token,'reset_password');
   if(!record)return fail(ctx,403,'A ligação de recuperação já não é válida.');
   await transaction(db,async()=>{
     await run(db,'UPDATE users SET password_hash=? WHERE id=?',hashPassword(password),record.user_id);
     await run(db,'DELETE FROM sessions WHERE user_id=?',record.user_id);
     await audit(db,{id:record.user_id},'redefiniu_palavra_passe','user',record.user_id);
   });
   redirect(ctx,'/entrar','Palavra-passe alterada. Entre novamente.');
 });
 get('/verificar/:token',async ctx=>{
   if(!await peekToken(db,ctx.params.token,'verify_email'))return fail(ctx,404,'Ligação de confirmação inválida ou expirada.');
   html(ctx,V.verificationPage(ctx.csrf,ctx.params.token));
 });
 post('/verificar/:token',async ctx=>{
   const record=await consumeToken(db,ctx.params.token,'verify_email');
   if(!record)return fail(ctx,403,'Ligação inválida ou utilizada.');
   await run(db,'UPDATE users SET email_verified=1 WHERE id=?',record.user_id);
   await audit(db,{id:record.user_id},'confirmou_email','user',record.user_id);
   redirect(ctx,'/entrar','Email confirmado com sucesso.');
 });
 post('/entrar',async ctx=>{const email=s(ctx.body,'email').toLowerCase(),password=s(ctx.body,'password');await rate(ctx,'login-ip',30,15*60000);await checkBlocked(loginKey(email));const user=await one(db,'SELECT * FROM users WHERE email=?',email);if(!user||!checkPassword(password,user.password_hash)||!user.is_active){await loginFailure(email);redirect(ctx,'/entrar','Email ou palavra-passe incorrectos, ou conta bloqueada.',true);return;}await run(db,'DELETE FROM rate_limits WHERE key=?',limitKey(loginKey(email)));const token=randomToken(),csrf=randomToken();await run(db,'INSERT INTO sessions(token_hash,user_id,csrf,expires_at) VALUES (?,?,?,?)',hashToken(token),user.id,csrf,Date.now()+sessionHours*3600000);cookie(ctx,'ismma_session',token,sessionHours*3600);cookie(ctx,'ismma_csrf','',0);await audit(db,user,'iniciou_sessao','user',user.id);redirect(ctx,'/painel');});
 post('/registar',async ctx=>{await rate(ctx,'register',6,60*60000);const b=ctx.body;const role=s(b,'role'),name=s(b,'name'),email=s(b,'email').toLowerCase(),phone=s(b,'phone'),password=s(b,'password');if(!['estudante','candidato'].includes(role)||name.length<4||name.length>120||!validMail(email)||phone.length<8||phone.length>30||!passwordValid(password))reject('Verifique os campos. A palavra-passe deve ter 10 caracteres, maiúsculas, minúsculas e números.');let roster=null;const number=s(b,'student_number');if(role==='estudante'){
   roster=await one(db,"SELECT * FROM student_roster WHERE student_number=? AND status='activo'",number);
   if(!roster||normalizeName(roster.name)!==normalizeName(name)||await one(db,'SELECT id FROM users WHERE student_number=?',number))reject('Não foi possível validar. Contacte o Registo Académico.');
 }if(role==='candidato'&&!s(b,'desired_course'))reject('Indique o curso pretendido.');if(await one(db,'SELECT id FROM users WHERE email=?',email))reject('Já existe uma conta com este email.');const id=Number((await run(db,'INSERT INTO users(name,email,phone,password_hash,role,student_number,course,desired_course,student_verified,email_verified) VALUES (?,?,?,?,?,?,?,?,?,0)',name,email,phone,hashPassword(password),role,roster?.student_number||null,roster?.course||null,role==='candidato'?s(b,'desired_course'):null,roster?1:0)).lastInsertRowid);const user=await one(db,'SELECT * FROM users WHERE id=?',id);await audit(db,user,'criou_conta','user',id);await issueToken(db,user,'verify_email');const token=randomToken();await run(db,'INSERT INTO sessions(token_hash,user_id,csrf,expires_at) VALUES(?,?,?,?)',hashToken(token),id,randomToken(),Date.now()+sessionHours*3600000);cookie(ctx,'ismma_session',token,sessionHours*3600);redirect(ctx,'/painel','Conta criada com sucesso.');});
 post('/perfil/verificar-email',async ctx=>{
   await rate(ctx,'verificar-email',3,3600000);
   if(ctx.user.email_verified)redirect(ctx,'/perfil','O email já está confirmado.');
   else{await issueToken(db,ctx.user,'verify_email');redirect(ctx,'/perfil','Se o envio estiver configurado, receberá um email de confirmação.');}
 },{auth:true});
 get('/perfil/notificacoes',async ctx=>await page(ctx,'Preferências de notificações',V.notificationPreferences({user:ctx.user,csrf:ctx.csrf})),{auth:true});
 post('/perfil/notificacoes',async ctx=>{
   await run(db,'UPDATE users SET notify_email=?,notify_sms=? WHERE id=?',s(ctx.body,'notify_email')==='1'?1:0,s(ctx.body,'notify_sms')==='1'?1:0,ctx.user.id);
   await audit(db,ctx.user,'actualizou_preferencias_notificacoes','user',ctx.user.id);
   redirect(ctx,'/perfil/notificacoes','Preferências guardadas.');
 },{auth:true});
 post('/sair',async ctx=>{if(ctx.session)await run(db,'DELETE FROM sessions WHERE token_hash=?',ctx.session.token_hash);cookie(ctx,'ismma_session','',0);redirect(ctx,'/');},{auth:true});

 // Painel e pedidos de atendimento.
 get('/painel',async ctx=>await academicHome(ctx),{auth:true});
 get('/atendimento/painel',async ctx=>{const u=ctx.user;const scope=u.role==='administrador'?'1=1':u.role==='funcionario'?'t.department_id IN (SELECT department_id FROM department_staff WHERE user_id=?)':'t.user_id=?';const params=u.role==='administrador'?[]:[u.id];const stats=await one(db,`SELECT COUNT(*) AS total,COALESCE(SUM(CASE WHEN t.status IN ('aberto','em_analise','aguarda_utilizador') THEN 1 ELSE 0 END),0) AS pending,COALESCE(SUM(CASE WHEN t.status='respondido' THEN 1 ELSE 0 END),0) AS answered,COALESCE(SUM(CASE WHEN t.status='fechado' THEN 1 ELSE 0 END),0) AS closed FROM tickets t WHERE ${scope}`,...params);const recent=await all(db,`SELECT t.*,d.name AS department_name,u.name AS owner_name FROM tickets t JOIN departments d ON d.id=t.department_id JOIN users u ON u.id=t.user_id WHERE ${scope} ORDER BY t.updated_at DESC,t.id DESC LIMIT 6`,...params);await page(ctx,'Visão geral',V.dashboard({user:u,stats,recent,departments:await departmentsFor(u)}),'A sua actividade académica, num só lugar.');},{auth:true});
 get('/pedidos',async ctx=>{const f={pesquisa:ctx.url.searchParams.get('pesquisa')||'',estado:ctx.url.searchParams.get('estado')||'',departamento:ctx.url.searchParams.get('departamento')||'',responsavel:ctx.url.searchParams.get('responsavel')||''};let clauses=['1=1'],params=[];if(ctx.user.role==='funcionario'){clauses.push('t.department_id IN (SELECT department_id FROM department_staff WHERE user_id=?)');params.push(ctx.user.id);}else if(['estudante','candidato'].includes(ctx.user.role)){clauses.push('t.user_id=?');params.push(ctx.user.id);}
   if(staff(ctx.user)&&['meus','sem','atrasados'].includes(f.responsavel)){if(f.responsavel==='meus'){clauses.push('t.assigned_to=?');params.push(ctx.user.id);}if(f.responsavel==='sem')clauses.push('t.assigned_to IS NULL');if(f.responsavel==='atrasados'){clauses.push(overdueSql());params.push(num(await getSetting(db,'overdue_days','3'))*24);}}
   if(f.pesquisa){clauses.push('(t.protocol LIKE ? OR t.subject LIKE ? OR u.name LIKE ?)');params.push(...Array(3).fill('%'+f.pesquisa.slice(0,100)+'%'));}if(STATES.includes(f.estado)){clauses.push('t.status=?');params.push(f.estado);}if(num(f.departamento)){clauses.push('t.department_id=?');params.push(num(f.departamento));}const where=clauses.join(' AND ');const total=(await one(db,`SELECT COUNT(*) AS n FROM tickets t JOIN users u ON u.id=t.user_id LEFT JOIN categories c ON c.id=t.category_id WHERE ${where}`,...params)).n;const pageNumber=Math.max(1,Math.min(10000,num(ctx.url.searchParams.get('pagina'))||1));const rows=await all(db,`SELECT t.*,c.sla_hours,d.name AS department_name,u.name AS owner_name FROM tickets t JOIN departments d ON d.id=t.department_id JOIN users u ON u.id=t.user_id LEFT JOIN categories c ON c.id=t.category_id WHERE ${where} ORDER BY t.updated_at DESC,t.id DESC LIMIT 12 OFFSET ?`,...params,(pageNumber-1)*12);await page(ctx,'Pedidos de atendimento',(staff(ctx.user)?`<form class="filter-bar" method="get" action="/pedidos"><label>Responsável<select name="responsavel"><option value="">Todos</option><option value="meus" ${f.responsavel==='meus'?'selected':''}>Meus pedidos</option><option value="sem" ${f.responsavel==='sem'?'selected':''}>Sem responsável</option><option value="atrasados" ${f.responsavel==='atrasados'?'selected':''}>Em atraso</option></select></label><button class="btn btn-subtle">Filtrar por responsabilidade</button></form>`:'')+V.ticketList({rows,filters:f,departments:await departmentsFor(ctx.user),page:pageNumber,total}),'Consulte os seus protocolos e acompanhe as respostas.');},{auth:true});
 get('/pedidos/novo',async ctx=>{if(!await verifiedStudent(ctx.user))return fail(ctx,403,'Valide a sua conta no Registo Académico para criar pedidos.');const departments=await departmentsFor(null,true),categories=await all(db,'SELECT c.* FROM categories c JOIN departments d ON d.id=c.department_id WHERE c.is_active=1 AND d.is_active=1 AND (c.applies_to=? OR c.applies_to=\'ambos\') ORDER BY c.name',ctx.user.role);await page(ctx,'Novo pedido',V.newTicket({csrf:ctx.csrf,departments,categories}),'Envie um pedido ao departamento responsável.');},{auth:true,roles:['estudante','candidato']});
 post('/pedidos',async ctx=>{if(!await verifiedStudent(ctx.user))return fail(ctx,403,'Conta de estudante ainda não validada.');await rate(ctx,'ticket',12,60*60000);const uid=ctx.user.id,did=num(ctx.body.department_id),cid=num(ctx.body.category_id),subject=s(ctx.body,'subject'),description=s(ctx.body,'description');const dep=await one(db,'SELECT id FROM departments WHERE id=? AND is_active=1',did);const cat=await one(db,"SELECT id FROM categories WHERE id=? AND department_id=? AND is_active=1 AND (applies_to=? OR applies_to='ambos')",cid,did,ctx.user.role);if(!dep||!cat||subject.length<5||subject.length>160||description.length<10||description.length>5000)reject('Preencha o departamento, categoria, assunto e descrição correctamente.');const files=ctx.files.filter(f=>f.field==='anexos');await hasIssue(files);await scanUploads(ctx,files);const id=await transaction(db,async()=>{const ticketId=Number((await run(db,'INSERT INTO tickets(protocol,user_id,department_id,category_id,subject,description) VALUES (?,?,?,?,?,?)',randomToken(),uid,did,cid,subject,description)).lastInsertRowid);await run(db,'UPDATE tickets SET protocol=? WHERE id=?',`ISMMA-${new Date().getFullYear()}-${String(ticketId).padStart(6,'0')}`,ticketId);await storeAttachments(files,ticketId);await run(db,'INSERT INTO ticket_histories(ticket_id,user_id,action,to_value) VALUES (?,?,?,?)',ticketId,uid,'criado','aberto');await audit(db,ctx.user,'criou_pedido','ticket',ticketId,subject);await notifyTicket(ticketId,uid,'Novo pedido de atendimento',`Novo pedido ${subject} recebido.`);return ticketId;});redirect(ctx,`/pedidos/${id}`,'Pedido submetido. O protocolo já está disponível.');},{auth:true,roles:['estudante','candidato']});
 get('/pedidos/:id',async ctx=>{const ticket=await requireTicket(ctx);if(!ticket)return;const staffUser=staff(ctx.user);const visible=staffUser?'':' AND m.is_internal=0';const messages=await all(db,`SELECT m.*,u.name,u.role AS author_role FROM messages m JOIN users u ON u.id=m.user_id WHERE ticket_id=?${visible} ORDER BY m.id`,ticket.id);for(const m of messages)if(['funcionario','administrador'].includes(m.author_role)&&!m.is_internal)m.name=(await getSetting(db,'show_staff_name','0')==='1'?m.name+' · ':'')+'Resposta de '+ticket.department_name;const attachments=await all(db,`SELECT a.* FROM attachments a LEFT JOIN messages m ON m.id=a.message_id WHERE a.ticket_id=? ${staffUser?'':'AND (a.message_id IS NULL OR m.is_internal=0)'} ORDER BY a.id`,ticket.id);const histories=staffUser?await all(db,'SELECT * FROM ticket_histories WHERE ticket_id=? ORDER BY id DESC LIMIT 50',ticket.id):await all(db,"SELECT * FROM ticket_histories WHERE ticket_id=? AND action!='nota_interna' ORDER BY id DESC LIMIT 50",ticket.id);const departments=await departmentsFor(null,true);const templates=staffUser?await all(db,'SELECT * FROM reply_templates WHERE department_id=?',ticket.department_id):[];await page(ctx,ticket.protocol,V.ticketDetail({user:ctx.user,ticket,messages,attachments,histories,departments,staff:staffUser,templates,csrf:ctx.csrf,reopenDays:num(await getSetting(db,'reopen_days','7'))})+(staffUser?V.assignmentPanel({ticket,staffMembers:await all(db,"SELECT u.id,u.name FROM users u JOIN department_staff ds ON ds.user_id=u.id WHERE ds.department_id=? AND u.is_active=1 ORDER BY u.name",ticket.department_id),csrf:ctx.csrf,canAssign:ctx.user.role==='administrador'||ctx.user.id===ticket.assigned_to||!ticket.assigned_to,slaHours:await slaHours(ticket)}):''),'Detalhes e acompanhamento do seu atendimento.');},{auth:true});
 post('/pedidos/:id/mensagem',async ctx=>{await rate(ctx,'message',35,60*60000);const t=await requireTicket(ctx);if(!t)return;const body=s(ctx.body,'body'),internal=staff(ctx.user)&&s(ctx.body,'is_internal')==='1';if(body.length<2||body.length>5000)reject('A resposta deve ter entre 2 e 5000 caracteres.');if(t.status==='fechado'||(!staff(ctx.user)&&t.status==='respondido'))reject('Este pedido não está disponível para novas mensagens.');const files=ctx.files.filter(f=>f.field==='anexos');await hasIssue(files);await scanUploads(ctx,files);await transaction(db,async()=>{const msg=Number((await run(db,'INSERT INTO messages(ticket_id,user_id,body,is_internal) VALUES (?,?,?,?)',t.id,ctx.user.id,body,internal?1:0)).lastInsertRowid);await storeAttachments(files,t.id,msg);if(!internal){const newStatus=staff(ctx.user)?'respondido':'em_analise';await run(db,'UPDATE tickets SET status=?,updated_at=?,first_answer_at=CASE WHEN ?::int=1 THEN COALESCE(first_answer_at,?) ELSE first_answer_at END WHERE id=?',newStatus,now(),staff(ctx.user)?1:0,now(),t.id);await run(db,'INSERT INTO ticket_histories(ticket_id,user_id,action,from_value,to_value) VALUES(?,?,?,?,?)',t.id,ctx.user.id,'nova_resposta',t.status,newStatus);await notifyTicket(t.id,ctx.user.id,'Nova resposta no pedido',`Há uma nova mensagem no protocolo ${t.protocol}.`);}else{await run(db,'INSERT INTO ticket_histories(ticket_id,user_id,action,to_value) VALUES(?,?,?,?)',t.id,ctx.user.id,'nota_interna','nota reservada');}await audit(db,ctx.user,internal?'nota_interna':'respondeu','ticket',t.id);});redirect(ctx,`/pedidos/${t.id}`,'Mensagem enviada com sucesso.');},{auth:true});
 post('/pedidos/:id/estado',async ctx=>{const t=await requireTicket(ctx);if(!t)return;const status=s(ctx.body,'status'),priority=s(ctx.body,'priority');if(!STATES.includes(status)||!PRIORITIES.includes(priority))reject('Estado ou prioridade inválidos.');await setStatus(t,t.id,status,priority,ctx.user);if(status!==t.status)await notifyTicket(t.id,ctx.user.id,'Estado do pedido actualizado',`${t.protocol}: ${V.STATUS[status]}.`);redirect(ctx,`/pedidos/${t.id}`,'Pedido actualizado.');},{auth:true,roles:['administrador','funcionario']});
 post('/pedidos/:id/encaminhar',async ctx=>{const t=await requireTicket(ctx);if(!t)return;const did=num(ctx.body.department_id),target=await one(db,'SELECT * FROM departments WHERE id=? AND is_active=1',did);if(!target)reject('Departamento inválido ou inactivo.');if(did===t.department_id)return redirect(ctx,`/pedidos/${t.id}`,'O pedido já está neste departamento.');await transaction(db,async()=>{await run(db,'UPDATE tickets SET department_id=?,assigned_to=NULL,updated_at=? WHERE id=?',did,now(),t.id);await run(db,'INSERT INTO ticket_histories(ticket_id,user_id,action,from_value,to_value) VALUES (?,?,?,?,?)',t.id,ctx.user.id,'reencaminhado',t.department_name,target.name);await audit(db,ctx.user,'reencaminhou_pedido','ticket',t.id,`${t.department_name} → ${target.name}`);await notifyTicket(t.id,ctx.user.id,'Pedido reencaminhado',`${t.protocol} foi encaminhado para ${target.name}.`);});redirect(ctx,ctx.user.role==='administrador'?`/pedidos/${t.id}`:'/pedidos','Pedido encaminhado.');},{auth:true,roles:['administrador','funcionario']});
 post('/pedidos/:id/assumir',async ctx=>{
   const t=await requireTicket(ctx);if(!t)return;
   if(!staff(ctx.user))return fail(ctx,403,'Operação reservada à equipa.');
   if(t.assigned_to&&t.assigned_to!==ctx.user.id&&ctx.user.role!=='administrador')return fail(ctx,403,'Pedido atribuído a outro responsável.');
   await transaction(db,async()=>{
     await run(db,'UPDATE tickets SET assigned_to=?,updated_at=? WHERE id=?',ctx.user.id,now(),t.id);
     await run(db,'INSERT INTO ticket_histories(ticket_id,user_id,action,from_value,to_value) VALUES(?,?,?,?,?)',t.id,ctx.user.id,'atribuido',String(t.assigned_to||''),String(ctx.user.id));
     await audit(db,ctx.user,'assumiu_pedido','ticket',t.id);
   });redirect(ctx,`/pedidos/${t.id}`,'Pedido assumido.');
 },{auth:true,roles:['funcionario','administrador']});
 post('/pedidos/:id/atribuir',async ctx=>{
   const t=await requireTicket(ctx);if(!t)return;
   if(ctx.user.role!=='administrador'&&t.assigned_to!==ctx.user.id)return fail(ctx,403,'Só o administrador ou responsável pode atribuir este pedido.');
   const uid=num(ctx.body.assigned_to);
   const target=uid?await one(db,`SELECT u.id FROM users u JOIN department_staff ds ON ds.user_id=u.id
     WHERE u.id=? AND ds.department_id=? AND u.is_active=1 AND u.role='funcionario'`,uid,t.department_id):null;
   if(uid&&!target)reject('Funcionário não pertence ao departamento deste pedido.');
   await transaction(db,async()=>{
     await run(db,'UPDATE tickets SET assigned_to=?,updated_at=? WHERE id=?',uid||null,now(),t.id);
     await run(db,'INSERT INTO ticket_histories(ticket_id,user_id,action,from_value,to_value) VALUES(?,?,?,?,?)',t.id,ctx.user.id,'atribuido',String(t.assigned_to||''),String(uid||''));
     await audit(db,ctx.user,'atribuiu_pedido','ticket',t.id);
   });redirect(ctx,`/pedidos/${t.id}`,'Responsável actualizado.');
 },{auth:true,roles:['funcionario','administrador']});
 post('/pedidos/:id/reabrir',async ctx=>{const t=await requireTicket(ctx);if(!t)return;const days=num(await getSetting(db,'reopen_days','7'));const age=(Date.now()-new Date(t.updated_at.replace(' ','T')+'Z').getTime())/86400000;if(t.user_id!==ctx.user.id||t.status!=='respondido'||age>days)reject('O prazo de reabertura terminou ou este pedido não pode ser reaberto.');await setStatus(t,t.id,'em_analise',t.priority,ctx.user);await notifyTicket(t.id,ctx.user.id,'Pedido reaberto',`${t.protocol} foi reaberto pelo utilizador.`);redirect(ctx,`/pedidos/${t.id}`,'Pedido reaberto. Já pode enviar mensagens.');},{auth:true,roles:['estudante','candidato']});
 get('/anexos/:id',async ctx=>{const a=await one(db,'SELECT a.*,m.is_internal FROM attachments a LEFT JOIN messages m ON m.id=a.message_id WHERE a.id=?',num(ctx.params.id));const t=a?await ticketRow(a.ticket_id):null;if(!a||!await canTicket(ctx.user,t)||(!staff(ctx.user)&&a.is_internal)){fail(ctx,404,'Anexo não encontrado.');return;}await audit(db,ctx.user,'descarregou_anexo','attachment',a.id);sendFile(ctx,a.path,a.original_name,a.mime);},{auth:true});

 // Registo Académico: lista de estudantes confirmados (CSV importável).
 get('/admin/estudantes',async ctx=>{
   if(!await canRoster(ctx.user))return fail(ctx,403,'Acesso reservado ao Registo Académico.');
   const query=String(ctx.url.searchParams.get('pesquisa')||'').slice(0,80);
   const rows=await all(db,'SELECT * FROM student_roster WHERE name LIKE ? OR student_number LIKE ? ORDER BY id DESC LIMIT 100',`%${query}%`,`%${query}%`);
   await page(ctx,'Estudantes confirmados',V.studentRosterPage({rows,csrf:ctx.csrf,query}),
      'Lista de estudantes autorizados a registar contas.');
 },{auth:true,roles:['administrador','funcionario']});
 post('/admin/estudantes/previsualizar',async ctx=>{
   if(!await canRoster(ctx.user))return fail(ctx,403,'Acesso reservado ao Registo Académico.');
   const file=ctx.files.find(f=>f.field==='ficheiro');
   if(!file||!/\.csv$/i.test(file.filename)||file.data.length>1024*1024)reject('Seleccione um CSV até 1 MB.');
   const text=file.data.toString('utf8');const parsed=parseCsv(text);
   await page(ctx,'Pré-visualizar importação',V.studentRosterPage({rows:[],csrf:ctx.csrf,preview:{...parsed,text}}),
     'Confirme os dados depois de corrigir eventuais erros.');
 },{auth:true,roles:['administrador','funcionario']});
 post('/admin/estudantes/importar',async ctx=>{
   if(!await canRoster(ctx.user))return fail(ctx,403,'Acesso reservado ao Registo Académico.');
   const csv=s(ctx.body,'csv');if(Buffer.byteLength(csv)>1024*1024)reject('CSV demasiado grande.');
   const result=parseCsv(csv);if(result.errors.length)reject('Corrija os erros de validação antes de importar.');
   await transaction(db,async()=>{for(const r of result.rows)await run(db,`INSERT INTO student_roster(student_number,name,course,status,imported_by)
     VALUES(?,?,?,?,?) ON CONFLICT(student_number) DO UPDATE SET name=excluded.name,
     course=excluded.course,status=excluded.status,imported_at=now(),imported_by=excluded.imported_by`,
     r.number,r.name,r.course,r.status,ctx.user.id);
     await audit(db,ctx.user,'importou_lista_estudantes','student_roster',null,`${result.rows.length} registos`);
   });
   redirect(ctx,'/admin/estudantes',`${result.rows.length} registos importados.`);
 },{auth:true,roles:['administrador','funcionario']});
 post('/admin/estudantes/:id/estado',async ctx=>{
   if(!await canRoster(ctx.user))return fail(ctx,403,'Acesso reservado ao Registo Académico.');
   const record=await one(db,'SELECT * FROM student_roster WHERE id=?',num(ctx.params.id));
   if(!record)return fail(ctx,404,'Estudante não encontrado.');
   const status=record.status==='activo'?'inactivo':'activo';
   await run(db,'UPDATE student_roster SET status=? WHERE id=?',status,record.id);
   await audit(db,ctx.user,'actualizou_estado_estudante','student_roster',record.id,status);
   redirect(ctx,'/admin/estudantes','Estado do estudante actualizado.');
 },{auth:true,roles:['administrador','funcionario']});

 // Gestão e consulta de documentos (incluindo documentos públicos).
 get('/documentos',async ctx=>{const search=String(ctx.url.searchParams.get('pesquisa')||'').slice(0,80);const removed=ctx.url.searchParams.get('removidos')==='1'&&ctx.user?.role==='administrador';let where=removed?'d.deleted_at IS NOT NULL':'d.deleted_at IS NULL';const u=ctx.user;const params=[];if(search){where+=' AND (d.title LIKE ? OR d.category LIKE ? OR dp.name LIKE ?)';params.push(...Array(3).fill('%'+search+'%'));}if(!u)where+=" AND d.visibility='publico'";else if(u.role==='estudante')where+=await verifiedStudent(u)?" AND d.visibility IN ('publico','estudantes')":" AND d.visibility='publico'";else if(u.role==='candidato')where+=" AND d.visibility IN ('publico','candidatos')";else if(u.role==='funcionario')where+=" AND (d.visibility!='interno' OR d.department_id IN (SELECT department_id FROM department_staff WHERE user_id=?))",params.push(u.id);const documents=await all(db,`SELECT d.*,dp.name AS department_name FROM documents d LEFT JOIN departments dp ON dp.id=d.department_id WHERE ${where} ORDER BY d.published_at DESC,d.id DESC LIMIT 100`,...params);for(const d of documents)d.can_manage=!!(u&&staff(u)&&(u.role==='administrador'||(!d.deleted_at&&await manageDocument(u,d))));const departments=u&&staff(u)?await departmentsFor(u,true):[];const content=`<form class="filter-bar" method="get" action="/documentos"><input type="search" name="pesquisa" value="${V.e(search)}" placeholder="Título, categoria ou departamento" aria-label="Pesquisar documentos"><button class="btn btn-primary">Pesquisar</button></form>`+V.documentPage({documents,departments,canManage:staff(u),csrf:ctx.csrf,trash:removed});if(u)await page(ctx,'Documentos',content,'Editais, formulários e recursos académicos.');else html(ctx,V.publicLayout('Documentos',`<main class="public-docs"><h1>Documentos públicos</h1>${content}<p class="muted">Para consultar documentos reservados, <a href="/entrar">inicie sessão</a>.</p></main>`));});
 post('/documentos',async ctx=>{const did=num(ctx.body.department_id)||null;if(ctx.user.role==='funcionario'&&(!did||!await canStaffDepartment(ctx.user,did)))reject('Seleccione um dos seus departamentos.');const title=s(ctx.body,'title'),category=s(ctx.body,'category'),description=s(ctx.body,'description'),visibility=s(ctx.body,'visibility'),until=s(ctx.body,'valid_until');if(until&&!/^\d{4}-\d{2}-\d{2}$/.test(until))reject('Validade inválida.');if(title.length<3||title.length>150||category.length<2||category.length>80||description.length>600||!VISIBILITIES.includes(visibility))reject('Verifique os dados do documento.');if(did&&!await one(db,'SELECT 1 FROM departments WHERE id=? AND is_active=1',did))reject('Departamento inválido.');const files=ctx.files.filter(f=>f.field==='documento');await hasIssue(files,'document');await scanUploads(ctx,files);const f=(await saveFiles(files,'document'))[0];const id=Number((await run(db,'INSERT INTO documents(title,description,category,department_id,original_name,path,mime,size,visibility,uploaded_by,valid_until) VALUES (?,?,?,?,?,?,?,?,?,?,?)',title,description,category,did,f.original_name,f.path,f.mime,f.size,visibility,ctx.user.id,until||null)).lastInsertRowid);await run(db,'INSERT INTO document_versions(document_id,version,original_name,path,mime,size,uploaded_by,note) VALUES(?,1,?,?,?,?,?,?)',id,f.original_name,f.path,f.mime,f.size,ctx.user.id,'Publicação inicial');await audit(db,ctx.user,'publicou_documento','document',id,title);redirect(ctx,'/documentos','Documento publicado.');},{auth:true,roles:['administrador','funcionario']});
 post('/documentos/:id/substituir',async ctx=>{const d=await one(db,'SELECT * FROM documents WHERE id=? AND deleted_at IS NULL',num(ctx.params.id));if(!await manageDocument(ctx.user,d))return fail(ctx,404,'Documento não encontrado.');const files=ctx.files.filter(f=>f.field==='documento');await hasIssue(files,'document');await scanUploads(ctx,files);const updated=(await saveFiles(files,'document'))[0];await transaction(db,async()=>{const version=(await one(db,'SELECT COALESCE(MAX(version),0)+1 AS n FROM document_versions WHERE document_id=?',d.id)).n;
   await run(db,'INSERT INTO document_versions(document_id,version,original_name,path,mime,size,uploaded_by,note) VALUES(?,?,?,?,?,?,?,?)',d.id,version,updated.original_name,updated.path,updated.mime,updated.size,ctx.user.id,s(ctx.body,'replaces_note').slice(0,250));
   await run(db,'UPDATE documents SET original_name=?,path=?,mime=?,size=?,uploaded_by=?,published_at=?,replaces_note=? WHERE id=?',updated.original_name,updated.path,updated.mime,updated.size,ctx.user.id,now(),s(ctx.body,'replaces_note').slice(0,250),d.id);
   await audit(db,ctx.user,'substituiu_documento','document',d.id,`versão ${version}`);});redirect(ctx,'/documentos','Ficheiro substituído.');},{auth:true,roles:['administrador','funcionario']});
 get('/documentos/:id/versoes',async ctx=>{
   const doc=await one(db,'SELECT * FROM documents WHERE id=?',num(ctx.params.id));
   if(!await manageDocument(ctx.user,doc))return fail(ctx,404,'Documento não encontrado.');
   const versions=await all(db,`SELECT v.*,u.name AS uploaded_name FROM document_versions v
     LEFT JOIN users u ON u.id=v.uploaded_by WHERE v.document_id=? ORDER BY v.version DESC`,doc.id);
   await page(ctx,`Versões: ${doc.title}`,V.documentVersionsPage({document:doc,versions,csrf:ctx.csrf}),
     'Os ficheiros de versões anteriores continuam disponíveis.');
 },{auth:true,roles:['administrador','funcionario']});
 get('/documentos/:id/versoes/:version/descarregar',async ctx=>{
   const doc=await one(db,'SELECT * FROM documents WHERE id=?',num(ctx.params.id));
   if(!await manageDocument(ctx.user,doc))return fail(ctx,404,'Documento não encontrado.');
   const v=await one(db,'SELECT * FROM document_versions WHERE document_id=? AND version=?',doc.id,num(ctx.params.version));
   if(!v)return fail(ctx,404,'Versão não encontrada.');
   await audit(db,ctx.user,'descarregou_versao_documento','document',doc.id,`versão ${v.version}`);
   sendFile(ctx,v.path,v.original_name,v.mime);
 },{auth:true,roles:['administrador','funcionario']});
 get('/documentos/:id/descarregar' ,async ctx=>{const d=await one(db,'SELECT * FROM documents WHERE id=?',num(ctx.params.id));if(!await canDocument(ctx.user,d)){fail(ctx,404,'Documento indisponível.');return;}await audit(db,ctx.user,'descarregou_documento','document',d.id);sendFile(ctx,d.path,d.original_name,d.mime);});
 post('/documentos/:id/remover',async ctx=>{const d=await one(db,'SELECT * FROM documents WHERE id=? AND deleted_at IS NULL',num(ctx.params.id));if(!await manageDocument(ctx.user,d)){fail(ctx,404,'Documento não encontrado.');return;}await run(db,'UPDATE documents SET deleted_at=? WHERE id=?',now(),d.id);await audit(db,ctx.user,'removeu_documento','document',d.id,d.title);redirect(ctx,'/documentos','Documento removido.');},{auth:true,roles:['administrador','funcionario']});
 post('/documentos/:id/recuperar',async ctx=>{const d=await one(db,'SELECT * FROM documents WHERE id=? AND deleted_at IS NOT NULL',num(ctx.params.id));if(!d){fail(ctx,404,'Documento não encontrado.');return;}await run(db,'UPDATE documents SET deleted_at=NULL WHERE id=?',d.id);await audit(db,ctx.user,'recuperou_documento','document',d.id);redirect(ctx,'/documentos?removidos=1','Documento recuperado.');},{auth:true,roles:['administrador']});
 // Notificações e perfil.
 get('/notificacoes',async ctx=>{const items=await all(db,'SELECT * FROM notifications WHERE user_id=? ORDER BY created_at DESC,id DESC LIMIT 100',ctx.user.id);await page(ctx,'Notificações',V.notificationPage({items,csrf:ctx.csrf}),'Mantenha-se a par das actualizações.');},{auth:true});
 post('/notificacoes/lidas',async ctx=>{await run(db,'UPDATE notifications SET read_at=? WHERE user_id=? AND read_at IS NULL',now(),ctx.user.id);redirect(ctx,'/notificacoes','Notificações marcadas como lidas.');},{auth:true});
 get('/notificacoes/:id/abrir',async ctx=>{const n=await one(db,'SELECT * FROM notifications WHERE id=? AND user_id=?',num(ctx.params.id),ctx.user.id);if(!n){fail(ctx,404,'Notificação não encontrada.');return;}await run(db,'UPDATE notifications SET read_at=? WHERE id=?',now(),n.id);redirect(ctx,n.url.startsWith('/')&&!n.url.startsWith('//')?n.url:'/painel');},{auth:true});
 get('/perfil',async ctx=>await page(ctx,'Meu perfil',V.profile({user:ctx.user,csrf:ctx.csrf})+`<section class="panel form-panel"><h3>Notificações e email</h3><p>Estado do email: <strong>${ctx.user.email_verified?'Confirmado':'Por confirmar'}</strong></p><a class="btn btn-subtle" href="/perfil/notificacoes">Preferências de envio</a>${ctx.user.email_verified?'':`<form method="post" action="/perfil/verificar-email">${V.csrfField(ctx.csrf)}<button class="btn btn-subtle">Enviar email de confirmação</button></form>`}</section>`,'Actualize os seus dados e a palavra-passe.'),{auth:true});
 post('/perfil',async ctx=>{const name=s(ctx.body,'name'),phone=s(ctx.body,'phone'),current=s(ctx.body,'current_password'),newPassword=s(ctx.body,'new_password');if(name.length<4||name.length>120||phone.length<8||phone.length>30)reject('Preencha correctamente o nome e telefone.');if(newPassword&&(!checkPassword(current,ctx.user.password_hash)||!passwordValid(newPassword)))reject('Palavra-passe actual incorrecta ou nova palavra-passe fraca.');await run(db,'UPDATE users SET name=?,phone=?,password_hash=? WHERE id=?',name,phone,newPassword?hashPassword(newPassword):ctx.user.password_hash,ctx.user.id);await audit(db,ctx.user,'actualizou_perfil','user',ctx.user.id);redirect(ctx,'/perfil','Perfil actualizado.');},{auth:true});

 // Fila de notificações externas. A consulta não expõe o conteúdo de recuperação.
 get('/admin/notificacoes',async ctx=>{
   const items=await all(db,'SELECT id,recipient,channel,subject,status,attempts,last_error,created_at FROM mail_outbox ORDER BY id DESC LIMIT 150');
   await page(ctx,'Fila de notificações',V.mailQueuePage({items,csrf:ctx.csrf}),
     'Mensagens pendentes e falhas de envio.');
 },{auth:true,roles:['administrador']});
 post('/admin/notificacoes/:id/reenviar',async ctx=>{
   const id=num(ctx.params.id);const mail=await one(db,'SELECT id FROM mail_outbox WHERE id=?',id);
   if(!mail)return fail(ctx,404,'Notificação não encontrada.');
   await run(db,"UPDATE mail_outbox SET status='pendente',attempts=0,last_error=NULL,next_try_at=0 WHERE id=?",id);
   await audit(db,ctx.user,'reenviou_notificacao','mail_outbox',id);
   redirect(ctx,'/admin/notificacoes','Mensagem colocada novamente na fila.');
 },{auth:true,roles:['administrador']});
 // Administração: utilizadores.
 get('/admin/utilizadores',async ctx=>{const users=await all(db,`SELECT u.*,string_agg(d.name,', ') AS departments FROM users u LEFT JOIN department_staff s ON s.user_id=u.id LEFT JOIN departments d ON d.id=s.department_id GROUP BY u.id ORDER BY u.id DESC LIMIT 200`);await page(ctx,'Utilizadores',V.usersAdmin({users,departments:await departmentsFor(null),csrf:ctx.csrf}),'Gerir contas e permissões de acesso.');},{auth:true,roles:['administrador']});
 post('/admin/utilizadores',async ctx=>{const b=ctx.body,name=s(b,'name'),email=s(b,'email').toLowerCase(),phone=s(b,'phone'),role=s(b,'role'),password=s(b,'password'),deps=ints(b.departments);if(name.length<4||name.length>120||!validMail(email)||phone.length<8||phone.length>30||!ROLES.includes(role)||!passwordValid(password))reject('Verifique os dados de criação da conta.');if(await one(db,'SELECT id FROM users WHERE email=?',email))reject('Já existe um utilizador com este email.');if(role==='funcionario'&&!deps.length)reject('Associe o funcionário a, pelo menos, um departamento.');await transaction(db,async()=>{const id=Number((await run(db,'INSERT INTO users(name,email,phone,password_hash,role,student_number,course,desired_course) VALUES (?,?,?,?,?,?,?,?)',name,email,phone,hashPassword(password),role,s(b,'student_number')||null,s(b,'course')||null,s(b,'desired_course')||null)).lastInsertRowid);if(role==='funcionario')for(const did of deps){if(!await one(db,'SELECT id FROM departments WHERE id=?',did))reject('Departamento inválido.');await run(db,'INSERT INTO department_staff(user_id,department_id) VALUES (?,?)',id,did);}await audit(db,ctx.user,'criou_utilizador','user',id,email);});redirect(ctx,'/admin/utilizadores','Conta criada.');},{auth:true,roles:['administrador']});
 get('/admin/utilizadores/:id',async ctx=>{const record=await one(db,'SELECT * FROM users WHERE id=?',num(ctx.params.id));if(!record)return fail(ctx,404,'Utilizador não encontrado.');record.department_ids=(await all(db,'SELECT department_id FROM department_staff WHERE user_id=?',record.id)).map(x=>x.department_id);await page(ctx,'Editar utilizador',V.userEdit({record,departments:await departmentsFor(null),csrf:ctx.csrf}),'Gestão do perfil e associação aos departamentos.');},{auth:true,roles:['administrador']});
 post('/admin/utilizadores/:id/guardar',async ctx=>{const record=await one(db,'SELECT * FROM users WHERE id=?',num(ctx.params.id));if(!record)return fail(ctx,404,'Utilizador não encontrado.');const b=ctx.body,name=s(b,'name'),email=s(b,'email').toLowerCase(),phone=s(b,'phone'),role=s(b,'role'),password=s(b,'password'),deps=ints(b.departments);if(!ROLES.includes(role)||!validMail(email)||name.length<4||name.length>120||phone.length<8||phone.length>30||password&&!passwordValid(password))reject('Verifique os dados apresentados.');if(ctx.user.id===record.id&&role!=='administrador')reject('Não pode retirar o seu próprio perfil de administrador.');if(role==='funcionario'&&!deps.length)reject('Associe pelo menos um departamento ao funcionário.');await transaction(db,async()=>{await run(db,'UPDATE users SET name=?,email=?,phone=?,role=?,student_number=?,course=?,desired_course=?,password_hash=? WHERE id=?',name,email,phone,role,s(b,'student_number')||null,s(b,'course')||null,s(b,'desired_course')||null,password?hashPassword(password):record.password_hash,record.id);await run(db,'DELETE FROM department_staff WHERE user_id=?',record.id);if(role==='funcionario')for(const did of deps)await run(db,'INSERT INTO department_staff(user_id,department_id) VALUES (?,?)',record.id,did);await audit(db,ctx.user,'editou_utilizador','user',record.id,email);});redirect(ctx,'/admin/utilizadores','Utilizador actualizado.');},{auth:true,roles:['administrador']});
 post('/admin/utilizadores/:id/estado',async ctx=>{const record=await one(db,'SELECT * FROM users WHERE id=?',num(ctx.params.id));if(!record)return fail(ctx,404,'Utilizador não encontrado.');if(record.id===ctx.user.id)reject('Não pode bloquear a sua própria conta.');if(record.role==='administrador'&&record.is_active&&(await one(db,"SELECT COUNT(*) AS n FROM users WHERE role='administrador' AND is_active=1")).n<=1)reject('Tem de existir, pelo menos, um administrador activo.');await run(db,'UPDATE users SET is_active=? WHERE id=?',record.is_active?0:1,record.id);await run(db,'DELETE FROM sessions WHERE user_id=?',record.id);await audit(db,ctx.user,record.is_active?'bloqueou_conta':'activou_conta','user',record.id);redirect(ctx,'/admin/utilizadores','Estado da conta actualizado.');},{auth:true,roles:['administrador']});

 // Administração: departamentos e categorias.
 get('/admin/departamentos',async ctx=>await page(ctx,'Departamentos',V.departmentsAdmin({departments:await departmentsFor(null),csrf:ctx.csrf}),'Organização das áreas de atendimento.'),{auth:true,roles:['administrador']});
 post('/admin/departamentos',async ctx=>{const name=s(ctx.body,'name'),email=s(ctx.body,'email'),description=s(ctx.body,'description');if(name.length<3||name.length>90||description.length>500||(email&&!validMail(email)))reject('Verifique os dados do departamento.');const id=Number((await run(db,'INSERT INTO departments(name,slug,description,email) VALUES (?,?,?,?)',name,slugify(name),description,email)).lastInsertRowid);await audit(db,ctx.user,'criou_departamento','department',id,name);redirect(ctx,'/admin/departamentos','Departamento criado.');},{auth:true,roles:['administrador']});
 post('/admin/departamentos/:id/guardar',async ctx=>{const id=num(ctx.params.id),name=s(ctx.body,'name'),email=s(ctx.body,'email'),description=s(ctx.body,'description');if(name.length<3||name.length>90||description.length>500||(email&&!validMail(email)))reject('Verifique os dados do departamento.');await run(db,'UPDATE departments SET name=?,slug=?,email=?,description=? WHERE id=?',name,slugify(name),email,description,id);await audit(db,ctx.user,'editou_departamento','department',id,name);redirect(ctx,'/admin/departamentos','Departamento actualizado.');},{auth:true,roles:['administrador']});
 post('/admin/departamentos/:id/estado',async ctx=>{const d=await one(db,'SELECT * FROM departments WHERE id=?',num(ctx.params.id));if(!d)return fail(ctx,404,'Departamento não encontrado.');await run(db,'UPDATE departments SET is_active=? WHERE id=?',d.is_active?0:1,d.id);await audit(db,ctx.user,'alterou_departamento','department',d.id);redirect(ctx,'/admin/departamentos','Estado actualizado.');},{auth:true,roles:['administrador']});
 post('/admin/departamentos/:id/apagar',async ctx=>{const id=num(ctx.params.id);const total=(await one(db,'SELECT COUNT(*) AS n FROM tickets WHERE department_id=?',id)).n;if(total)reject('Não pode remover um departamento com pedidos. Pode desactivá-lo.');await run(db,'DELETE FROM departments WHERE id=?',id);await audit(db,ctx.user,'removeu_departamento','department',id);redirect(ctx,'/admin/departamentos','Departamento removido.');},{auth:true,roles:['administrador']});
 get('/admin/categorias',async ctx=>{const categories=await all(db,'SELECT c.*,d.name AS department_name FROM categories c JOIN departments d ON d.id=c.department_id ORDER BY d.name,c.name');await page(ctx,'Categorias',V.categoriesAdmin({categories,departments:await departmentsFor(null),csrf:ctx.csrf}),'Organize os assuntos do atendimento.');},{auth:true,roles:['administrador']});
 post('/admin/categorias',async ctx=>{const did=num(ctx.body.department_id),name=s(ctx.body,'name'),applies=s(ctx.body,'applies_to'),sla=num(ctx.body.sla_hours);if(!await one(db,'SELECT id FROM departments WHERE id=?',did)||name.length<2||name.length>90||!['ambos','estudante','candidato'].includes(applies)||sla<1||sla>2160)reject('Categoria ou prazo inválido.');const id=Number((await run(db,'INSERT INTO categories(department_id,name,applies_to,sla_hours) VALUES (?,?,?,?)',did,name,applies,sla)).lastInsertRowid);await audit(db,ctx.user,'criou_categoria','category',id,name);redirect(ctx,'/admin/categorias','Categoria criada.');},{auth:true,roles:['administrador']});
 post('/admin/categorias/:id/prazo',async ctx=>{
   const id=num(ctx.params.id),sla=num(ctx.body.sla_hours);
   if(!await one(db,'SELECT id FROM categories WHERE id=?',id))return fail(ctx,404,'Categoria não encontrada.');
   if(sla<1||sla>2160)reject('O prazo deve estar entre 1 e 2160 horas.');
   await run(db,'UPDATE categories SET sla_hours=? WHERE id=?',sla,id);
   await audit(db,ctx.user,'actualizou_prazo','category',id,`prazo ${sla} horas`);
   redirect(ctx,'/admin/categorias','Prazo actualizado.');
 },{auth:true,roles:['administrador']});
 post('/admin/categorias/:id/estado',async ctx=>{const c=await one(db,'SELECT * FROM categories WHERE id=?',num(ctx.params.id));if(!c)return fail(ctx,404,'Categoria não encontrada.');await run(db,'UPDATE categories SET is_active=? WHERE id=?',c.is_active?0:1,c.id);await audit(db,ctx.user,'alterou_categoria','category',c.id);redirect(ctx,'/admin/categorias','Estado da categoria actualizado.');},{auth:true,roles:['administrador']});

 // Modelos de respostas rápidas.
 get('/modelos',async ctx=>{const departments=await departmentsFor(ctx.user,true);const templates=ctx.user.role==='administrador'?await all(db,'SELECT t.*,d.name AS department_name FROM reply_templates t JOIN departments d ON d.id=t.department_id ORDER BY t.id DESC'):await all(db,'SELECT t.*,d.name AS department_name FROM reply_templates t JOIN departments d ON d.id=t.department_id WHERE t.department_id IN (SELECT department_id FROM department_staff WHERE user_id=?) ORDER BY t.id DESC',ctx.user.id);await page(ctx,'Respostas rápidas',V.templatesPage({templates,departments,csrf:ctx.csrf}),'Modelos para respostas mais rápidas e consistentes.');},{auth:true,roles:['administrador','funcionario']});
 post('/modelos',async ctx=>{const did=num(ctx.body.department_id),title=s(ctx.body,'title'),body=s(ctx.body,'body');if(!await canStaffDepartment(ctx.user,did)||title.length<2||title.length>120||body.length<4||body.length>4000)reject('Verifique os dados do modelo e o departamento.');const id=Number((await run(db,'INSERT INTO reply_templates(department_id,title,body) VALUES(?,?,?)',did,title,body)).lastInsertRowid);await audit(db,ctx.user,'criou_modelo','reply_template',id);redirect(ctx,'/modelos','Modelo criado.');},{auth:true,roles:['administrador','funcionario']});
 post('/modelos/:id/apagar',async ctx=>{const t=await one(db,'SELECT * FROM reply_templates WHERE id=?',num(ctx.params.id));if(!t||!await canStaffDepartment(ctx.user,t.department_id))return fail(ctx,404,'Modelo não encontrado.');await run(db,'DELETE FROM reply_templates WHERE id=?',t.id);await audit(db,ctx.user,'removeu_modelo','reply_template',t.id);redirect(ctx,'/modelos','Modelo removido.');},{auth:true,roles:['administrador','funcionario']});

 // Configurações e relatórios.
 get('/admin/configuracoes',async ctx=>{const settings={};for(const x of await all(db,'SELECT * FROM settings'))settings[x.key]=x.value;await page(ctx,'Configurações',V.settingsAdmin({settings,csrf:ctx.csrf}),'Ajuste os parâmetros gerais da plataforma.');},{auth:true,roles:['administrador']});
 post('/admin/configuracoes',async ctx=>{const keys=['institution_name','contact_email','reopen_days','overdue_days','max_document_mb','show_staff_name'];for(const k of keys){const val=s(ctx.body,k);if(!val||val.length>150)reject(`Campo ${k} inválido.`);if(k==='contact_email'&&!validMail(val))reject('Email inválido.');if(k==='show_staff_name'&&!['0','1'].includes(val))reject('Configuração de identificação inválida.');if(k.endsWith('_days')||k==='max_document_mb'){if(!/^\d+$/.test(val)||num(val)<1||num(val)>(k==='max_document_mb'?20:90))reject(`Valor de ${k} inválido.`);}await run(db,'INSERT INTO settings(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',k,val);}await audit(db,ctx.user,'actualizou_configuracoes','settings',null);redirect(ctx,'/admin/configuracoes','Configurações guardadas.');},{auth:true,roles:['administrador']});
 async function reportData(ctx){const range={inicio:ctx.url.searchParams.get('inicio')||'',fim:ctx.url.searchParams.get('fim')||''};const where=[];const vals=[];if(/^\d{4}-\d\d-\d\d$/.test(range.inicio)){where.push('t.created_at >= ?');vals.push(range.inicio+' 00:00:00');}if(/^\d{4}-\d\d-\d\d$/.test(range.fim)){where.push('t.created_at <= ?');vals.push(range.fim+' 23:59:59');}const sql=where.length?'WHERE '+where.join(' AND '):'';const totals=(await one(db,`SELECT COUNT(*) AS n FROM tickets t ${sql}`,...vals)).n;const byDep=await all(db,`SELECT d.name,COUNT(*) AS count FROM tickets t JOIN departments d ON d.id=t.department_id ${sql} GROUP BY d.id ORDER BY count DESC`,...vals);const byStatus=await all(db,`SELECT t.status,COUNT(*) AS count FROM tickets t ${sql} GROUP BY t.status ORDER BY count DESC`,...vals);const active=(await one(db,'SELECT COUNT(*) AS n FROM users WHERE is_active=1')).n;const overdue=num(await getSetting(db,'overdue_days','3'));const overdueCount=(await one(db,`SELECT COUNT(*) AS n FROM tickets t LEFT JOIN categories c ON c.id=t.category_id WHERE ${overdueSql()}`,overdue*24)).n;const avg=(await one(db,`SELECT ROUND(AVG(EXTRACT(EPOCH FROM (first_answer_at-created_at))/3600)::numeric,1) AS h FROM tickets t ${sql}`, ...vals)).h||0;return {range,totals,byDep,byStatus,active,overdue:overdueCount,avg};}
 get('/admin/relatorios',async ctx=>await page(ctx,'Relatórios',V.reportsPage(await reportData(ctx)),'Indicadores de desempenho dos atendimentos.'),{auth:true,roles:['administrador']});
 get('/admin/relatorios.csv',async ctx=>{const d=await reportData(ctx);let lines=[['Relatório ISMMA','Pedidos por departamento'],['Departamento','Total de pedidos'],...d.byDep.map(x=>[x.name,x.count]),[],['Estado','Total de pedidos'],...d.byStatus.map(x=>[V.STATUS[x.status],x.count])];const csv='\ufeff'+lines.map(row=>row.map(v=>{let text=String(v??'');if(/^[=+@\-\t\r]/.test(text))text="'"+text;return '"'+text.replace(/"/g,'""')+'"';}).join(';')).join('\r\n');ctx.res.writeHead(200,{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="ismma-relatorio.csv"'});ctx.res.end(csv);await audit(db,ctx.user,'exportou_relatorio','report',null);},{auth:true,roles:['administrador']});
 get('/admin/auditoria',async ctx=>{const logs=await all(db,'SELECT l.*,u.name FROM activity_log l LEFT JOIN users u ON u.id=l.actor_id ORDER BY l.id DESC LIMIT 100');await page(ctx,'Auditoria',V.auditPage({logs}),'Consulta do registo de actividades do sistema.');},{auth:true,roles:['administrador']});

 ({academicHome}=registerAcademicRoutes({db,get,post,page,html,fail,redirect,reject,rate,uploadDir}));

 async function handler(req,res){
   const ctx={req,res,user:null,session:null,csrf:'',cookiesOut:[],params:{},body:{},files:[]};
   const start=process.hrtime.bigint();
   res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');res.setHeader('X-Frame-Options','DENY');res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=()');res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: https://i0.wp.com https://mail.maisvagas.co.mz; font-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");if(environment==='production')res.setHeader('Strict-Transport-Security','max-age=31536000; includeSubDomains');
   try{
     ctx.url=new URL(req.url,`http://${req.headers.host||'localhost'}`);
     if(req.method==='GET'&&staticFile(ctx))return;
     const cookies=parseCookies(req.headers.cookie);const token=cookies.ismma_session;
     if(token){const session=await one(db,'SELECT * FROM sessions WHERE token_hash=? AND expires_at>?',hashToken(token),Date.now());if(session){const user=await one(db,'SELECT * FROM users WHERE id=? AND is_active=1',session.user_id);if(user){ctx.user=user;ctx.session=session;ctx.csrf=session.csrf;}}}
     if(!ctx.csrf){ctx.csrf=/^[a-f0-9]{64}$/.test(cookies.ismma_csrf||'')?cookies.ismma_csrf:randomToken();if(ctx.csrf!==cookies.ismma_csrf)cookie(ctx,'ismma_csrf',ctx.csrf,7200);}
     if(req.method==='POST'){
       const body=await readBody(req);ctx.body=body.fields;ctx.files=body.files;
       const csrf=s(ctx.body,'_csrf');const x=Buffer.from(csrf),y=Buffer.from(ctx.csrf);
       if(!verifyOrigin(ctx)||x.length!==y.length||!crypto.timingSafeEqual(x,y))return fail(ctx,403,'Sessão expirada ou formulário inválido. Actualize a página.');
     }
     for(const r of routes){if(r.method!==req.method)continue;const m=r.rx.exec(ctx.url.pathname);if(!m)continue;for(let i=0;i<r.keys.length;i++)ctx.params[r.keys[i]]=decodeURIComponent(m[i+1]);if(r.auth&&!ctx.user)return redirect(ctx,'/entrar','Inicie sessão para continuar.',true);if(r.roles.length&&!r.roles.includes(ctx.user?.role))return fail(ctx,403,'Não tem permissão para esta operação.');return await r.handler(ctx);}
     if(req.method==='GET')return fail(ctx,404,'Página não encontrada.');return fail(ctx,405,'Operação não permitida.');
   }catch(err){
     if(err.status===413)return fail(ctx,413,err.message);
     if(['23505','23503','23514'].includes(err.code))err=new Error('Não foi possível concluir: o registo já existe ou está associado a outros dados.');
     if(environment!=='test')console.error('[ISMMA] Erro:',err.code||'erro_de_pedido');
     if(req.method==='POST'&&ctx.url)goBack(ctx,err.message||'Não foi possível concluir o pedido.');else fail(ctx,500,'Não foi possível carregar esta página.');
   }finally{const elapsed=Number(process.hrtime.bigint()-start)/1e6;if(elapsed>2000&&environment!=='test')console.warn('[ISMMA] Pedido lento:',req.url,elapsed.toFixed(0)+'ms');}
 }
 const server=http.createServer(handler);
 server.handler=handler;
 return server;
}
module.exports={makeApp};
