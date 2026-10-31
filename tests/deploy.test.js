'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {ROOT,resolveConfig}=require('../src/config');

test('configuração local usa as pastas do projecto e a ligação PostgreSQL indicada',()=>{
  const config=resolveConfig({DATABASE_URL:'postgresql://utilizador:segredo@base.exemplo:5432/portal'});
  assert.equal(config.onVercel,false);
  assert.equal(config.ephemeralStorage,false);
  assert.equal(config.databaseUrl,'postgresql://utilizador:segredo@base.exemplo:5432/portal');
  assert.equal(config.uploadDir,path.join(ROOT,'uploads'));
});

test('sem DATABASE_URL a configuração não inventa uma base local',()=>{
  assert.equal(resolveConfig({}).databaseUrl,'');
});

test('configuração Vercel usa /tmp e ignora caminhos do projecto',()=>{
  const config=resolveConfig({VERCEL:'1',NODE_ENV:'production',UPLOAD_DIR:'./anexos',DATABASE_URL:'postgresql://base'});
  const expected=path.join(os.tmpdir(),'ismma');
  assert.equal(config.onVercel,true);
  assert.equal(config.ephemeralStorage,true);
  assert.equal(config.environment,'production');
  assert.ok(config.uploadDir.startsWith(expected));
  assert.equal(config.databaseUrl,'postgresql://base');
});

test('a entrada serverless exporta o handler da aplicação',()=>{
  const handler=require('../api/index.js');
  assert.equal(typeof handler,'function');
});

test('vercel.json encaminha pedidos, inclui os estáticos e activa TRUST_PROXY',()=>{
  const config=JSON.parse(fs.readFileSync(path.join(ROOT,'vercel.json'),'utf8'));
  const fn=config.functions['api/index.js'];
  assert.equal(fn.includeFiles,'public/**');
  assert.equal(fn.runtime,undefined);
  assert.ok(config.rewrites.some(rule=>rule.source==='/(.*)'&&rule.destination==='/api'));
  assert.equal(config.env.TRUST_PROXY,'true');
});

test('o projecto declara Node 24 para a Vercel e para o CI',()=>{
  const pkg=JSON.parse(fs.readFileSync(path.join(ROOT,'package.json'),'utf8'));
  assert.equal(pkg.engines.node,'24.x');
  assert.equal(fs.readFileSync(path.join(ROOT,'.nvmrc'),'utf8').trim(),'24');
  assert.ok(fs.existsSync(path.join(ROOT,'.github','workflows','ci.yml')));
});
