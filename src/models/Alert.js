const mongoose = require("mongoose");

const alertSchema = new mongoose.Schema({
  tipo: {
    type: String,
    enum: ["ambulancia", "admin", "sistema", "override", "prioridad"],
    required: true,
    default: "sistema"
  },
  mensaje: {
    type: String,
    trim: true,
    required: false
  },
  description: {
    type: String,
    trim: true,
    required: false
  },
  titulo: { type: String, trim: true, required: false },
  subtitulo: { type: String, trim: true, required: false },
  prioridad: {
    type: String,
    enum: ["baja", "media", "alta", "critica"],
    default: "media",
    required: false
  },
  intersection_id: { type: String, trim: true, default: null, required: false },
  ubicacion: {
    lat: { type: Number, default: null, required: false },
    lng: { type: Number, default: null, required: false }
  },
  activa: { type: Boolean, default: true, required: false },
  read_by: {
    type: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    default: [],
    required: false
  }
}, { timestamps: true });

module.exports = mongoose.model("Alert", alertSchema);
