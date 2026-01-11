export function logInfo(message, meta) {
    if (meta)
        console.info(message, meta);
    else
        console.info(message);
}
export function logError(message, error) {
    if (error instanceof Error) {
        console.error(message, { message: error.message, stack: error.stack });
    }
    else {
        console.error(message, error);
    }
}
