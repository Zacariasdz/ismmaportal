'use strict';
const crypto=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');
const net=require('node:net');
function randomToken(){return crypto.randomBytes(32).toString('hex');}
function hashToken(s){return crypto.createHash('sha256').update(s).digest('hex');}
function hashPassword(password){const salt=crypto.randomBytes(16).toString('hex');const output=crypto.scryptSync(password,salt,64).toString('hex');return `scrypt:${salt}:${output}`;}
function checkPassword(input,stored){
  if(typeof stored!=='string'||!stored.startsWith('scrypt:'))return false;
  const [,salt,raw]=stored.split(':');
  const correct=Buffer.from(raw||'','hex');const candidate=crypto.scryptSync(input,salt,64);
  return correct.length===candidate.length && crypto.timingSafeEqual(correct,candidate);
}
function escapeHtml(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function secureName(name){return path.basename(String(name??'ficheiro').replace(/\\/g,'/')).replace(/[\x00-\x1f<>:"|?*]/g,'').slice(0,130)||'ficheiro';}
function sniffMime(file){const b=file.data;
  if(b.length>=5&&b.subarray(0,5).toString()==='%PDF-')return 'application/pdf';
  if(b.length>=8&&b.subarray(0,8).toString('hex')==='89504e470d0a1a0a')return 'image/png';
  if(b.length>=3&&b.subarray(0,3).toString('hex')==='ffd8ff')return 'image/jpeg';
  if(b.length>=8&&b.subarray(0,8).toString('hex')==='d0cf11e0a1b11ae1')return 'application/msword';
  if(b.length>=4&&['504b0304','504b0506'].includes(b.subarray(0,4).toString('hex'))){
    // O DOCX é um ficheiro ZIP: exigir a estrutura de documentos Word, não apenas a extensão.
    if(b.includes(Buffer.from('word/')))return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  }
  return null;
}
const EXTENSIONS={'.pdf':'application/pdf','.doc':'application/msword','.docx':'application/vnd.openxmlformats-officedocument.wordprocessingml.document','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg'};
function validateFile(file,{type='ticket',maxBytes}={}){
  if(!file?.data?.length)throw new Error('Seleccione um ficheiro válido.');
  if(file.data.length>maxBytes)throw new Error('O ficheiro ultrapassa o tamanho permitido.');
  const extension=path.extname(file.filename||'').toLowerCase();
  const actual=sniffMime(file);
  const wanted=EXTENSIONS[extension];
  if(!wanted||wanted!==actual)throw new Error('O tipo ou conteúdo do ficheiro não é permitido.');
  if(type==='document'&&!['.pdf','.doc','.docx'].includes(extension))throw new Error('Os documentos devem estar em formato PDF ou Word.');
  return {mime:actual,name:secureName(file.filename),extension};
}
function storeFile(uploadDir,file,opts){const v=validateFile(file,opts);fs.mkdirSync(uploadDir,{recursive:true});const saved=crypto.randomUUID()+v.extension;fs.writeFileSync(path.join(uploadDir,saved),file.data,{flag:'wx',mode:0o600});return {path:saved,mime:v.mime,original_name:v.name,size:file.data.length};}
function parseCookies(header=''){const cookies={};for(const bit of header.split(';')){let i=bit.indexOf('=');if(i>0)cookies[bit.slice(0,i).trim()]=bit.slice(i+1).trim();}return cookies;}
function normalizeName(name) {
  return String(name||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .toLowerCase().replace(/\s+/g,' ').trim();
}
function parseCsv(text) {
  const rows=[]; let row=[],cell='',quoted=false;
  text=String(text||'').replace(/^\uFEFF/,'');
  for(let i=0;i<text.length;i++){
    const ch=text[i];
    if(ch==='"'){
      if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;
    }else if(ch===','&&!quoted){row.push(cell.trim());cell='';}
    else if((ch==='\n'||ch==='\r')&&!quoted){
      if(ch==='\r'&&text[i+1]==='\n')i++;
      row.push(cell.trim());cell='';if(row.some(Boolean))rows.push(row);row=[];
    }else cell+=ch;
  }
  if(quoted)throw new Error('CSV inválido: aspas por fechar.');
  row.push(cell.trim());if(row.some(Boolean))rows.push(row);
  if(rows.length>2001)throw new Error('O CSV não pode exceder 2000 estudantes por importação.');
  const head=(rows.shift()||[]).map(x=>normalizeName(x));
  if(head.join(',')!=='numero,nome,curso,estado')throw new Error('Use as colunas numero,nome,curso,estado nesta ordem.');
  const seen=new Set(),results=[],errors=[];
  for(let i=0;i<rows.length;i++){
    const [number,name,course,status]=rows[i];
    const line=i+2;
    if(rows[i].length!==4||!number||number.length>40||!name||name.length>120||!course||course.length>120||!['activo','inactivo'].includes(normalizeName(status))||seen.has(number.toLowerCase())){
      errors.push(`Linha ${line}: número, nome, curso ou estado inválido/duplicado.`);
    }else{seen.add(number.toLowerCase());results.push({number,name,course,status:normalizeName(status)});}
  }
  if(!results.length)errors.push('O ficheiro não contém registos válidos.');
  return {rows:results,errors};
}
async function scanFile(data) {
  const host=process.env.CLAMAV_HOST,port=Number(process.env.CLAMAV_PORT||3310);
  if(!host)return true;
  if(!Buffer.isBuffer(data))throw new Error('Ficheiro inválido para análise.');
  return new Promise((resolve,reject)=>{
    const socket=net.createConnection({host,port});let response='',finished=false;
    const finish=(err)=>{if(finished)return;finished=true;socket.destroy();err?reject(err):resolve(true);};
    socket.setTimeout(10000,()=>finish(new Error('Antivírus indisponível. Tente novamente.')));
    socket.once('error',()=>finish(new Error('Não foi possível contactar o antivírus.')));
    socket.once('connect',()=>{
      socket.write(Buffer.from('zINSTREAM\0'));
      for(let i=0;i<data.length;i+=65536){const part=data.subarray(i,i+65536);const len=Buffer.alloc(4);len.writeUInt32BE(part.length);socket.write(len);socket.write(part);}
      socket.write(Buffer.alloc(4));
    });
    socket.on('data',chunk=>{response+=chunk.toString('utf8');if(response.includes('FOUND'))finish(new Error('O anexo foi rejeitado pela verificação de segurança.'));else if(response.includes('OK'))finish();else if(response.includes('ERROR'))finish(new Error('Erro na análise antivírus.'));});
    socket.once('end',()=>{if(!finished)finish(new Error('A análise antivírus não foi concluída.'));});
  });
}
function parseMultipart(buffer,boundary){
  if(!/^[a-zA-Z0-9'()+_,.\/:=?-]{1,100}$/.test(boundary))throw new Error('Formulário inválido.');
  const separator=Buffer.from(`--${boundary}`,'utf8');
  const headEnd=Buffer.from('\r\n\r\n');
  const fields={},files=[];
  let cursor=buffer.indexOf(separator);
  if(cursor!==0)throw new Error('Formulário multipart inválido.');
  while(cursor>=0){
    cursor+=separator.length;
    if(buffer.subarray(cursor,cursor+2).toString()==='--')break;
    if(buffer.subarray(cursor,cursor+2).toString()!=='\r\n')throw new Error('Parte multipart inválida.');
    cursor+=2;
    const split=buffer.indexOf(headEnd,cursor);
    if(split<0||split-cursor>8192)throw new Error('Cabeçalho multipart inválido.');
    const header=buffer.toString('utf8',cursor,split);
    const disp=header.match(/content-disposition:\s*form-data;\s*name="([^"]+)"(?:;\s*filename="([^"]*)")?/i);
    const bodyStart=split+4;
    const next=buffer.indexOf(Buffer.from(`\r\n--${boundary}`),bodyStart);
    if(next<0)throw new Error('Formulário incompleto.');
    const part=buffer.subarray(bodyStart,next);
    if(disp&&/^[\w-]{1,80}$/.test(disp[1])){
      if(disp[2]!==undefined&&disp[2]){
        if(part.length>20*1024*1024)throw Object.assign(new Error('O anexo ultrapassa 20 MB.'),{status:413});
        if(files.length>=5)throw Object.assign(new Error('Máximo de cinco anexos.'),{status:413});
        files.push({field:disp[1],filename:disp[2],data:part});
      }else if(disp[2]===undefined){
        if(part.length>1024*1024)throw Object.assign(new Error('Campo demasiado grande.'),{status:413});
        fields[disp[1]]=part.toString('utf8');
      }
    }
    cursor=next+2;
  }
  return {fields,files};
}
function passwordValid(p){return typeof p==='string'&&p.length>=10&&p.length<=128&&/[A-Z]/.test(p)&&/[a-z]/.test(p)&&/\d/.test(p);}
module.exports={randomToken,hashToken,hashPassword,checkPassword,escapeHtml,secureName,validateFile,storeFile,parseCookies,parseMultipart,passwordValid,parseCsv,normalizeName,scanFile};
