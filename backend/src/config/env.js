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

    tourApi: {
        serviceKey:
            process.env.TOUR_API_SERVICE_KEY
            || process.env.KMA_SERVICE_KEY,

        // 영문 서비스(EngService2)는 data.go.kr에서 따로 활용신청해야 열린다.
        // 보통 같은 인증키가 그대로 쓰이므로 별도 키가 없으면 한국어 키를 쓴다.
        englishServiceKey:
            process.env.TOUR_API_ENG_SERVICE_KEY
            || process.env.TOUR_API_SERVICE_KEY
            || process.env.KMA_SERVICE_KEY,
    },

    airQuality: {
        serviceKey: process.env.AIRKOREA_SERVICE_KEY,
    },

    routeServer: {
        url: process.env.ROUTE_SERVER_URL || "http://127.0.0.1:8001",
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
