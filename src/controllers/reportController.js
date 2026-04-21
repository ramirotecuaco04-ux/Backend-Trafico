const Report = require("../models/Report");

async function createReport(req, res){
  try{
    const report = await Report.create(req.body);
    res.json(report);
  }catch(err){
    res.status(500).json({ error: err.message });
  }
}

async function getReports(req,res){
  const data = await Report.find().populate("creado_por");
  res.json(data);
}

module.exports = { createReport, getReports };
