/**
 * API 응답 형식을 통일한다.
 */

function success(res, data = {}, message = "success") {
    return res.json({
        success: true,
        message,
        data,
    });
}

function fail(res, message = "error", statusCode = 500) {
    return res.status(statusCode).json({
        success: false,
        message,
    });
}

module.exports = {
    success,
    fail,
};