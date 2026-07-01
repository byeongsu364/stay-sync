const express = require("express");
const cors = require("cors");

const app = express();

/**
 * ===========================================================
 * TODO (배포 시 확인)
 * 운영 서버에서는 허용 Origin만 등록
 * ===========================================================
 */
app.use(cors());

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

module.exports = app;