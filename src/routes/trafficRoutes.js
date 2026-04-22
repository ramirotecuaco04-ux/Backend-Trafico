const express = require("express");
const {
  createTraffic,
  getJetsonHeartbeatById,
  getJetsonHeartbeats,
  getTrafficById,
  getTrafficMetrics,
  getTrafficSummary,
  listTraffic,
  registerJetsonHeartbeat
} = require("../controllers/trafficController");
const { requireAuth, requireJetsonKey, requireRole } = require("../middleware/auth");

const router = express.Router();

router.get("/", requireAuth, requireRole("admin"), listTraffic);
router.get("/metrics", requireAuth, requireRole("admin"), getTrafficMetrics);
router.get("/summary", requireAuth, requireRole("admin"), getTrafficSummary);
router.get("/heartbeats", requireAuth, requireRole("admin"), getJetsonHeartbeats);
router.get("/heartbeats/:id", requireAuth, requireRole("admin"), getJetsonHeartbeatById);
router.get("/:id", requireAuth, requireRole("admin"), getTrafficById);
router.post("/", requireAuth, requireRole("admin"), createTraffic);
router.post("/jetson", requireJetsonKey, createTraffic);
router.post("/jetson/heartbeat", requireJetsonKey, registerJetsonHeartbeat);

module.exports = router;
