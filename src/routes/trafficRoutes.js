const express = require("express");
const router = express.Router();
const Traffic = require("../models/Traffic");

// GET todos los registros
router.get("/", async (req, res) => {
  try {
    const data = await Traffic.find();
    res.json(data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST nuevo registro
router.post("/", async (req, res) => {
  const { intersection_id, vehicle_count, density } = req.body;
  const traffic = new Traffic({ intersection_id, vehicle_count, density });

  try {
    const saved = await traffic.save();
    // Emitir en tiempo real via Socket.io
    req.io.emit("new_traffic", saved);
    res.status(201).json(saved);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

module.exports = router;