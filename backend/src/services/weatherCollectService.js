const axios = require("axios");
const env = require("../config/env");
const { saveForecast } = require("../repositories/weatherForecastRepository");

/**
 * ==========================================================
 * Weather Collect Service
 * ==========================================================
 *
 * 역할
 * - 기상청 단기예보 1~3일 수집
 * - 기상청 중기예보 4~10일 수집
 * - weatherForecast 테이블에 저장
 * ==========================================================
 */

const MID_REGION_MAP = {
    고양: "11B20302",
    파주: "11B20305",
    의정부: "11B20301",
    양주: "11B20304",
    동두천: "11B20401",
    포천: "11B20403",
    남양주: "11B20502",
    구리: "11B20501",
    가평: "11B20404",
    연천: "11B20402",
};

const SHORT_GRID_MAP = {
    고양: { nx: 57, ny: 128 },
    파주: { nx: 56, ny: 131 },
    의정부: { nx: 61, ny: 130 },
    양주: { nx: 61, ny: 131 },
    동두천: { nx: 61, ny: 134 },
    포천: { nx: 64, ny: 134 },
    남양주: { nx: 64, ny: 128 },
    구리: { nx: 62, ny: 127 },
    가평: { nx: 69, ny: 133 },
    연천: { nx: 61, ny: 138 },
};

function formatDate(date) {
    return date.toISOString().slice(0, 10);
}

function getShortBaseTime() {
    const now = new Date();
    const hh = now.getHours();

    const times = [23, 20, 17, 14, 11, 8, 5, 2];

    let baseHour = 23;

    for (const t of times) {
        if (hh >= t) {
            baseHour = t;
            break;
        }
    }

    if (hh < 2) {
        now.setDate(now.getDate() - 1);
    }

    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");

    return {
        base_date: `${yyyy}${mm}${dd}`,
        base_time: `${String(baseHour).padStart(2, "0")}00`,
    };
}

function getMidTmFc() {
    const now = new Date();

    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");

    const time = now.getHours() >= 18 ? "1800" : "0600";

    return `${yyyy}${mm}${dd}${time}`;
}

async function collectShortForecast() {
    const { base_date, base_time } = getShortBaseTime();

    for (const [region, grid] of Object.entries(SHORT_GRID_MAP)) {
        const response = await axios.get(
            "https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst",
            {
                params: {
                    serviceKey: env.weather.serviceKey,
                    pageNo: 1,
                    numOfRows: 1000,
                    dataType: "JSON",
                    base_date,
                    base_time,
                    nx: grid.nx,
                    ny: grid.ny,
                },
            }
        );

        const items = response.data?.response?.body?.items?.item || [];
        const daily = {};

        for (const item of items) {
            const date = item.fcstDate;

            if (!daily[date]) {
                daily[date] = {
                    minTemp: null,
                    maxTemp: null,
                    tmpMin: null,
                    tmpMax: null,
                    rainProb: 0,
                };
            }

            const value = Number(item.fcstValue);

            if (item.category === "TMN") {
                daily[date].minTemp = value;
            }

            if (item.category === "TMX") {
                daily[date].maxTemp = value;
            }

            if (item.category === "TMP") {
                daily[date].tmpMin =
                    daily[date].tmpMin === null
                        ? value
                        : Math.min(daily[date].tmpMin, value);

                daily[date].tmpMax =
                    daily[date].tmpMax === null
                        ? value
                        : Math.max(daily[date].tmpMax, value);
            }

            if (item.category === "POP") {
                daily[date].rainProb = Math.max(daily[date].rainProb, value);
            }
        }

        const rows = Object.entries(daily).slice(1, 4);

        for (const [date, d] of rows) {
            const minTemp = d.minTemp ?? d.tmpMin;
            const maxTemp = d.maxTemp ?? d.tmpMax;

            if (minTemp === null || maxTemp === null) continue;

            await saveForecast({
                date: `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`,
                region,
                minTemp,
                maxTemp,
                avgTemp: (minTemp + maxTemp) / 2,
                rainProb: d.rainProb,
                source: "short",
            });
        }
    }
}

async function collectMidForecast() {
    const tmFc = getMidTmFc();

    for (const [region, regId] of Object.entries(MID_REGION_MAP)) {
        const tempResponse = await axios.get(
            "https://apis.data.go.kr/1360000/MidFcstInfoService/getMidTa",
            {
                params: {
                    serviceKey: env.weather.serviceKey,
                    pageNo: 1,
                    numOfRows: 10,
                    dataType: "JSON",
                    regId,
                    tmFc,
                },
            }
        );

        const rainResponse = await axios.get(
            "https://apis.data.go.kr/1360000/MidFcstInfoService/getMidLandFcst",
            {
                params: {
                    serviceKey: env.weather.serviceKey,
                    pageNo: 1,
                    numOfRows: 10,
                    dataType: "JSON",
                    regId,
                    tmFc,
                },
            }
        );

        const temp = tempResponse.data?.response?.body?.items?.item?.[0];
        const rain = rainResponse.data?.response?.body?.items?.item?.[0];

        if (!temp || !rain) continue;

        for (let day = 4; day <= 10; day++) {
            const date = new Date();
            date.setHours(0, 0, 0, 0);
            date.setDate(date.getDate() + day);

            const minTemp = Number(temp[`taMin${day}`]);
            const maxTemp = Number(temp[`taMax${day}`]);

            const rainProb =
                day <= 7
                    ? Math.max(
                        Number(rain[`rnSt${day}Am`] ?? 0),
                        Number(rain[`rnSt${day}Pm`] ?? 0)
                    )
                    : Number(rain[`rnSt${day}`] ?? 0);

            await saveForecast({
                date: formatDate(date),
                region,
                minTemp,
                maxTemp,
                avgTemp: (minTemp + maxTemp) / 2,
                rainProb,
                source: "mid",
            });
        }
    }
}

async function collectAllWeatherForecasts() {
    await collectShortForecast();
    await collectMidForecast();
}

module.exports = {
    collectShortForecast,
    collectMidForecast,
    collectAllWeatherForecasts,
};