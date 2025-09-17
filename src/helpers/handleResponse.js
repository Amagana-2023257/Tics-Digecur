export const handleErrorResponse = (res, statusCode, message, error = '') => {
    let errorString = '';
    if (error && error.message) {
      errorString = error.message;
    } else if (typeof error === 'object') {
      try {
        errorString = JSON.stringify(error, Object.getOwnPropertyNames(error), 2);
      } catch (e) {
        errorString = String(error);
      }
    } else {
      errorString = error;
    }
    return res.status(statusCode).json({
      success: false,
      message,
      error: errorString
    });
  };
  
  export const handleSuccessResponse = (res, statusCode, message, data = null) => {
    return res.status(statusCode).json({
      success: true,
      message,
      data,
    });
  };
  