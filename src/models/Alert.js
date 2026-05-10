const mongoose = require("mongoose");

const alertSchema = new mongoose.Schema({
  tipo: {
    type: String,
    enum: ["ambulancia", "admin", "sistema", "override"],
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
    default: "media"
  },
  intersection_id: { type: String, trim: true, default: null },
  ubicacion: {
    lat: { type: Number, default: null },
    lng: { type: Number, default: null }
  },
  activa: { type: Boolean, default: true },
  read_by: {
    type: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    default: []
  }
}, { timestamps: true });

module.exports = mongoose.model("Alert", alertSchema);
