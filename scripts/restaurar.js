'use strict';
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const crypto=require('node:crypto');
const readline=require('node:readline');
const root=path.resolve(__dirname,'..');
const envFile=path.join(root,'.env');
if(fs.existsSync(envFile))for(const line of fs.readFileSync(envFile,'utf8').split(/\r?\n/)){
 const m=line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
 if(m&&!Object.hasOwn(process.env,m[1]))process.env[m[1]]=m[2].replace(/^['"]|['"]$/g,'');
}
const args=process.argv.slice(2);
const source=args[0]?path.resolve(args[0]):null;
const yes=args.includes('--sim');
const dbFile=path.resolve(root,process.env.DB_FILE||'./data/ismma.sqlite');
const uploads=path.resolve(root,process.env.UPLOAD_DIR||'./uploads');
const sha=buf=>crypto.createHash('sha256').update(buf).digest('hex');
async function main(){
 if(!source||!fs.existsSync(path.join(source,'manifest.json')))throw new Error('Indique a pasta do backup com manifest.json.');
 const manifest=JSON.parse(fs.readFileSync(path.join(source,'manifest.json'),'utf8'));
 if(manifest.format!=='ismma-backup-v1'||!Array.isArray(manifest.files))throw new Error('Formato de backup desconhecido.');
 if(manifest.encrypted&&String(process.env.BACKUP_KEY||'').length<32)throw new Error('BACKUP_KEY em falta ou demasiado curta.');
 const key=manifest.encrypted?crypto.scryptSync(process.env.BACKUP_KEY,'ismma-backup-v1',32):null;
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'ismma-restore-'));
 try{
  const paths=new Set();
  for(const file of manifest.files){
    if(typeof file.name!=='string'||!/^ismma\.sqlite$|^uploads\/[a-zA-Z0-9._/-]+$/.test(file.name)||file.name.split('/').includes('..')||paths.has(file.name))throw new Error('Caminho de backup inválido.');
    paths.add(file.name);
    if(file.stored!==file.name+(manifest.encrypted?'.enc':''))throw new Error('Manifesto inconsistente.');
    const savedPath=path.resolve(source,...file.stored.split('/'));
    if(!savedPath.startsWith(source+path.sep))throw new Error('Caminho fora do backup.');
    const saved=fs.readFileSync(savedPath);
    if(sha(saved)!==file.sha256)throw new Error(`Soma SHA-256 inválida: ${file.name}`);
    let raw=saved;
    if(manifest.encrypted){
      const decipher=crypto.createDecipheriv('aes-256-gcm',key,Buffer.from(file.iv,'hex'));
      decipher.setAuthTag(Buffer.from(file.tag,'hex'));
      raw=Buffer.concat([decipher.update(saved),decipher.final()]);
    }
    if(sha(raw)!==file.original_sha256||raw.length!==file.bytes)throw new Error('Integridade de ficheiros comprometida.');
    const dst=path.join(temp,...file.name.split('/'));fs.mkdirSync(path.dirname(dst),{recursive:true});fs.writeFileSync(dst,raw);
  }
  if(!paths.has('ismma.sqlite'))throw new Error('Base de dados ausente.');
  console.log('Verificação de integridade concluída:',paths.size,'ficheiros.');
  if(!yes){
   if(!process.stdin.isTTY)throw new Error('É necessária confirmação interactiva. Use --sim apenas em testes controlados.');
   const answer=await new Promise(resolve=>{const rl=readline.createInterface({input:process.stdin,output:process.stdout});rl.question('A aplicação deve estar parada. Substituir os dados actuais? Escreva SIM: ',a=>{rl.close();resolve(a);});});
   if(answer!=='SIM'){console.log('Restauro cancelado.');return;}
  }
  // Salvaguarda dos dados anteriores antes de substituir.
  const previous=path.join(root,'backups','antes-restauro-'+new Date().toISOString().replace(/[:.]/g,'-'));
  fs.mkdirSync(previous,{recursive:true});
  if(fs.existsSync(dbFile))fs.copyFileSync(dbFile,path.join(previous,'ismma.sqlite'));
  if(fs.existsSync(uploads))fs.cpSync(uploads,path.join(previous,'uploads'),{recursive:true});
  fs.mkdirSync(path.dirname(dbFile),{recursive:true});
  fs.copyFileSync(path.join(temp,'ismma.sqlite'),dbFile);
  if(fs.existsSync(uploads))fs.rmSync(uploads,{recursive:true,force:true});
  fs.mkdirSync(uploads,{recursive:true});
  if(fs.existsSync(path.join(temp,'uploads')))fs.cpSync(path.join(temp,'uploads'),uploads,{recursive:true});
  console.log('Restauro concluído. Reabra a aplicação. Salvaguarda anterior em:',previous);
 }finally{fs.rmSync(temp,{recursive:true,force:true});}
}
main().catch(error=>{console.error('Não foi possível restaurar:',error.message);process.exitCode=1;});
