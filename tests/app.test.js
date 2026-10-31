'use strict';
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {one}=require('../src/db');
const {hashPassword,checkPassword,validateFile}=require('../src/security');
const {startPortal}=require('./helpers/portal');

let portal,db,base;
async function request(route,{method='GET',body=null,cookies='',headers={}}={}){
 const init={method,headers:{...headers},redirect:'manual'};
 if(cookies)init.headers.cookie=cookies;
 if(body instanceof FormData){init.body=body;}
 else if(body){init.headers['Content-Type']='application/x-www-form-urlencoded';init.body=new URLSearchParams(body).toString();}
 const response=await fetch(base+route,init);
 const text=await response.text();
 return {status:response.status,headers:response.headers,text,location:response.headers.get('location')};
}
function cookiesFrom(resp){return resp.headers.getSetCookie().map(x=>x.split(';')[0]).join('; ');}
function csrfFrom(resp){const match=resp.text.match(/name="_csrf" value="([a-f0-9]{64})"/);assert.ok(match,'CSRF em página HTML');return match[1];}
async function login(email,password='Demonstracao@2026'){
 const get=await request('/entrar');const csrf=csrfFrom(get);let cookie=cookiesFrom(get);
 const post=await request('/entrar',{method:'POST',cookies:cookie,body:{email,password,_csrf:csrf}});
 assert.equal(post.status,303,post.text);assert.equal(post.location,'/painel');
 const session=post.headers.getSetCookie().find(x=>x.startsWith('ismma_session='));assert.ok(session);cookie=session.split(';')[0];
 const painel=await request('/painel',{cookies:cookie});assert.equal(painel.status,200);
 return {cookies:cookie,csrf:csrfFrom(painel)};
}
function formWithCsrf(session,data){return {...data,_csrf:session.csrf};}
before(async()=>{
 portal=await startPortal();db=portal.db;base=portal.base;
});
after(async()=>{await portal.close();});
test('página inicial e CSS respondem sem login',async()=>{const r=await request('/');assert.equal(r.status,200);assert.match(r.text,/Portal Académico/);assert.match(r.text,/m5-service-grid/);const theme=await request('/portal-v5.css');assert.equal(theme.status,200);assert.match(theme.text,/\.m5-public-grid/);assert.match(r.text,/português|Moçambique/i);const css=await request('/app.css');assert.equal(css.status,200);assert.match(css.headers.get('content-type'),/text\/css/);});
test('PostgreSQL cria instituição, categorias e contas de teste isoladas',async()=>{assert.equal((await one(db,'SELECT COUNT(*) AS n FROM departments')).n,5);assert.ok((await one(db,'SELECT COUNT(*) AS n FROM users')).n>=8);assert.ok(await one(db,'SELECT id FROM tickets WHERE protocol LIKE ?',`ISMMA-%`));assert.ok(checkPassword('Demonstracao@2026',(await one(db,"SELECT password_hash FROM users WHERE email='admin@ismma.test'")).password_hash));});
test('login correcto, permissões e redireccionamento',async()=>{const u=await login('estudante@ismma.test');const d=await request('/admin/utilizadores',{cookies:u.cookies});assert.equal(d.status,403);assert.match(d.text,/permissão/);const n=await request('/pedidos/novo',{cookies:u.cookies});assert.equal(n.status,200);});
test('conta inválida não inicia sessão',async()=>{const initial=await request('/entrar');const resp=await request('/entrar',{method:'POST',cookies:cookiesFrom(initial),body:{_csrf:csrfFrom(initial),email:'estudante@ismma.test',password:'errado'}});assert.equal(resp.status,303);assert.match(resp.location,/erro=/);});
test('CSRF obrigatório nos formulários',async()=>{const user=await login('estudante@ismma.test');const resp=await request('/perfil',{method:'POST',cookies:user.cookies,body:{name:'Nome Novo',phone:'841231234'}});assert.equal(resp.status,403);});
test('estudante só consulta os seus pedidos',async()=>{const u=await login('estudante@ismma.test');const candidateTicket=await one(db,'SELECT id FROM tickets WHERE user_id=4');const forbidden=await request('/pedidos/'+candidateTicket.id,{cookies:u.cookies});assert.equal(forbidden.status,404);});
test('candidato só pode criar pedidos em categorias autorizadas',async()=>{const u=await login('candidato@ismma.test');const studentCategory=await one(db,"SELECT id FROM categories WHERE department_id=2 AND applies_to='estudante'");const initial=(await one(db,'SELECT COUNT(*) AS n FROM tickets')).n;const bad=await request('/pedidos',{method:'POST',cookies:u.cookies,headers:{Referer:base+'/pedidos/novo'},body:formWithCsrf(u,{department_id:'2',category_id:String(studentCategory.id),subject:'Pedido para teste',description:'Pretendo obter informações sobre o atendimento académico.'})});assert.equal(bad.status,303);assert.equal((await one(db,'SELECT COUNT(*) AS n FROM tickets')).n,initial);});
test('estudante cria pedido e recebe protocolo único',async()=>{const u=await login('estudante@ismma.test');const category=await one(db,"SELECT id FROM categories WHERE department_id=1 AND applies_to IN ('ambos','estudante') LIMIT 1");const response=await request('/pedidos',{method:'POST',cookies:u.cookies,body:formWithCsrf(u,{department_id:'1',category_id:String(category.id),subject:'Informações sobre matrícula 2026',description:'Gostaria de saber quando inicia o processo de matrícula no ISMMA.'})});assert.equal(response.status,303,response.text);assert.match(response.location,/^\/pedidos\/\d+/);const id=Number(response.location.match(/\d+/)[0]);const t=await one(db,'SELECT * FROM tickets WHERE id=?',id);assert.match(t.protocol,/^ISMMA-\d{4}-\d{6}$/);const detail=await request(`/pedidos/${id}`,{cookies:u.cookies});assert.equal(detail.status,200);assert.match(detail.text,/Informações sobre matrícula 2026/);});
test('funcionário responde a pedidos do seu departamento e só vê os seus',async()=>{const u=await login('secretaria@ismma.test');const ticket=await one(db,'SELECT id FROM tickets WHERE department_id=1 ORDER BY id LIMIT 1');const response=await request(`/pedidos/${ticket.id}/mensagem`,{method:'POST',cookies:u.cookies,body:formWithCsrf(u,{body:'A Secretaria está a analisar o seu pedido.'})});assert.equal(response.status,303);assert.equal((await one(db,'SELECT status FROM tickets WHERE id=?',ticket.id)).status,'respondido');const other=await one(db,'SELECT id FROM tickets WHERE department_id=4 LIMIT 1');const denied=await request(`/pedidos/${other.id}`,{cookies:u.cookies});assert.equal(denied.status,404);});
test('notas internas não aparecem para o estudante',async()=>{const staff=await login('secretaria@ismma.test');const student=await login('estudante@ismma.test');const ticket=await one(db,'SELECT id FROM tickets WHERE user_id=3 AND department_id=1 LIMIT 1');const response=await request(`/pedidos/${ticket.id}/mensagem`,{method:'POST',cookies:staff.cookies,body:formWithCsrf(staff,{body:'NOTA SEGREDO DO FUNCIONARIO',is_internal:'1'})});assert.equal(response.status,303);const visible=await request(`/pedidos/${ticket.id}`,{cookies:student.cookies});assert.doesNotMatch(visible.text,/NOTA SEGREDO DO FUNCIONARIO|nota reservada|nota_interna/);});
test('estado e prioridade podem ser alterados só por funcionário',async()=>{const staff=await login('secretaria@ismma.test');const student=await login('estudante@ismma.test');const ticket=await one(db,'SELECT id FROM tickets WHERE department_id=1 LIMIT 1');const denied=await request(`/pedidos/${ticket.id}/estado`,{method:'POST',cookies:student.cookies,body:formWithCsrf(student,{status:'fechado',priority:'alta'})});assert.equal(denied.status,403);const okay=await request(`/pedidos/${ticket.id}/estado`,{method:'POST',cookies:staff.cookies,body:formWithCsrf(staff,{status:'fechado',priority:'alta'})});assert.equal(okay.status,303);assert.equal((await one(db,'SELECT status FROM tickets WHERE id=?',ticket.id)).status,'fechado');});
test('administrador cria departamentos e tem acesso a relatórios',async()=>{const admin=await login('admin@ismma.test');const r=await request('/admin/departamentos',{cookies:admin.cookies});assert.equal(r.status,200);const created=await request('/admin/departamentos',{method:'POST',cookies:admin.cookies,body:formWithCsrf(admin,{name:'Biblioteca e Arquivo',email:'biblioteca@ismma.test',description:'Documentação académica'})});assert.equal(created.status,303);assert.ok(await one(db,"SELECT id FROM departments WHERE name='Biblioteca e Arquivo'"));const csv=await request('/admin/relatorios.csv',{cookies:admin.cookies});assert.equal(csv.status,200);assert.match(csv.text,/Relatório ISMMA/);});
test('uploads validam o conteúdo real, não só a extensão',()=>{const good={filename:'edital.pdf',data:Buffer.from('%PDF-1.7\nDocumento de teste')};assert.equal(validateFile(good,{type:'document',maxBytes:1000}).mime,'application/pdf');assert.throws(()=>validateFile({filename:'edital.pdf',data:Buffer.from('<script>')},{type:'document',maxBytes:1000}),/tipo ou conteúdo/);});
test('documento privado não é descarregado por candidato',async()=>{
 const admin=await login('admin@ismma.test');const candidate=await login('candidato@ismma.test');
 const form=new FormData();form.set('_csrf',admin.csrf);form.set('title','Regulamento para estudantes');form.set('category','Regulamentos');form.set('visibility','estudantes');form.set('description','Informação de demonstração');form.set('documento',new Blob([Buffer.from('%PDF-1.7\nTeste privado')],{type:'application/pdf'}),'regulamento.pdf');
 const uploaded=await request('/documentos',{method:'POST',cookies:admin.cookies,body:form});assert.equal(uploaded.status,303);
 const d=await one(db,"SELECT id FROM documents WHERE title='Regulamento para estudantes'");assert.ok(d);
 const denied=await request(`/documentos/${d.id}/descarregar`,{cookies:candidate.cookies});assert.equal(denied.status,404);
 const student=await login('estudante@ismma.test');const allowed=await request(`/documentos/${d.id}/descarregar`,{cookies:student.cookies});assert.equal(allowed.status,200);assert.match(allowed.text,/%PDF-1.7/);
});
test('registo e envio de notificações na aplicação',async()=>{const u=await login('estudante@ismma.test');const p=await request('/notificacoes',{cookies:u.cookies});assert.equal(p.status,200);assert.match(p.text,/Centro de notificações/);const marked=await request('/notificacoes/lidas',{method:'POST',cookies:u.cookies,body:formWithCsrf(u,{})});assert.equal(marked.status,303);assert.equal((await one(db,'SELECT COUNT(*) AS n FROM notifications WHERE user_id=3 AND read_at IS NULL')).n,0);});
test('novo candidato cria conta pelo formulário sem serviços externos',async()=>{
 const page=await request('/registar');const csrf=csrfFrom(page),cookies=cookiesFrom(page);
 const unique=`novo.candidato.${Date.now()}@exemplo.test`;
 const response=await request('/registar',{method:'POST',cookies,body:{_csrf:csrf,role:'candidato',name:'Ernesto Muianga',phone:'+258 87 234 5678',email:unique,password:'SenhaSegura2026',desired_course:'Licenciatura em Gestão'}});
 assert.equal(response.status,303);assert.match(response.location,/^\/painel\?mensagem=/);
 assert.equal((await one(db,'SELECT role FROM users WHERE email=?',unique)).role,'candidato');
});
test('anexos de pedidos são privados e não aceitam conteúdo falsificado',async()=>{
 const student=await login('estudante@ismma.test');
 const category=await one(db,"SELECT id FROM categories WHERE department_id=1 AND applies_to='ambos' LIMIT 1");
 const form=new FormData();form.set('_csrf',student.csrf);form.set('department_id','1');form.set('category_id',String(category.id));form.set('subject','Pedido com anexo privado');form.set('description','Pedido de demonstração sobre documentos académicos com um anexo.');form.append('anexos',new Blob([Buffer.from('%PDF-1.7\nAnexo privado')],{type:'application/pdf'}),'informacao.pdf');
 const created=await request('/pedidos',{method:'POST',cookies:student.cookies,body:form});assert.equal(created.status,303);
 const id=Number(created.location.match(/\d+/)[0]),attachment=await one(db,'SELECT * FROM attachments WHERE ticket_id=?',id);assert.ok(attachment);
 const candidate=await login('candidato@ismma.test');assert.equal((await request(`/anexos/${attachment.id}`,{cookies:candidate.cookies})).status,404);
 assert.equal((await request(`/anexos/${attachment.id}`,{cookies:student.cookies})).status,200);
 const invalid=new FormData();invalid.set('_csrf',student.csrf);invalid.set('department_id','1');invalid.set('category_id',String(category.id));invalid.set('subject','Pedido com extensão errada');invalid.set('description','Validação de ficheiros com extensões falsas no servidor.');invalid.append('anexos',new Blob([Buffer.from('<html>Falso PDF</html>')],{type:'application/pdf'}),'falso.pdf');
 const count=(await one(db,'SELECT COUNT(*) AS n FROM tickets')).n;const denied=await request('/pedidos',{method:'POST',cookies:student.cookies,body:invalid});assert.equal(denied.status,303);assert.equal((await one(db,'SELECT COUNT(*) AS n FROM tickets')).n,count);
});
test('administrador consegue substituir, remover e recuperar documento',async()=>{
 const admin=await login('admin@ismma.test');const d=await one(db,'SELECT * FROM documents LIMIT 1');assert.ok(d);
 const body=new FormData();body.set('_csrf',admin.csrf);body.set('documento',new Blob([Buffer.from('%PDF-1.7\nNova versao')],{type:'application/pdf'}),'nova.pdf');
 const replaced=await request(`/documentos/${d.id}/substituir`,{method:'POST',cookies:admin.cookies,body});assert.equal(replaced.status,303);
 const latest=await one(db,'SELECT * FROM documents WHERE id=?',d.id);assert.notEqual(latest.path,d.path);assert.equal(latest.original_name,'nova.pdf');
 const removed=await request(`/documentos/${d.id}/remover`,{method:'POST',cookies:admin.cookies,body:formWithCsrf(admin,{})});assert.equal(removed.status,303);
 assert.ok((await one(db,'SELECT deleted_at FROM documents WHERE id=?',d.id)).deleted_at);
 const recovery=await request(`/documentos/${d.id}/recuperar`,{method:'POST',cookies:admin.cookies,body:formWithCsrf(admin,{})});assert.equal(recovery.status,303);
 assert.equal((await one(db,'SELECT deleted_at FROM documents WHERE id=?',d.id)).deleted_at,null);
});
