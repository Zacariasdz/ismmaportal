'use strict';
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');

const ROOT=path.resolve(__dirname,'..');

function loadEnv(file=path.join(ROOT,'.env')){
  if(!fs.existsSync(file))return;
  for(const raw of fs.readFileSync(file,'utf8').split(/\r?\n/)){
    const line=raw.trim();
    if(!line||line.startsWith('#'))continue;
    const match=line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if(match&&!process.env[match[1]])process.env[match[1]]=match[2].replace(/^['"]|['"]$/g,'');
  }
}

function resolveConfig(env=process.env){
  const onVercel=Boolean(env.VERCEL);
  const environment=env.NODE_ENV||(onVercel?'production':'development');
  // Na Vercel apenas /tmp é gravável; a base de dados vive no Supabase.
  const storageRoot=onVercel?path.join(os.tmpdir(),'ismma'):ROOT;
  return {
    root:ROOT,
    onVercel,
    environment,
    ephemeralStorage:onVercel,
    port:Number(env.PORT||3000),
    host:env.HOST||'127.0.0.1',
    databaseUrl:env.DATABASE_URL||'',
    uploadDir:onVercel?path.join(storageRoot,'uploads'):path.resolve(ROOT,env.UPLOAD_DIR||'./uploads'),
    sessionHours:Number(env.SESSION_HOURS||12)
  };
}

module.exports={ROOT,loadEnv,resolveConfig};
