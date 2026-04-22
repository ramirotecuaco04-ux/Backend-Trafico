const mongoose = require("mongoose");

const reportSchema = new mongoose.Schema({
  titulo: { type: String, required: true, trim: true },
  descripcion: { type: String, trim: true, default: "" },
  tipo: {
    type: String,
    enum: ["incidente", "mantenimiento", "operacion", "sistema"],
    default: "operacion"
  },
  estado: {
    type: String,
    enum: ["abierto", "en_proceso", "cerrado"],
    default: "abierto"
  },
  prioridad: {
    type: String,
    enum: ["baja", "media", "alta", "critica"],
    default: "media"
  },
  intersection_id: { type: String, trim: true, default: null },
  creado_por: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    default: null
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  }
}, { timestamps: true });

module.exports = mongoose.model("Report", reportSchema);
