require("dotenv").config();

/**
 * ==========================================================
 * Environment Variables
 *
 * TODO (배포 시 변경)
 * ----------------------------------------------------------
 * 현재:
 *   Local Ollama 사용
 *
 * 추후:
 *   연구실/운영 서버의 LLM API로 변경
 *
 * 변경 대상
 *   OLLAMA_URL
 *   OLLAMA_MODEL
 * ==========================================================
 */

module.exports = {
    // Server
    PORT: process.env.PORT || 4000,

    // LLM
    OLLAMA_URL: process.env.OLLAMA_URL,
    OLLAMA_MODEL: process.env.OLLAMA_MODEL,

    // Weather API
    KMA_SERVICE_KEY: process.env.KMA_SERVICE_KEY,

    // Air Quality API
    WAQI_TOKEN: process.env.WAQI_TOKEN,

    // Database (추후 결정)
    DB_TYPE: process.env.DB_TYPE,
    DB_HOST: process.env.DB_HOST,
    DB_PORT: process.env.DB_PORT,
    DB_NAME: process.env.DB_NAME,
    DB_USER: process.env.DB_USER,
    DB_PASSWORD: process.env.DB_PASSWORD,
};