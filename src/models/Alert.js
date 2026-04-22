const mongoose = require("mongoose");

const alertSchema = new mongoose.Schema({
  tipo: {
    type: String,
    enum: ["ambulancia", "admin", "sistema"],
    default: "sistema"
  },
  mensaje: { type: String, required: true, trim: true },
  prioridad: {
    type: String,
    enum: ["baja", "media", "alta", "critica"],
    default: "media"
  },
  intersection_id: { type: String, trim: true, default: null },
  ubicacion: {
    lat: Number,
    lng: Number
  },
  activa: { type: Boolean, default: true }
}, { timestamps: true });

module.exports = mongoose.model("Alert", alertSchema);
