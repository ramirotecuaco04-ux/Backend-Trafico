const express = require("express");
const {
  getAdminDashboard,
  getAmbulanciaDashboard,
  getVialidadDashboard
} = require("../controllers/dashboardController");
const { requireRole } = require("../middleware/auth");

const router = express.Router();

router.get("/admin", requireRole("admin"), getAdminDashboard);
router.get("/vialidad", requireRole("vialidad", "patrulla"), getVialidadDashboard);
router.get("/ambulancia", requireRole("ambulancia"), getAmbulanciaDashboard);

module.exports = router;
