const express = require("express");
const {
  createAlert,
  getAlertById,
  getAlerts,
  updateAlert
} = require("../controllers/alertController");
const { requireRole } = require("../middleware/auth");

const router = express.Router();

router.get("/", requireRole("admin", "vialidad", "patrulla"), getAlerts);
router.get("/:id", requireRole("admin", "vialidad", "patrulla"), getAlertById);
router.post("/", requireRole("admin", "vialidad", "patrulla"), createAlert);
router.patch("/:id", requireRole("admin"), updateAlert);

module.exports = router;
