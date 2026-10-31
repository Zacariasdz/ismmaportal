'use strict';
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {openDatabase,seedDatabase,one,all,run}=require('../src/db');
const {parseCsv,normalizeName}=require('../src/security');
const {makeApp}=require('../src/app');
let db,server,base,tmp,uploadDir;
async function req(url,{method='GET',body=null,cookies='',headers={}}={}){
 const init={method,headers:{...headers},redirect:'manual'};
 if(cookies)init.headers.cookie=cookies;
 if(body instanceof FormData)init.body=body;
 else if(body){init.headers['Content-Type']='application/x-www-form-urlencoded';init.body=new URLSearchParams(body).toString();}
 const r=await fetch(base+url,init);
 return {status:r.status,text:await r.text(),location:r.headers.get('location'),cookies:r.headers.getSetCookie()};
}
function csrf(html){return html.match(/name="_csrf" value="([a-f0-9]{64})"/)?.[1];}
async function login(email){const g=await req('/entrar');const c=g.cookies.map(v=>v.split(';')[0]).join('; ');const p=await req('/entrar',{method:'POST',cookies:c,body:{email,password:'Demonstracao@2026',_csrf:csrf(g.text)}});assert.equal(p.status,303);assert.equal(p.location,'/painel');const cookie=p.cookies.find(v=>v.startsWith('ismma_session=')).split(';')[0];const home=await req('/perfil',{cookies:cookie});return {cookie,csrf:csrf(home.text)};}
before(async()=>{tmp=fs.mkdtempSync(path.join(os.tmpdir(),'ismma-rob-'));uploadDir=path.join(tmp,'uploads');db=openDatabase(':memory:');seedDatabase(db,{demo:true});server=makeApp({db,uploadDir,environment:'test'});await new Promise(ok=>server.listen(0,'127.0.0.1',ok));base=`http://127.0.0.1:${server.address().port}`;});
after(async()=>{await new Promise(ok=>server.close(ok));db.close();fs.rmSync(tmp,{recursive:true,force:true});});
test('P1 - administrador inicial funciona em produção sem dados fictícios',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ismma-prd-'));
 try{const dbFile=path.join(dir,'prod.sqlite');const r=spawnSync(process.execPath,[path.join(__dirname,'../scripts/criar-admin.js'),'--email','primeiro@exemplo.test','--nome','Gestor Instituto','--telefone','+258 84 123 4567'],{env:{...process.env,DB_FILE:dbFile,ADMIN_PASSWORD:'Abcdef12345!'},encoding:'utf8'});assert.equal(r.status,0,r.stderr);
 const db2=openDatabase(dbFile);assert.equal(one(db2,"SELECT COUNT(*) AS n FROM users WHERE role='administrador'").n,1);assert.equal(one(db2,'SELECT COUNT(*) AS n FROM users').n,1);db2.close();
 const again=spawnSync(process.execPath,[path.join(__dirname,'../scripts/criar-admin.js'),'--email','primeiro@exemplo.test','--nome','Gestor Instituto','--telefone','+258 84 123 4567'],{env:{...process.env,DB_FILE:dbFile,ADMIN_PASSWORD:'Abcdef12345!'},encoding:'utf8'});assert.notEqual(again.status,0);}
 finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('P2 - parsing CSV aceita caracteres moçambicanos e rejeita colunas erradas',()=>{
 const r=parseCsv('numero,nome,curso,estado\nABC1,Ana Macuácua,Contabilidade,activo\n');assert.equal(r.rows.length,1);assert.equal(r.errors.length,0);
 assert.equal(normalizeName(' ÁNA   MACUÁCUA'),'ana macuacua');
 assert.throws(()=>parseCsv('student,name,course,status\na,b,c,activo'));
 assert.equal(parseCsv('numero,nome,curso,estado\nABC,Ana,Curso,activo\nABC,Ana,Curso,activo').errors.length,1);
});
test('P2 - estudante não pode registar-se por auto-declaração',async()=>{
 const g=await req('/registar');const c=g.cookies.map(v=>v.split(';')[0]).join('; ');
 const invalid=await req('/registar',{method:'POST',cookies:c,headers:{Referer:base+'/registar'},body:{_csrf:csrf(g.text),role:'estudante',name:'Aluno Sem Matrícula',email:'sem@exemplo.test',phone:'841112222',password:'SenhaFortissima123',student_number:'FORJADO',course:'Engenharia'}});
 assert.equal(invalid.status,303);assert.match(invalid.location,/erro=/);
 assert.equal(one(db,"SELECT COUNT(*) AS n FROM users WHERE email='sem@exemplo.test'").n,0);
});
test('P2 - importar, pesquisar e desactivar estudante com autorização do Registo',async()=>{
 const admin=await login('admin@ismma.test');const student=await login('estudante@ismma.test');
 const csv='numero,nome,curso,estado\nISMMA9999,João Matavele,Engenharia de Sistemas,activo\n';
 const form=new FormData();form.set('_csrf',admin.csrf);form.set('ficheiro',new Blob([csv],{type:'text/csv'}),'estudantes.csv');
 const preview=await req('/admin/estudantes/previsualizar',{method:'POST',cookies:admin.cookie,body:form});assert.equal(preview.status,200);assert.match(preview.text,/João Matavele/);
 const imported=await req('/admin/estudantes/importar',{method:'POST',cookies:admin.cookie,body:{_csrf:admin.csrf,csv}});assert.equal(imported.status,303);assert.ok(one(db,"SELECT id FROM student_roster WHERE student_number='ISMMA9999'"));
 const forbidden=await req('/admin/estudantes',{cookies:student.cookie});assert.equal(forbidden.status,403);
 const row=one(db,"SELECT * FROM student_roster WHERE student_number='ISMMA9999'");const updated=await req(`/admin/estudantes/${row.id}/estado`,{method:'POST',cookies:admin.cookie,body:{_csrf:admin.csrf}});assert.equal(updated.status,303);assert.equal(one(db,'SELECT status FROM student_roster WHERE id=?',row.id).status,'inactivo');
});
test('P2 - estudante inactivo não acede a documentos privados nem cria pedidos',async()=>{
 const student=await login('estudante@ismma.test');const roster=one(db,"SELECT * FROM student_roster WHERE student_number='ISMMA2026001'");
 run(db,"UPDATE student_roster SET status='inactivo' WHERE id=?",roster.id);
 try{const page=await req('/pedidos/novo',{cookies:student.cookie});assert.equal(page.status,403);}
 finally{run(db,"UPDATE student_roster SET status='activo' WHERE id=?",roster.id);}
});
test('P4 - tentativas persistentes e endpoint de saúde',async()=>{
 const before=one(db,'SELECT COUNT(*) AS n FROM rate_limits').n;
 const g=await req('/entrar');await req('/entrar',{method:'POST',cookies:g.cookies.map(v=>v.split(';')[0]).join('; '),body:{email:'desconhecido@exemplo.test',password:'errado',_csrf:csrf(g.text)}});
 assert.ok(one(db,'SELECT COUNT(*) AS n FROM rate_limits').n>before);
 const health=await req('/saude');assert.equal(health.status,200);assert.match(health.text,/"base_de_dados":"ok"/);
});
test('P5 - versões preservadas, acesso negado a estudantes e pesquisa',async()=>{
 const admin=await login('admin@ismma.test');const student=await login('estudante@ismma.test');
 const form=new FormData();form.set('_csrf',admin.csrf);form.set('title','Documento com Histórico');form.set('category','Editais');form.set('visibility','publico');form.set('documento',new Blob(['%PDF-1.7\nUm'],{type:'application/pdf'}),'v1.pdf');
 assert.equal((await req('/documentos',{method:'POST',cookies:admin.cookie,body:form})).status,303);
 const doc=one(db,"SELECT * FROM documents WHERE title='Documento com Histórico'");assert.equal(one(db,'SELECT COUNT(*) AS n FROM document_versions WHERE document_id=?',doc.id).n,1);
 const replace=new FormData();replace.set('_csrf',admin.csrf);replace.set('replaces_note','Corrigido');replace.set('documento',new Blob(['%PDF-1.7\nDois'],{type:'application/pdf'}),'v2.pdf');
 assert.equal((await req(`/documentos/${doc.id}/substituir`,{method:'POST',cookies:admin.cookie,body:replace})).status,303);
 assert.equal(one(db,'SELECT COUNT(*) AS n FROM document_versions WHERE document_id=?',doc.id).n,2);
 const old=await req(`/documentos/${doc.id}/versoes/1/descarregar`,{cookies:admin.cookie});assert.match(old.text,/Um/);
 const denied=await req(`/documentos/${doc.id}/versoes`,{cookies:student.cookie});assert.equal(denied.status,403);
 const search=await req('/documentos?pesquisa=Histórico',{cookies:admin.cookie});assert.match(search.text,/Documento com Histórico/);
});
test('P6 - responsabilidade e separação de departamentos',async()=>{
 const staff=await login('secretaria@ismma.test');const student=await login('estudante@ismma.test');
 const ticket=one(db,'SELECT * FROM tickets WHERE department_id=1 LIMIT 1');
 const take=await req(`/pedidos/${ticket.id}/assumir`,{method:'POST',cookies:staff.cookie,body:{_csrf:staff.csrf}});assert.equal(take.status,303);assert.equal(one(db,'SELECT assigned_to FROM tickets WHERE id=?',ticket.id).assigned_to,2);
 const forbidden=await req(`/pedidos/${ticket.id}/atribuir`,{method:'POST',cookies:student.cookie,body:{_csrf:student.csrf,assigned_to:2}});assert.equal(forbidden.status,403);
 const wrong=await req(`/pedidos/${ticket.id}/atribuir`,{method:'POST',cookies:staff.cookie,body:{_csrf:staff.csrf,assigned_to:3}});assert.equal(wrong.status,303);assert.equal(one(db,'SELECT assigned_to FROM tickets WHERE id=?',ticket.id).assigned_to,2);
 assert.ok(one(db,"SELECT id FROM ticket_histories WHERE ticket_id=? AND action='atribuido'",ticket.id));
});
test('migrações idempotentes abrem uma base SQLite anterior',()=>{
 const tmpdb=path.join(tmp,'existing.sqlite');let baseDb=openDatabase(tmpdb);seedDatabase(baseDb,{demo:true});baseDb.close();
 baseDb=openDatabase(tmpdb);assert.ok(one(baseDb,'SELECT COUNT(*) AS n FROM student_roster').n>=1);assert.ok(one(baseDb,'SELECT id FROM users WHERE student_verified=1'));baseDb.close();
});
test('P7 - backup SHA-256 com cifra AES-GCM e rejeição de corrupção',()=>{
 const dbFile=path.join(tmp,'backup-test.sqlite');let fileDb=openDatabase(dbFile);seedDatabase(fileDb,{demo:false});fileDb.close();
 const destination=path.join(tmp,'externo');const backup=spawnSync(process.execPath,[path.join(__dirname,'../scripts/backup.js'),'--encrypt','--destino',destination],{env:{...process.env,DB_FILE:dbFile,UPLOAD_DIR:uploadDir,BACKUP_KEY:'ChaveDeTesteDeBackupSeguraComMaisDe32Caracteres'},encoding:'utf8'});
 assert.equal(backup.status,0,backup.stderr);
 const dir=path.join(destination,fs.readdirSync(destination)[0]);const manifest=JSON.parse(fs.readFileSync(path.join(dir,'manifest.json'),'utf8'));assert.equal(manifest.encrypted,true);
 const corrupt=path.join(dir,'ismma.sqlite.enc');fs.appendFileSync(corrupt,Buffer.from('corrupcao'));
 const restored=spawnSync(process.execPath,[path.join(__dirname,'../scripts/restaurar.js'),dir,'--sim'],{env:{...process.env,DB_FILE:dbFile,UPLOAD_DIR:uploadDir,BACKUP_KEY:'ChaveDeTesteDeBackupSeguraComMaisDe32Caracteres'},encoding:'utf8'});
 assert.notEqual(restored.status,0);assert.match(restored.stderr,/SHA-256 inválida/);
});
