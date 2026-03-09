const mongoose = require("mongoose");

const trafficSchema = new mongoose.Schema({
  intersection_id: { type: String, required: true },
  vehicle_count: { type: Number, required: true },
  density: { type: String, required: true },
  camera_id: { type: String },
  extra_metrics: { type: Object }, // Ej: avg_speed, heavy_vehicles
  timestamp: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Traffic", trafficSchema);