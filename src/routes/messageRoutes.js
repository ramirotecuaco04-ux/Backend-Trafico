const express = require("express");
const {
  createMessage,
  getMessages,
  markMessageAsRead,
  markAllMessagesAsRead
} = require("../controllers/messageController");
const { requireRole } = require("../middleware/auth");

const router = express.Router();

router.get("/", requireRole("admin", "vialidad"), getMessages);
router.post("/", requireRole("admin"), createMessage);
router.patch("/read-all", requireRole("admin", "vialidad"), markAllMessagesAsRead);
router.patch("/:id/read", requireRole("admin", "vialidad"), markMessageAsRead);

module.exports = router;
