const mongoose = require("mongoose");

const semaphoreOverrideSchema = new mongoose.Schema({
  intersection_id: { type: String, required: true, trim: true },
  road_name: { type: String, trim: true, default: null },
  triggered_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  trigger_role: {
    type: String,
    enum: ["admin", "ambulancia"],
    required: true
  },
  siren_enabled: { type: Boolean, required: true },
  detected_by_jetson: { type: Boolean, default: false },
  status: {
    type: String,
    enum: ["active", "released", "expired"],
    default: "active"
  },
  force_green_duration_seconds: { type: Number, default: 15, min: 5, max: 120 },
  activated_at: { type: Date, default: Date.now },
  expires_at: { type: Date, required: true },
  released_at: { type: Date, default: null },
  release_reason: { type: String, trim: true, default: null }
}, { timestamps: true });

module.exports = mongoose.model("SemaphoreOverride", semaphoreOverrideSchema);
