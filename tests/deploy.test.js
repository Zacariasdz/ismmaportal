'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {ROOT,resolveConfig}=require('../src/config');

test('configuração local usa as pastas do projecto e semeia demonstração',()=>{
  const config=resolveConfig({});
  assert.equal(config.onVercel,false);
  assert.equal(config.ephemeralStorage,false);
  assert.equal(config.dbFile,path.join(ROOT,'data','ismma.sqlite'));
  assert.equal(config.uploadDir,path.join(ROOT,'uploads'));
  assert.equal(config.demoSeed,true);
});

test('configuração de produção local não semeia demonstração por omissão',()=>{
  const config=resolveConfig({NODE_ENV:'production'});
  assert.equal(config.demoSeed,false);
  assert.equal(resolveConfig({NODE_ENV:'production',DEMO_SEED:'true'}).demoSeed,true);
});

test('configuração Vercel usa /tmp e ignora caminhos do projecto',()=>{
  const config=resolveConfig({VERCEL:'1',NODE_ENV:'production',DB_FILE:'./data/outra.sqlite',UPLOAD_DIR:'./anexos'});
  const expected=path.join(os.tmpdir(),'ismma');
  assert.equal(config.onVercel,true);
  assert.equal(config.ephemeralStorage,true);
  assert.equal(config.environment,'production');
  assert.ok(config.dbFile.startsWith(expected));
  assert.ok(config.uploadDir.startsWith(expected));
  assert.equal(config.demoSeed,true);
});

test('a entrada serverless exporta o handler da aplicação',()=>{
  const handler=require('../api/index.js');
  assert.equal(typeof handler,'function');
});

test('vercel.json encaminha pedidos, inclui os estáticos e activa TRUST_PROXY',()=>{
  const config=JSON.parse(fs.readFileSync(path.join(ROOT,'vercel.json'),'utf8'));
  const fn=config.functions['api/index.js'];
  assert.equal(fn.runtime,'nodejs24.x');
  assert.equal(fn.includeFiles,'public/**');
  assert.ok(config.rewrites.some(rule=>rule.source==='/(.*)'&&rule.destination==='/api'));
  assert.equal(config.env.TRUST_PROXY,'true');
});

test('o projecto declara Node 24 para a Vercel e para o CI',()=>{
  const pkg=JSON.parse(fs.readFileSync(path.join(ROOT,'package.json'),'utf8'));
  assert.equal(pkg.engines.node,'24.x');
  assert.equal(fs.readFileSync(path.join(ROOT,'.nvmrc'),'utf8').trim(),'24');
  assert.ok(fs.existsSync(path.join(ROOT,'.github','workflows','ci.yml')));
});
