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
  ubicacion: {
    lat: { type: Number, default: null },
    lng: { type: Number, default: null }
  },
  reportado_por_nombre: { type: String, trim: true, default: null },
  reportado_por_uid: { type: String, trim: true, default: null },
  reportado_en: { type: Date, default: Date.now },
  creado_por: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    default: null
  },
  fotos: [{
    url: { type: String, trim: true, required: true },
    secure_url: { type: String, trim: true, default: null },
    public_id: { type: String, trim: true, default: null },
    asset_id: { type: String, trim: true, default: null },
    filename: { type: String, trim: true, default: null },
    content_type: { type: String, trim: true, default: null },
    width: { type: Number, default: null },
    height: { type: Number, default: null },
    uploaded_at: { type: Date, default: Date.now }
  }],
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  }
}, { timestamps: true });

module.exports = mongoose.model("Report", reportSchema);
