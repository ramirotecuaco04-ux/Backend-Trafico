const mongoose = require("mongoose");

const jetsonHeartbeatSchema = new mongoose.Schema({
  device_id: { type: String, required: true, trim: true, unique: true },
  camera_id: { type: String, trim: true, default: null },
  intersection_id: { type: String, trim: true, default: null },
  status: { type: String, trim: true, default: "online" },
  ip_address: { type: String, trim: true, default: null },
  stream_url: { type: String, trim: true, default: null }, // URL dinámica de Ngrok para el streaming
  last_seen_at: { type: Date, default: Date.now },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  }
}, { timestamps: true });

module.exports = mongoose.model("JetsonHeartbeat", jetsonHeartbeatSchema);
