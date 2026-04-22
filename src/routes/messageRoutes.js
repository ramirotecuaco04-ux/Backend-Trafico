const express = require("express");
const { createMessage, getMessages, markMessageAsRead } = require("../controllers/messageController");
const { requireRole } = require("../middleware/auth");

const router = express.Router();

router.get("/", requireRole("admin", "vialidad", "patrulla"), getMessages);
router.post("/", requireRole("admin"), createMessage);
router.patch("/:id/read", requireRole("admin", "vialidad", "patrulla"), markMessageAsRead);

module.exports = router;
