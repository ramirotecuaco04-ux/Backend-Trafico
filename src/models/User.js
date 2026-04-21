const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  nombre: String,
  rol: {
    type: String,
    enum: ["admin", "patrulla", "ambulancia"],
    required: true
  },
  estado: { type: String, default: "activo" },
  ubicacion: {
    lat: Number,
    lng: Number
  }
}, { timestamps: true });

module.exports = mongoose.model("User", userSchema);
