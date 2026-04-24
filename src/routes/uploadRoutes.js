const express = require("express");
const { createCloudinaryReportSignature } = require("../controllers/uploadController");
const { requireRole } = require("../middleware/auth");

const router = express.Router();

router.post("/cloudinary/report-signature", requireRole("admin", "vialidad", "patrulla"), createCloudinaryReportSignature);

module.exports = router;
