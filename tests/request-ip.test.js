'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {sourceIp}=require('../src/request-ip');

test('Vercel: pedido sem socket utiliza cabeçalho de IP de cliente',()=>{
  const req={socket:null,headers:{'x-vercel-forwarded-for':'196.22.12.41','x-forwarded-for':'196.22.12.41'}};
  assert.equal(sourceIp(req,{VERCEL:'1'}),'196.22.12.41');
});
test('Vercel: socket nulo e cabeçalhos ausentes não produzem excepção',()=>{
  assert.equal(sourceIp({socket:null,headers:{}},{VERCEL:'1'}),'127.0.0.1');
});
test('Vercel: IP inválido não é aceite',()=>{
  assert.equal(sourceIp({socket:null,headers:{'x-vercel-forwarded-for':'not-an-ip'}},{VERCEL:'1'}),'127.0.0.1');
});
test('Ambiente local: ignora X-Forwarded-For não fiável',()=>{
  const req={socket:{remoteAddress:'10.0.0.8'},headers:{'x-forwarded-for':'192.0.2.44'}};
  assert.equal(sourceIp(req,{}),'10.0.0.8');
});
test('Proxy de confiança: aceita apenas endereço IP válido',()=>{
  const req={socket:{remoteAddress:'10.0.0.8'},headers:{'x-forwarded-for':'196.22.12.41, 10.0.0.8'}};
  assert.equal(sourceIp(req,{TRUST_PROXY:'true'}),'196.22.12.41');
});
