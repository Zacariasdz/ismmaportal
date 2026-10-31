'use strict';
const net=require('node:net');

function sourceIp(req,env=process.env){
  const peer=req?.socket?.remoteAddress;
  const onVercel=Boolean(env.VERCEL);
  if(onVercel||env.TRUST_PROXY==='true'){
    const headers=req?.headers||{};
    const values=onVercel
      ?[headers['x-vercel-forwarded-for'],headers['x-forwarded-for']]
      :[headers['x-forwarded-for']];
    for(const value of values){
      const first=String(Array.isArray(value)?value[0]:value||'').split(',')[0].trim();
      if(net.isIP(first))return first;
    }
  }
  return net.isIP(peer)?peer:'127.0.0.1';
}
module.exports={sourceIp};
