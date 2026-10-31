'use strict';
const {getPortal}=require('../src/bootstrap');

module.exports=async function handler(req,res){
  const portal=await getPortal();
  return portal.handler(req,res);
};
