export const measureEventLoopLag = (): Promise<number> => {
    return new Promise((resolve) => {
        const start = Date.now();
        setImmediate(() => {
            const end = Date.now();
            const lag = end - start;
            resolve(lag);
        });
    });
};