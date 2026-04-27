const mongoose = require("mongoose");

const trafficSchema = new mongoose.Schema({
  intersection_id: { type: String, required: true, trim: true },
  // Coordenadas para que Flutter pueda ubicar el semáforo en el mapa
  ubicacion: {
    lat: { type: Number, default: null },
    lng: { type: Number, default: null }
  },
  vehicle_count: { type: Number, default: 0, min: 0 },
  pedestrian_count: { type: Number, default: 0, min: 0 },
  density: { type: String, trim: true, default: "medium" },
  decision: { type: String, trim: true, default: null },
  camera_id: { type: String, trim: true, default: null },
  timestamp: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Traffic", trafficSchema);
