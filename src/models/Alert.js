const mongoose = require("mongoose");

const alertSchema = new mongoose.Schema({
  tipo: {
    type: String,
    enum: ["ambulancia", "admin"]
  },
  mensaje: String,
  ubicacion: {
    lat: Number,
    lng: Number
  },
  activa: { type: Boolean, default: true }
}, { timestamps: true });

module.exports = mongoose.model("Alert", alertSchema);
