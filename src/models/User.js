const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  nombre: { type: String, required: true, trim: true },
  email: { type: String, trim: true, lowercase: true, default: null },
  firebase_uid: { type: String, trim: true, unique: true, sparse: true, default: null },
  rol: {
    type: String,
    enum: ["admin", "vialidad", "ambulancia"],
    required: true
  },
  estado: { type: String, default: "activo" },
  last_login_at: { type: Date, default: null },
  last_seen_at: { type: Date, default: null },
  siren_enabled: { type: Boolean, default: false },
  assigned_intersections: [{ type: String, trim: true }],
  ubicacion: {
    lat: Number,
    lng: Number
  }
}, { timestamps: true });

module.exports = mongoose.model("User", userSchema);
