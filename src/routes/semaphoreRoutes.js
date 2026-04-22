const express = require("express");
const {
  activateSemaphoreOverride,
  getRealtimeSemaphoreState,
  getSemaphoreOverrides,
  releaseSemaphoreOverride
} = require("../controllers/semaphoreController");
const { requireRole } = require("../middleware/auth");

const router = express.Router();

router.get("/state", requireRole("admin", "ambulancia"), getRealtimeSemaphoreState);
router.get("/overrides", requireRole("admin", "ambulancia"), getSemaphoreOverrides);
router.post("/overrides", requireRole("admin", "ambulancia"), activateSemaphoreOverride);
router.patch("/overrides/:id/release", requireRole("admin", "ambulancia"), releaseSemaphoreOverride);

module.exports = router;
