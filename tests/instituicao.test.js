'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {INSTITUTION:I}=require('../src/institution');
const {openDatabase,seedDatabase,one,run}=require('../src/db');
const {makeApp}=require('../src/app');
const {institutionPage}=require('../src/views');
const fs=require('node:fs');const path=require('node:path');const os=require('node:os');
test('fontes oficiais: nome, localização, contactos e licenciaturas aparecem na página sem scripts externos',()=>{
 const html=institutionPage();
 for(const value of [I.name,I.motto,I.email,I.phone,'Licenciatura em Direito','Gestão de Empresas'])assert.ok(html.includes(value),value);
 assert.match(html,/Protótipo|demonstrativo/i);
 assert.match(html,/https:\/\/ismma\.ac\.mz\/site\/licenciaturas\//);
 assert.doesNotMatch(html,/<script|<iframe|src="https?:/i);
});
test('seed cria contacto oficial e cursos comprovados sem transformar dados fictícios em oficiais',()=>{
 const db=openDatabase(':memory:');seedDatabase(db,{demo:true});
 assert.equal(one(db,"SELECT value FROM settings WHERE key='contact_email'").value,I.email);
 assert.equal(one(db,"SELECT value FROM settings WHERE key='contact_phone'").value,I.phone);
 assert.equal(one(db,"SELECT course FROM users WHERE role='estudante'").course,'Licenciatura em Gestão de Empresas');
 assert.match(one(db,"SELECT email FROM users WHERE role='administrador'").email,/\.test$/);
 db.close();
});
test('configurações personalizadas não são alteradas por migração idempotente',()=>{
 const db=openDatabase(':memory:');run(db,"INSERT INTO settings(key,value) VALUES('contact_email','contacto@instituicao.test')");
 assert.equal(one(db,"SELECT value FROM settings WHERE key='contact_email'").value,'contacto@instituicao.test');
 db.close();
});
test('informação institucional acessível sem sessão, sem divulgar dados privados',async()=>{
 const db=openDatabase(':memory:');seedDatabase(db,{demo:false});
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ismma-inst-'));
 const server=makeApp({db,uploadDir:path.join(dir,'uploads'),environment:'test'});
 try{await new Promise(ok=>server.listen(0,'127.0.0.1',ok));const address=`http://127.0.0.1:${server.address().port}`;
  const res=await fetch(address+'/instituicao');const body=await res.text();
  assert.equal(res.status,200);assert.match(body,/geral@ismma\.ac\.mz/);assert.match(body,/Av\. Vladimir Lenine/);assert.match(body,/não substitui os canais oficiais/);
 }finally{await new Promise(ok=>server.close(ok));db.close();fs.rmSync(dir,{recursive:true,force:true});}
});
