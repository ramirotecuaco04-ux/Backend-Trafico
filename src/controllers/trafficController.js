const Traffic = require("../models/Traffic");

let io;

function setSocket(socketInstance){
  io = socketInstance;
}

// ESTE ES EL ENDPOINT DE LA JETSON
async function fromJetson(req, res){
  try{
    const data = req.body;

    const saved = await Traffic.create(data);

    //  EMITIR DECISIÓN
    if(io){
      io.emit("traffic-decision", {
        intersection: data.intersection_id,
        decision: data.decision,
        vehicles: data.vehicle_count,
        pedestrians: data.pedestrian_count
      });
    }

    res.json(saved);
  }catch(err){
    res.status(500).json({ error: err.message });
  }
}

async function getTraffic(req,res){
  const data = await Traffic.find().sort({ timestamp: -1 }).limit(50);
  res.json(data);
}

module.exports = { fromJetson, getTraffic, setSocket };
