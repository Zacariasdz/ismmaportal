'use strict';
const fs=require('node:fs');
const path=require('node:path');
const readline=require('node:readline');
const {openDatabase,one,run,audit}=require('../src/db');
const {hashPassword,passwordValid}=require('../src/security');
const root=path.resolve(__dirname,'..');
const envFile=path.join(root,'.env');
if(fs.existsSync(envFile))for(const line of fs.readFileSync(envFile,'utf8').split(/\r?\n/)){
  const m=line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if(m&&!Object.hasOwn(process.env,m[1]))process.env[m[1]]=m[2].replace(/^['"]|['"]$/g,'');
}
const args=process.argv.slice(2);
function argument(name){const index=args.indexOf('--'+name);const eq=args.find(x=>x.startsWith('--'+name+'='));return eq?eq.slice(name.length+3):index>=0?args[index+1]:'';}
async function ask(question,{secret=false}={}){
  if(secret&&process.stdin.isTTY&&process.stdout.isTTY){
    process.stdout.write(question);
    return new Promise(resolve=>{
      let value='';const stdin=process.stdin;stdin.setRawMode(true);stdin.resume();
      function key(buffer){
        const ch=buffer.toString();
        if(ch==='\r'||ch==='\n'){stdin.setRawMode(false);stdin.pause();stdin.off('data',key);process.stdout.write('\n');resolve(value);}
        else if(ch==='\u0003'){stdin.setRawMode(false);process.exit(130);}
        else if(ch==='\u007f'){value=value.slice(0,-1);}
        else if(ch.charCodeAt(0)>=32)value+=ch;
      }
      stdin.on('data',key);
    });
  }
  if(secret)throw new Error('Para executar sem terminal interactivo, defina ADMIN_PASSWORD no ambiente.');
  const rl=readline.createInterface({input:process.stdin,output:process.stdout});
  return new Promise(resolve=>rl.question(question,answer=>{rl.close();resolve(answer.trim());}));
}
async function main(){
 const name=(argument('nome')||await ask('Nome completo: ')).trim();
 const email=(argument('email')||await ask('Email: ')).trim().toLowerCase();
 const phone=(argument('telefone')||await ask('Telefone: ')).trim();
 const password=process.env.ADMIN_PASSWORD||await ask('Palavra-passe (não aparece no ecrã): ',{secret:true});
 if(name.length<4||name.length>120)throw new Error('Indique um nome completo válido.');
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>180)throw new Error('Email inválido.');
 if(!/^\+?258\s*8[2-7](?:[\s-]?\d){7}$/.test(phone.replace(/\s/g,'')))throw new Error('Telefone moçambicano inválido.');
 if(!passwordValid(password))throw new Error('A palavra-passe requer 10 a 128 caracteres, maiúsculas, minúsculas e números.');
 if(!process.env.DATABASE_URL)throw new Error('Defina DATABASE_URL com a ligação PostgreSQL do Supabase.');
 const db=await openDatabase({connectionString:process.env.DATABASE_URL});
 try{
  if(await one(db,'SELECT id FROM users WHERE email=?',email))throw new Error('Já existe uma conta com este email.');
  const id=Number((await run(db,'INSERT INTO users(name,email,phone,password_hash,role,email_verified) VALUES(?,?,?,?,?,1)',name,email,phone,hashPassword(password),'administrador')).lastInsertRowid);
  await audit(db,{id},'criou_primeiro_admin','user',id);
  console.log('Administrador criado. Pode iniciar sessão com o email indicado.');
 }finally{await db.close();}
}
main().catch(error=>{console.error('Erro:',error.message);process.exitCode=1;});
