'use strict';
const {getPortal}=require('../src/bootstrap');

module.exports=async function handler(req,res){
  let portal;
  try{
    portal=await getPortal();
  }catch(error){
    // Sem um detalhe no log, a Vercel mostra apenas FUNCTION_INVOCATION_FAILED.
    console.error('[ISMMA] Falha ao iniciar o portal:',error.message);
    if(!res.headersSent){
      res.statusCode=503;
      res.setHeader('Content-Type','text/plain; charset=utf-8');
      res.setHeader('Retry-After','30');
      res.setHeader('Cache-Control','no-store');
      res.end('Portal temporariamente indisponível. Tente novamente dentro de instantes.');
    }
    return;
  }
  return portal.handler(req,res);
};
