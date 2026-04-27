const mongoose = require("mongoose");

const trafficLightSchema = new mongoose.Schema({
  intersection_id: { type: String, required: true, unique: true, trim: true },
  nombre: { type: String, required: true, trim: true },
  ubicacion: {
    lat: { type: Number, required: true },
    lng: { type: Number, required: true }
  },
  estado_actual: {
    type: String,
    enum: ["RED", "GREEN", "YELLOW", "FORCED_GREEN"],
    default: "RED"
  },
  last_sync_at: { type: Date, default: Date.now },
  metadata: {
    direccion: String,
    modelo_controlador: String
  }
}, { timestamps: true });

module.exports = mongoose.model("TrafficLight", trafficLightSchema);
