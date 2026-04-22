const express = require("express");
const { getCurrentSession, syncCurrentUser, updatePresence } = require("../controllers/authController");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

router.get("/me", requireAuth, getCurrentSession);
router.post("/sync", requireAuth, syncCurrentUser);
router.patch("/presence", requireAuth, updatePresence);

module.exports = router;
