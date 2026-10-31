'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {INSTITUTION:I}=require('../src/institution');
const {one,run}=require('../src/db');
const {installDatabase}=require('../src/schema');
const {institutionPage}=require('../src/views');
const {startPortal}=require('./helpers/portal');

test('fontes oficiais: nome, localização, contactos e licenciaturas aparecem na página sem scripts externos',()=>{
 const html=institutionPage();
 for(const value of [I.name,I.motto,I.email,I.phone,'Licenciatura em Direito','Gestão de Empresas'])assert.ok(html.includes(value),value);
 assert.match(html,/Protótipo|demonstrativo/i);
 assert.match(html,/https:\/\/ismma\.ac\.mz\/site\/licenciaturas\//);
 assert.doesNotMatch(html,/<script|<iframe|src="https?:/i);
});
test('seed cria contacto oficial e cursos comprovados sem transformar dados fictícios em oficiais',async()=>{
 const portal=await startPortal();
 try{
  const db=portal.db;
  assert.equal((await one(db,"SELECT value FROM settings WHERE key='contact_email'")).value,I.email);
  assert.equal((await one(db,"SELECT value FROM settings WHERE key='contact_phone'")).value,I.phone);
  assert.equal((await one(db,"SELECT course FROM users WHERE role='estudante'")).course,'Licenciatura em Gestão de Empresas');
  assert.match((await one(db,"SELECT email FROM users WHERE role='administrador'")).email,/\.test$/);
 }finally{await portal.close();}
});
test('configurações personalizadas não são alteradas por migração idempotente',async()=>{
 const portal=await startPortal({seed:false});
 try{
  const db=portal.db;
  await run(db,"INSERT INTO settings(key,value) VALUES('contact_email','contacto@instituicao.test') ON CONFLICT(key) DO UPDATE SET value=excluded.value");
  await installDatabase(db);
  assert.equal((await one(db,"SELECT value FROM settings WHERE key='contact_email'")).value,'contacto@instituicao.test');
 }finally{await portal.close();}
});
test('informação institucional acessível sem sessão, sem divulgar dados privados',async()=>{
 const portal=await startPortal({seed:false});
 try{
  const res=await fetch(portal.base+'/instituicao');const body=await res.text();
  assert.equal(res.status,200);assert.match(body,/geral@ismma\.ac\.mz/);assert.match(body,/Av\. Vladimir Lenine/);assert.match(body,/não substitui os canais oficiais/);
 }finally{await portal.close();}
});
