const express = require("express");
const {
  createUser,
  deleteUser,
  getUserById,
  getUsers,
  updateUser
} = require("../controllers/userController");
const { requireRole } = require("../middleware/auth");

const router = express.Router();

router.get("/", requireRole("admin"), getUsers);
router.get("/:id", requireRole("admin"), getUserById);
router.post("/", requireRole("admin"), createUser);
router.patch("/:id", requireRole("admin"), updateUser);
router.delete("/:id", requireRole("admin"), deleteUser);

module.exports = router;
