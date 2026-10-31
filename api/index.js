'use strict';
const {getPortal}=require('../src/bootstrap');

module.exports=function handler(req,res){
  return getPortal().handler(req,res);
};
