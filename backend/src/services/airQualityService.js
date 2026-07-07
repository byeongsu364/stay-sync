const axios = require("axios");
const env = require("../config/env");

/**
 * WAQI 미세먼지 조회 서비스
 */

const REGION_COORDS = {
    고양: { lat: 37.6583, lon: 126.832 },
    파주: { lat: 37.7599, lon: 126.7802 },
    의정부: { lat: 37.7381, lon: 127.0337 },
    양주: { lat: 37.7853, lon: 127.0458 },
    동두천: { lat: 37.9036, lon: 127.0607 },
    포천: { lat: 37.8949, lon: 127.2003 },
    남양주: { lat: 37.636, lon: 127.2165 },
    구리: { lat: 37.5943, lon: 127.1296 },
    가평: { lat: 37.8315, lon: 127.509 },
    연천: { lat: 38.0965, lon: 127.075 },
};

function classifyFineDust(pm25) {
    if (pm25 == null) return "정보없음";
    if (pm25 <= 15) return "좋음";
    if (pm25 <= 35) return "보통";
    if (pm25 <= 75) return "나쁨";
    return "매우나쁨";
}

async function getAirQuality(region) {
    const coord = REGION_COORDS[region];

    if (!coord || !env.airQuality?.token) {
        return {
            fineDust: "정보없음",
            pm25: null,
            detail: null,
        };
    }

    try {
        const url = `https://api.waqi.info/feed/geo:${coord.lat};${coord.lon}/`;

        const response = await axios.get(url, {
            params: {
                token: env.airQuality.token,
            },
        });

        const pm25 = response.data?.data?.iaqi?.pm25?.v ?? null;

        return {
            fineDust: classifyFineDust(pm25),
            pm25,
            detail: response.data?.data ?? null,
        };
    } catch (error) {
        console.error("Air Quality Error:", error.message);

        return {
            fineDust: "정보없음",
            pm25: null,
            detail: null,
        };
    }
}

module.exports = {
    getAirQuality,
    classifyFineDust,
};