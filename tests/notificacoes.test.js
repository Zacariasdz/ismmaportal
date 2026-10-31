'use strict';
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const fs=require('node:fs');
const os=require('node:os');
const {openDatabase,seedDatabase,one,run}=require('../src/db');
const {makeApp}=require('../src/app');
const {issueToken}=require('../src/auth');
const {protect,unprotect,deliverPending}=require('../src/notifier');
const {checkPassword}=require('../src/security');
let db,server,base,tmp;
const oldKey=process.env.MAIL_QUEUE_KEY;
async function req(url,{method='GET',body=null,cookies=''}={}){
 const init={method,redirect:'manual',headers:{}};if(cookies)init.headers.cookie=cookies;
 if(body){init.headers['Content-Type']='application/x-www-form-urlencoded';init.body=new URLSearchParams(body).toString();}
 const r=await fetch(base+url,init);return {status:r.status,text:await r.text(),location:r.headers.get('location'),cookies:r.headers.getSetCookie()};
}
function csrf(html){return html.match(/name="_csrf" value="([a-f0-9]{64})"/)?.[1];}
before(async()=>{process.env.MAIL_QUEUE_KEY='ChaveFicticiaParaTestesQueNuncaVaiParaProducao2026';tmp=fs.mkdtempSync(path.join(os.tmpdir(),'ismma-mail-'));db=openDatabase(':memory:');seedDatabase(db,{demo:true});server=makeApp({db,uploadDir:path.join(tmp,'uploads'),environment:'test'});await new Promise(ok=>server.listen(0,'127.0.0.1',ok));base=`http://127.0.0.1:${server.address().port}`;});
after(async()=>{await new Promise(ok=>server.close(ok));db.close();fs.rmSync(tmp,{recursive:true,force:true});if(oldKey===undefined)delete process.env.MAIL_QUEUE_KEY;else process.env.MAIL_QUEUE_KEY=oldKey;});
test('Fase 2 - texto sensível cifrado, sem token em texto na base de dados',()=>{
 const encrypted=protect('TOKEN_FICTICIO_ABC');assert.match(encrypted,/^enc:v1:/);assert.doesNotMatch(encrypted,/TOKEN_FICTICIO_ABC/);assert.equal(unprotect(encrypted),'TOKEN_FICTICIO_ABC');
 const tampered=encrypted.replace(/^enc:v1:([0-9a-f])/,(_,c)=>'enc:v1:'+(c==='0'?'1':'0'));
 assert.throws(()=>unprotect(tampered));
});
test('Fase 2 - recuperação gera token hashed, uso único e invalida sessões anteriores',async()=>{
 const user=one(db,"SELECT * FROM users WHERE email='estudante@ismma.test'");
 const login=await req('/entrar');const cookies=login.cookies.map(x=>x.split(';')[0]).join('; ');
 const signed=await req('/entrar',{method:'POST',cookies,body:{email:user.email,password:'Demonstracao@2026',_csrf:csrf(login.text)}});
 const session=signed.cookies.find(x=>x.startsWith('ismma_session=')).split(';')[0];
 assert.ok(one(db,'SELECT token_hash FROM sessions WHERE user_id=?',user.id));
 const open=await req('/recuperar');const c=open.cookies.map(x=>x.split(';')[0]).join('; ');
 const submitted=await req('/recuperar',{method:'POST',cookies:c,body:{email:user.email,_csrf:csrf(open.text)}});
 assert.equal(submitted.status,200);assert.match(submitted.text,/Se existir uma conta/);
 const tokenRow=one(db,"SELECT * FROM auth_tokens WHERE user_id=? AND purpose='reset_password'",user.id);
 assert.ok(tokenRow);assert.equal(tokenRow.token_hash.length,64);
 const out=one(db,"SELECT * FROM mail_outbox WHERE recipient=? AND subject LIKE 'Recuperação%' ORDER BY id DESC LIMIT 1",user.email);
 assert.ok(out.body.startsWith('enc:v1:'));const message=unprotect(out.body);
 const token=message.match(/\/recuperar\/([a-f0-9]{64})/)[1];assert.notEqual(token,tokenRow.token_hash);
 const form=await req('/recuperar/'+token);assert.equal(form.status,200);
 const c2=form.cookies.map(x=>x.split(';')[0]).join('; ');
 const updated=await req('/recuperar/'+token,{method:'POST',cookies:c2,body:{password:'NovaSenhaFortissima123',_csrf:csrf(form.text)}});
 assert.equal(updated.status,303);
 assert.equal(one(db,'SELECT COUNT(*) AS n FROM sessions WHERE user_id=?',user.id).n,0);
 assert.equal(checkPassword('NovaSenhaFortissima123',one(db,'SELECT password_hash FROM users WHERE id=?',user.id).password_hash),true);
 assert.equal((await req('/recuperar/'+token)).status,404);
 const old=await req('/painel',{cookies:session});assert.equal(old.status,303);
});
test('Fase 2 - confirmação de email por token e rejeição do uso repetido',async()=>{
 const user=one(db,"SELECT * FROM users WHERE email='candidato@ismma.test'");
 run(db,'UPDATE users SET email_verified=0 WHERE id=?',user.id);
 assert.equal(issueToken(db,user,'verify_email'),true);
 const m=one(db,"SELECT * FROM mail_outbox WHERE subject='Confirmar email - ISMMA' ORDER BY id DESC LIMIT 1");
 const token=unprotect(m.body).match(/\/verificar\/([a-f0-9]{64})/)[1];
 const g=await req('/verificar/'+token);assert.equal(g.status,200);
 const c=g.cookies.map(x=>x.split(';')[0]).join('; ');
 const post=await req('/verificar/'+token,{method:'POST',cookies:c,body:{_csrf:csrf(g.text)}});
 assert.equal(post.status,303);assert.equal(one(db,'SELECT email_verified FROM users WHERE id=?',user.id).email_verified,1);
 assert.equal((await req('/verificar/'+token)).status,404);
});
test('Fase 2 - serviço SMTP simulado envia, falha e respeita backoff',async()=>{
 run(db,"INSERT INTO mail_outbox(recipient,subject,body,channel) VALUES('teste@exemplo.test','Teste','Mensagem','email')");
 const item=one(db,"SELECT * FROM mail_outbox WHERE recipient='teste@exemplo.test'");
 let attempts=0;
 const first=await deliverPending(db,{sendEmail:async()=>{attempts++;throw new Error('SMTP indisponível');},now:Date.now()});
 assert.ok(first.failed>=1);assert.equal(one(db,'SELECT attempts FROM mail_outbox WHERE id=?',item.id).attempts,1);
 const second=await deliverPending(db,{sendEmail:async()=>{attempts++;},now:Date.now()+10*60000});
 assert.ok(second.sent>=1);assert.equal(one(db,'SELECT status FROM mail_outbox WHERE id=?',item.id).status,'enviado');assert.ok(attempts>=2);
});
test('Fase 2 - pedido de recuperação não revela existência de email',async()=>{
 const g=await req('/recuperar');const c=g.cookies.map(x=>x.split(';')[0]).join('; ');
 const submitted=await req('/recuperar',{method:'POST',cookies:c,body:{email:'naoexiste@exemplo.test',_csrf:csrf(g.text)}});
 assert.equal(submitted.status,200);assert.match(submitted.text,/Se existir uma conta/);
});
