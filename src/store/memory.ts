import type { Store } from "../types";

interface WindowData {
    count: number;
    expiry: number;
}

export const createMemoryStore = (): Store => {
    const map = new Map<string, WindowData>();

    const increment = async (key: string, windowSeconds: number) => {
        const now = Date.now();
        const windowMs = windowSeconds * 1000;

        let record = map.get(key);

        if (!record || now > record.expiry) {
            record = {
                count: 0,
                expiry: now + windowMs
            }
        }

        record.count++;

        map.set(key, record);

        return {
            count: record.count,
            resetTime: record.expiry
        }
    }

    return { increment }
}