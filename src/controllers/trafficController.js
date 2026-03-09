const trafficService = require("../services/trafficService");

let io; // socket.io instance

function setSocket(socketInstance){
  io = socketInstance;
}

async function createTraffic(req,res){
  try{
    const data = req.body;
    const saved = await trafficService.saveTraffic(data);

    if(io){
      io.emit("traffic-update", saved); // envía actualización en tiempo real
    }

    res.json(saved);
  }catch(err){
    res.status(500).json({ error: err.message });
  }
}

async function getTraffic(req,res){
  try{
    const data = await trafficService.getTraffic();
    res.json(data);
  }catch(err){
    res.status(500).json({ error: err.message });
  }
}

module.exports = { createTraffic, getTraffic, setSocket };