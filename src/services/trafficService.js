const Traffic = require("../models/trafficModel");

async function saveTraffic(data){
  const traffic = new Traffic(data);
  return await traffic.save();
}

async function getTraffic(){
  return await Traffic.find().sort({ timestamp: -1 }).limit(50);
}

module.exports = { saveTraffic, getTraffic };