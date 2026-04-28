const mongoose = require("mongoose");

const trafficLightSchema = new mongoose.Schema({
  // Mapeamos _id a intersection_id si es necesario, o usamos name
  name: { type: String, required: true },
  location: {
    type: { type: String, enum: ["Point"], default: "Point" },
    coordinates: { type: [Number], required: true } // [longitud, latitud]
  },
  status: { type: String, default: "red" },
  is_active: { type: Boolean, default: true }
}, { timestamps: true });

module.exports = mongoose.model("TrafficLight", trafficLightSchema);
