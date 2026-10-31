'use strict';
const net=require('node:net');
const tls=require('node:tls');
const crypto=require('node:crypto');
const {all,run}=require('./db');
function queueKey(){
 const raw=process.env.MAIL_QUEUE_KEY||'';
 if(raw.length<32)throw new Error('É necessária MAIL_QUEUE_KEY com 32 caracteres ou mais.');
 return crypto.scryptSync(raw,'ismma-mail-queue-v1',32);
}
function protect(body){
 const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',queueKey(),iv);
 const encrypted=Buffer.concat([cipher.update(body,'utf8'),cipher.final()]);
 return `enc:v1:${iv.toString('hex')}:${cipher.getAuthTag().toString('hex')}:${encrypted.toString('base64')}`;
}
function unprotect(value){
 if(!value.startsWith('enc:v1:'))return value;
 const [,version,iv,tag,encrypted]=value.split(':');
 if(version!=='v1')throw new Error('Versão de cifra desconhecida.');
 const decipher=crypto.createDecipheriv('aes-256-gcm',queueKey(),Buffer.from(iv,'hex'));
 decipher.setAuthTag(Buffer.from(tag,'hex'));
 return Buffer.concat([decipher.update(Buffer.from(encrypted,'base64')),decipher.final()]).toString('utf8');
}
function queueSensitiveEmail(db,recipient,subject,body){
 const payload=protect(body);
 run(db,"INSERT INTO mail_outbox(recipient,subject,body,channel) VALUES(?,?,?,'email')",recipient,subject,payload);
}
function validAddress(s){return typeof s==='string'&&/^[^\r\n@<> ]+@[^\r\n@<> ]+\.[^\r\n@<> ]+$/.test(s);}
function encodeHeader(s){return `=?UTF-8?B?${Buffer.from(s,'utf8').toString('base64')}?=`;}
function waitReplies(socket){
 let buffer='',queue=[],waiting=[],error=null;
 socket.on('data',chunk=>{
   buffer+=chunk.toString('utf8');let idx;
   while((idx=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,idx).replace(/\r$/,'');buffer=buffer.slice(idx+1);
     if(!/^\d{3}[ -]/.test(line))continue;
     if(line[3]===' ')queue.push({code:Number(line.slice(0,3)),line});
   }
   while(queue.length&&waiting.length)waiting.shift().resolve(queue.shift());
 });
 const fail=err=>{error=err;while(waiting.length)waiting.shift().reject(err);};
 socket.on('error',fail);socket.on('close',()=>fail(error||new Error('Ligação SMTP terminada.')));
 return function next(){if(error)return Promise.reject(error);if(queue.length)return Promise.resolve(queue.shift());return new Promise((resolve,reject)=>waiting.push({resolve,reject}));};
}
async function sendSmtp({to,subject,body}){
 const host=process.env.SMTP_HOST,port=Number(process.env.SMTP_PORT||587);
 const from=process.env.SMTP_FROM;
 if(!host||!validAddress(from)||!validAddress(to))throw new Error('Configuração SMTP incompleta.');
 const timeout=10000;
 let socket=port===465?tls.connect({host,port,servername:host,rejectUnauthorized:true}):net.connect({host,port});
 socket.setTimeout(timeout,()=>socket.destroy(new Error('Tempo de ligação SMTP excedido.')));
 let reply=waitReplies(socket);
 async function expect(codes){const r=await reply();if(!codes.includes(r.code))throw new Error(`Resposta SMTP inesperada: ${r.code}`);return r;}
 function send(command){socket.write(command+'\r\n');}
 try{
  await expect([220]);send('EHLO ismma.local');await expect([250]);
  if(port!==465){
    send('STARTTLS');await expect([220]);
    socket=tls.connect({socket,servername:host,rejectUnauthorized:true});
    await new Promise((res,rej)=>{socket.once('secureConnect',res);socket.once('error',rej);});
    reply=waitReplies(socket);send('EHLO ismma.local');await expect([250]);
  }
  if(process.env.SMTP_USER){
    const auth=Buffer.from(`\0${process.env.SMTP_USER}\0${process.env.SMTP_PASS||''}`).toString('base64');
    send('AUTH PLAIN '+auth);await expect([235]);
  }
  send(`MAIL FROM:<${from}>`);await expect([250]);
  send(`RCPT TO:<${to}>`);await expect([250,251]);
  send('DATA');await expect([354]);
  const encoded=Buffer.from(body,'utf8').toString('base64').match(/.{1,76}/g)?.join('\r\n')||'';
  send(`From: <${from}>\r\nTo: <${to}>\r\nSubject: ${encodeHeader(subject)}\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${encoded}\r\n.`);
  await expect([250]);send('QUIT');
 }finally{socket.destroy();}
}
async function sendWebhook({to,body}){
 const url=process.env.SMS_WEBHOOK_URL;
 if(!url||!url.startsWith('https://'))throw new Error('Webhook HTTPS não configurado.');
 const res=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json',...(process.env.SMS_API_KEY?{'Authorization':`Bearer ${process.env.SMS_API_KEY}`}:{})},body:JSON.stringify({to,text:body}),signal:AbortSignal.timeout(10000)});
 if(!res.ok)throw new Error(`Webhook respondeu HTTP ${res.status}.`);
}
async function deliverPending(db,{sendEmail=sendSmtp,sendSms=sendWebhook,now=Date.now()}={}){
 const items=all(db,"SELECT * FROM mail_outbox WHERE status IN ('pendente','erro') AND next_try_at<=? AND attempts<5 ORDER BY id LIMIT 20",now);
 let sent=0,failed=0;
 for(const item of items){
   if(item.channel==='email'&&!process.env.SMTP_HOST&&sendEmail===sendSmtp)continue;
   if(item.channel==='sms'&&!process.env.SMS_WEBHOOK_URL&&sendSms===sendWebhook)continue;
   try{
     const body=unprotect(item.body);
     if(item.channel==='sms')await sendSms({to:item.recipient,body});
     else await sendEmail({to:item.recipient,subject:item.subject,body});
     run(db,"UPDATE mail_outbox SET status='enviado',attempts=attempts+1,last_error=NULL WHERE id=?",item.id);
     sent++;
   }catch(error){
     const attempts=item.attempts+1;
     run(db,"UPDATE mail_outbox SET status=?,attempts=?,last_error=?,next_try_at=? WHERE id=?",attempts>=5?'falhou':'erro',attempts,String(error.message).slice(0,250),now+Math.min(24*3600000,Math.pow(2,attempts)*60000),item.id);
     failed++;
   }
 }
 return {sent,failed};
}
module.exports={queueSensitiveEmail,deliverPending,sendSmtp,sendWebhook,protect,unprotect};
