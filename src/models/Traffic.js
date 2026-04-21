const mongoose = require("mongoose");

const trafficSchema = new mongoose.Schema({
  intersection_id: { type: String, required: true },
  vehicle_count: Number,
  pedestrian_count: Number, // 🔥 NUEVO
  density: String,
  decision: String, // 🔥 NUEVO (GREEN_A, PEDESTRIAN, etc)
  camera_id: String,
  timestamp: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Traffic", trafficSchema);
