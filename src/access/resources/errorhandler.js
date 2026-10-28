export const withError = (message, fn) => async (...args) => {
  try {
    return await fn(...args);
  } catch (e) {
    console.error(`${message}: `, e);
    throw e;
  }
};