const Traffic = require("../models/Traffic");

async function saveTraffic(data){
  const traffic = new Traffic(data);
  return await traffic.save();
}

async function getTraffic(){
  return await Traffic.find().sort({ timestamp: -1 }).limit(50);
}

module.exports = { saveTraffic, getTraffic };
