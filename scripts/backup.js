'use strict';
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const root=path.resolve(__dirname,'..');
const envFile=path.join(root,'.env');
if(fs.existsSync(envFile))for(const line of fs.readFileSync(envFile,'utf8').split(/\r?\n/)){
  const m=line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if(m&&!Object.hasOwn(process.env,m[1]))process.env[m[1]]=m[2].replace(/^['"]|['"]$/g,'');
}
const args=process.argv.slice(2);
function option(key){const i=args.indexOf(key);return i>=0?args[i+1]:null;}
const encryption=args.includes('--encrypt');
const keyText=process.env.BACKUP_KEY||'';
if(encryption&&keyText.length<32){console.error('BACKUP_KEY deve conter pelo menos 32 caracteres para criar um backup cifrado.');process.exit(1);}
const key=encryption?crypto.scryptSync(keyText,'ismma-backup-v1',32):null;
const original=path.resolve(root,process.env.DB_FILE||'./data/ismma.sqlite');
const uploads=path.resolve(root,process.env.UPLOAD_DIR||'./uploads');
if(!fs.existsSync(original)){console.error('Base de dados não encontrada. Inicie a aplicação primeiro.');process.exit(1);}
const backups=option('--destino')?path.resolve(option('--destino')):path.join(root,'backups');
const stamp=new Date().toISOString().replace(/[:.]/g,'-');
const destination=path.join(backups,stamp);
fs.mkdirSync(destination,{recursive:true,mode:0o700});
const work=fs.mkdtempSync(path.join(require('node:os').tmpdir(),'ismma-bk-'));
function digest(buffer){return crypto.createHash('sha256').update(buffer).digest('hex');}
function walk(dir,rel=''){
  if(!fs.existsSync(dir))return [];
  const found=[];
  for(const ent of fs.readdirSync(dir,{withFileTypes:true})){
    if(ent.isSymbolicLink())throw new Error('Não é permitido guardar ligações simbólicas.');
    const sub=path.posix.join(rel,ent.name),full=path.join(dir,ent.name);
    if(ent.isDirectory())found.push(...walk(full,sub));else if(ent.isFile())found.push({full,relative:path.posix.join('uploads',sub)});
  }
  return found;
}
try{
 const tmpDb=path.join(work,'ismma.sqlite');const db=new DatabaseSync(original);
 try{db.exec(`VACUUM INTO '${tmpDb.replace(/'/g,"''")}'`);}finally{db.close();}
 const manifest={format:'ismma-backup-v1',created_at:new Date().toISOString(),encrypted:encryption,files:[]};
 const inputs=[{full:tmpDb,relative:'ismma.sqlite'},...walk(uploads)];
 for(const entry of inputs){
   const raw=fs.readFileSync(entry.full);let stored=raw,iv=null,tag=null;
   if(encryption){
     const nonce=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',key,nonce);
     stored=Buffer.concat([cipher.update(raw),cipher.final()]);iv=nonce.toString('hex');tag=cipher.getAuthTag().toString('hex');
   }
   const relative=entry.relative+(encryption?'.enc':'');
   const target=path.join(destination,...relative.split('/'));
   fs.mkdirSync(path.dirname(target),{recursive:true,mode:0o700});
   fs.writeFileSync(target,stored,{mode:0o600});
   manifest.files.push({name:entry.relative,stored:relative,sha256:digest(stored),original_sha256:digest(raw),bytes:raw.length,...(encryption?{iv,tag}:{})});
 }
 fs.writeFileSync(path.join(destination,'manifest.json'),JSON.stringify(manifest,null,2)+'\n',{mode:0o600});
 console.log('Backup criado:',destination);
 console.log('Ficheiros verificados por SHA-256:',manifest.files.length);
 if(!encryption)console.warn('Este backup não está cifrado. Proteja o destino de armazenamento.');
 if(!option('--destino')){
  const maxAge=14*86400000;
  for(const item of fs.readdirSync(backups,{withFileTypes:true}))if(item.isDirectory()){
   const dir=path.join(backups,item.name);
   if(Date.now()-fs.statSync(dir).birthtimeMs>maxAge)fs.rmSync(dir,{recursive:true,force:true});
  }
 }
}catch(error){console.error('Falha ao criar backup:',error.message);fs.rmSync(destination,{recursive:true,force:true});process.exitCode=1;}
finally{fs.rmSync(work,{recursive:true,force:true});}
