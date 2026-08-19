require("dotenv").config();

module.exports = {
    port: process.env.PORT,

    llm: {
        host: process.env.OLLAMA_HOST,
        port: process.env.OLLAMA_PORT,
        model: process.env.OLLAMA_MODEL,
    },

    weather: {
        serviceKey: process.env.KMA_SERVICE_KEY,
    },

    airQuality: {
        token: process.env.WAQI_TOKEN,
    },

    routeServer: {
        url: process.env.ROUTE_SERVER_URL || "http://127.0.0.1:8000",
        autoStart: process.env.ROUTE_SERVER_AUTO_START !== "false",
    },

    kakao: {
        restApiKey: process.env.KAKAO_REST_API_KEY,
    },

    db: {
        type: process.env.DB_TYPE,
        host: process.env.DB_HOST,
        port: process.env.DB_PORT,
        database: process.env.DB_NAME,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        url: process.env.DATABASE_URL,
    },
};
