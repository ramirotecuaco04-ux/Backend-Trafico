const mongoose = require("mongoose");

const alertSchema = new mongoose.Schema({
  tipo: {
    type: String,
    enum: ["ambulancia", "admin", "sistema"],
    default: "sistema"
  },
  mensaje: { type: String, required: true, trim: true },
  description: { type: String, trim: true }, // Nuevo campo para compatibilidad con Flutter
  titulo: { type: String, trim: true },      // Título explícito para el feed
  subtitulo: { type: String, trim: true },   // Subtítulo explícito
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
  activa: { type: Boolean, default: true },
  read_by: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }] // Para rastreo de lectura
}, { timestamps: true });

module.exports = mongoose.model("Alert", alertSchema);
