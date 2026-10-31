'use strict';
const {resolveConfig}=require('./config');
const {openDatabase,seedDatabase}=require('./db');
const {makeApp}=require('./app');

let shared=null;

function createPortal(config=resolveConfig()){
  if(config.onVercel&&!process.env.APP_URL&&process.env.VERCEL_URL)process.env.APP_URL=`https://${process.env.VERCEL_URL}`;
  const db=openDatabase(config.dbFile);
  seedDatabase(db,{demo:config.demoSeed,password:config.demoPassword});
  if(!config.demoSeed&&!db.prepare('SELECT id FROM users LIMIT 1').get())console.warn('Nenhum utilizador configurado. Crie o administrador inicial com: npm run criar-admin');
  const server=makeApp({db,uploadDir:config.uploadDir,environment:config.environment,sessionHours:config.sessionHours});
  return {config,db,server,handler:server.handler};
}

// Reutiliza a mesma instância durante os arranques a quente da função serverless.
function getPortal(){
  if(!shared)shared=createPortal();
  return shared;
}

module.exports={createPortal,getPortal};
