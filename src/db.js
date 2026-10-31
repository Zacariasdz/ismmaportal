'use strict';
const {AsyncLocalStorage}=require('node:async_hooks');
const {Pool,types}=require('pg');
const {installDatabase}=require('./schema');

// COUNT/SUM chegam como bigint e valores decimais como numeric; a aplicação usa números.
types.setTypeParser(20,value=>value===null?null:Number(value));
types.setTypeParser(1700,value=>value===null?null:Number(value));
// Timestamps são devolvidos como texto no formato usado pelos templates e comparações.
types.setTypeParser(1114,value=>value);
types.setTypeParser(1184,value=>value);
types.setTypeParser(1082,value=>value);

const storage=new AsyncLocalStorage();

function sslFor(connectionString){
  try{
    const url=new URL(connectionString);
    if(url.searchParams.get('sslmode')==='disable')return false;
    if(['localhost','127.0.0.1','::1'].includes(url.hostname))return false;
    return {rejectUnauthorized:false};
  }catch{return {rejectUnauthorized:false};}
}

// Converte os marcadores posicionais usados na aplicação (?) em parâmetros PostgreSQL ($n).
function convert(sql){
  let out='',index=0,quote=null;
  for(let i=0;i<sql.length;i++){
    const ch=sql[i];
    if(quote){
      out+=ch;
      if(ch===quote){
        if(sql[i+1]===quote){out+=sql[++i];}
        else quote=null;
      }
      continue;
    }
    if(ch==="'"||ch==='"'){quote=ch;out+=ch;continue;}
    if(ch==='?'){out+='$'+(++index);continue;}
    out+=ch;
  }
  return out;
}

function activeClient(db){
  const store=storage.getStore();
  return store&&store.db===db?store.client:null;
}

async function query(db,sql,args){
  const target=activeClient(db)||db.pool;
  return target.query(convert(sql),args);
}

async function one(db,sql,...args){
  const result=await query(db,sql,args);
  return result.rows[0];
}

async function all(db,sql,...args){
  const result=await query(db,sql,args);
  return result.rows;
}

// Tabelas cujo identificador é gerado pelo PostgreSQL; permite devolver o id após um INSERT.
const ID_TABLES=new Set([
  'users','departments','categories','tickets','messages','attachments','ticket_histories',
  'documents','document_versions','reply_templates','notifications','activity_log','mail_outbox',
  'student_roster','academic_programs','academic_subjects','academic_enrollments','academic_assignments',
  'academic_submissions','academic_grades','academic_announcements','admission_applications','admission_files'
]);

async function run(db,sql,...args){
  const insert=/^\s*INSERT\s+INTO\s+([a-z_]+)/i.exec(sql);
  const text=insert&&ID_TABLES.has(insert[1].toLowerCase())&&!/\bRETURNING\b/i.test(sql)?sql+' RETURNING id':sql;
  const result=await query(db,text,args);
  return {changes:result.rowCount??0,rows:result.rows||[],lastInsertRowid:result.rows?.[0]?.id};
}

async function transaction(db,callback){
  const store=storage.getStore();
  if(store&&store.db===db)return callback(store.client);
  const client=await db.pool.connect();
  try{
    await client.query('BEGIN');
    const result=await storage.run({db,client},()=>callback(client));
    await client.query('COMMIT');
    return result;
  }catch(error){
    await client.query('ROLLBACK').catch(()=>{});
    throw error;
  }finally{
    client.release();
  }
}

async function getSetting(db,key,fallback=''){
  const row=await one(db,'SELECT value FROM settings WHERE key=?',key);
  return row?.value??fallback;
}

async function audit(db,user,action,type,id,details=''){
  await run(db,'INSERT INTO activity_log(actor_id,action,subject_type,subject_id,details) VALUES(?,?,?,?,?)',user?.id??null,action,type,id,details);
}

async function notify(db,userId,title,body,url,email=true){
  if(!userId)return;
  await run(db,'INSERT INTO notifications(user_id,title,body,url) VALUES(?,?,?,?)',userId,title,body,url);
  if(!email)return;
  const user=await one(db,'SELECT email,phone,notify_email,notify_sms FROM users WHERE id=?',userId);
  if(!user)return;
  const link=(process.env.APP_URL||'http://localhost:3000').replace(/\/$/,'')+url;
  const message=`Há uma actualização no portal de atendimento do ISMMA. Consulte: ${link}`;
  if(user.notify_email)await run(db,"INSERT INTO mail_outbox(recipient,subject,body,channel) VALUES(?,?,?,'email')",user.email,'Actualização de atendimento ISMMA',message);
  if(user.notify_sms&&user.phone)await run(db,"INSERT INTO mail_outbox(recipient,subject,body,channel) VALUES(?,?,?,'sms')",user.phone,'ISMMA',message);
}

async function openDatabase({connectionString=process.env.DATABASE_URL,max=5,install=true}={}){
  if(!connectionString)throw new Error('DATABASE_URL não está configurada. Defina a ligação PostgreSQL do Supabase.');
  const pool=new Pool({connectionString,ssl:sslFor(connectionString),max,idleTimeoutMillis:30000,connectionTimeoutMillis:15000});
  pool.on('error',error=>console.error('[ISMMA] Erro no pool PostgreSQL:',error.message));
  const db={
    pool,
    connect:()=>pool.connect(),
    query:(sql,args)=>query(db,sql,args),
    close:async()=>{await pool.end();}
  };
  if(install)await installDatabase(db);
  return db;
}

module.exports={openDatabase,one,all,run,transaction,getSetting,audit,notify,convert};
