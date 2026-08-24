const express = require("express");
const { chat, greeting, autocompleteAttractions, autocompleteLocations } = require("../controllers/chatController");

const router = express.Router();

router.post("/", chat);
router.get("/greeting", greeting);
router.get("/attractions/autocomplete", autocompleteAttractions);
router.get("/locations/autocomplete", autocompleteLocations);

module.exports = router;
