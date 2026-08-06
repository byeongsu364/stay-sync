const axios = require("axios");

/**
 * ==========================================================
 * Location Input Service
 * ==========================================================
 *
 * 역할
 * ----------------------------------------------------------
 * 사용자가 입력한 위치를 검색하여
 * 좌표 정보를 반환한다.
 *
 * 사용 대상
 * - 숙소
 * - 호텔
 * - 펜션
 * - 리조트
 * - 주소
 * - 당일치기 출발지
 *
 * ==========================================================
 * 현재
 * ----------------------------------------------------------
 * Mock 좌표 반환
 *
 * TODO (배포 시 변경)
 * ----------------------------------------------------------
 * Kakao Local API
 * 또는
 * Naver Geocoding API
 * 또는
 * Google Geocoding API
 *
 * 로 변경
 * ==========================================================
 */

/**
 * 위치 검색
 */
async function searchLocation(keyword) {
    if (!keyword || keyword.trim() === "") {
        return null;
    }

    try {
        // TODO
        // Kakao Local API 연동 예정

        return {
            name: keyword.trim(),
            address: keyword.trim(),
            latitude: 37.5665,
            longitude: 126.9780,
        };
    } catch (error) {
        console.error("Location Search Error :", error.message);
        return null;
    }
}

/**
 * 숙소 위치 검색
 */
async function getAccommodationLocation(accommodationName) {
    return await searchLocation(accommodationName);
}

/**
 * 출발지 위치 검색
 */
async function getDepartureLocation(locationName) {
    return await searchLocation(locationName);
}

/**
 * 위치 존재 여부 확인
 */
async function validateLocation(keyword) {
    const result = await searchLocation(keyword);
    return result !== null;
}

/**
 * Controller에서 사용할 위치 조회
 */
async function resolveLocation(keyword) {
    const location = await searchLocation(keyword);

    if (!location) {
        return {
            success: false,
            message: "위치를 찾을 수 없습니다. 다시 입력해주세요.",
            location: null,
        };
    }

    return {
        success: true,
        message: "위치를 확인했습니다.",
        location,
    };
}

/**
 * ==========================================================
 * Chat Service에서 사용하는 위치 입력 처리
 * ==========================================================
 *
 * 현재는 실제 위치 입력 단계가 없으므로
 * 항상 handled=false 반환
 *
 * 추후
 * - 숙소 입력
 * - 출발지 입력
 * 단계에서 Kakao Local API를 호출하도록 확장 예정
 * ==========================================================
 */
async function handleLocationInput({
    userMessage,
    facts,
    currentStep,
}) {
    return {
        handled: false,
        facts,
        current_step: currentStep,
        route_number: null,
        last_question_field: null,
        reply: null,
    };
}

module.exports = {
    searchLocation,
    getAccommodationLocation,
    getDepartureLocation,
    validateLocation,
    resolveLocation,
    handleLocationInput,
};