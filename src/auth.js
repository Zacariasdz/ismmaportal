'use strict';
const crypto=require('node:crypto');
const {one,run}=require('./db');
const {hashToken}=require('./security');
async function issueToken(db,user,purpose){
 if(!['verify_email','reset_password','verify_phone'].includes(purpose))throw new Error('Propósito inválido.');
 // Não gerar nem persistir tokens sem possibilidade de os proteger na fila de envio.
 if(String(process.env.MAIL_QUEUE_KEY||'').length<32)return false;
 const token=crypto.randomBytes(32).toString('hex');
 const expires=Date.now()+(purpose==='reset_password'?3600000:86400000);
 const base=(process.env.APP_URL||'http://localhost:3000').replace(/\/$/,'');
 const route=purpose==='reset_password'?'recuperar':'verificar';
 const message=`${purpose==='reset_password'?'Recuperação de palavra-passe':'Confirmação do email'}\n\n${base}/${route}/${token}\n\nEsta ligação expira e só pode ser utilizada uma vez.`;
 // A cifra autenticada impede que o token fique legível na base de dados.
 const {protect}=require('./notifier');const encrypted=protect(message);
 await run(db,'DELETE FROM auth_tokens WHERE user_id=? AND purpose=? AND used_at IS NULL',user.id,purpose);
 await run(db,'INSERT INTO auth_tokens(token_hash,user_id,purpose,expires_at) VALUES(?,?,?,?)',hashToken(token),user.id,purpose,expires);
 await run(db,"INSERT INTO mail_outbox(recipient,subject,body,channel) VALUES(?,?,?,'email')",user.email,purpose==='reset_password'?'Recuperação de acesso - ISMMA':'Confirmar email - ISMMA',encrypted);
 return true;
}
async function peekToken(db,token,purpose){
 if(!/^[a-f0-9]{64}$/.test(token))return null;
 return one(db,'SELECT * FROM auth_tokens WHERE token_hash=? AND purpose=? AND used_at IS NULL AND expires_at>?',hashToken(token),purpose,Date.now());
}
async function consumeToken(db,token,purpose){
 const record=await peekToken(db,token,purpose);if(!record)return null;
 const result=await run(db,'UPDATE auth_tokens SET used_at=? WHERE token_hash=? AND used_at IS NULL',Date.now(),record.token_hash);
 return result.changes===1?record:null;
}
module.exports={issueToken,peekToken,consumeToken};
