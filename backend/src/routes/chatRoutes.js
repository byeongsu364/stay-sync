const express = require("express");
const { chat, autocompleteAttractions, autocompleteLocations } = require("../controllers/chatController");

const router = express.Router();

router.post("/", chat);
router.get("/attractions/autocomplete", autocompleteAttractions);
router.get("/locations/autocomplete", autocompleteLocations);

module.exports = router;
