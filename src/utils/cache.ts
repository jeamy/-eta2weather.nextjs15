interface CacheEntry<T> {
    data: T;
    timestamp: number;
}

class Cache<T> {
    private data: Map<string, CacheEntry<T>> = new Map();
    private ttl: number;

    constructor(ttlMilliseconds: number) {
        this.ttl = ttlMilliseconds;
    }

    set(key: string, value: T): void {
        this.data.set(key, {
            data: value,
            timestamp: Date.now()
        });
    }

    get(key: string): T | null {
        const entry = this.data.get(key);
        if (!entry) return null;

        const isExpired = Date.now() - entry.timestamp > this.ttl;
        if (isExpired) {
            console.log(`Cache entry expired for key: ${key}`);
            this.data.delete(key);
            return null;
        }

        return entry.data;
    }

    clear(): void {
        this.data.clear();
    }
}

import { promises as fs } from 'fs';
import path from 'path';
import { Names2Id } from '@/reader/functions/types-constants/Names2IDconstants';

export const CONFIG_CACHE_KEY = 'eta_config';
export const WIFIAF83_CACHE_KEY = 'wifiaf83_data';
export const NAMES2ID_CACHE_KEY = 'names2id_config';

const CONFIG_PATH = path.join(process.cwd(), 'src', 'config', 'f_etacfg.json');
const NAMES2ID_PATH = path.join(process.cwd(), 'src', 'config', 'f_names2id.json');
const WIFIAF83_PATH = path.join(process.cwd(), 'src', 'config', 'f_wifiaf89.json');

// Create singleton cache instances with 3 seconds TTL
export const configCache = new Cache<any>(3000);
export const wifiaf83Cache = new Cache<any>(3000);
export const names2idCache = new Cache<Names2Id>(3000);

export async function getConfig() {
    // Try to get config from cache first
    const cachedConfig = configCache.get(CONFIG_CACHE_KEY);
    if (cachedConfig) {
        return cachedConfig;
    }

    // If not in cache, read from file
    const configData = await fs.readFile(CONFIG_PATH, 'utf8');
    const config = JSON.parse(configData);
    
    // Store in cache
    configCache.set(CONFIG_CACHE_KEY, config);
    return config;
}

export async function updateConfig(newConfig: any) {
    // Get existing config
    let existingConfig = {};
    try {
        const configData = await fs.readFile(CONFIG_PATH, 'utf8');
        existingConfig = JSON.parse(configData);
    } catch (error) {
        console.error('Error reading existing config:', error);
    }

    // Merge existing config with new config
    const mergedConfig = { ...existingConfig, ...newConfig };
    
    // Write the merged config to file
    await fs.writeFile(CONFIG_PATH, JSON.stringify(mergedConfig, null, 2));
    
    // Update cache with merged config
    configCache.set(CONFIG_CACHE_KEY, mergedConfig);
}

async function updateWifiAf83File(data: any) {
    try {
        const fileData = {
            code: 0,
            msg: "success",
            time: Math.floor(Date.now() / 1000).toString(),
            data: data,
            datestring: new Date().toLocaleString('de-DE', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
                year: 'numeric',
                hour: 'numeric',
                minute: 'numeric',
                second: 'numeric'
            }),
            diff: "0"
        };
        await fs.writeFile(WIFIAF83_PATH, JSON.stringify(fileData, null, 2));
    } catch (error) {
        console.error('Error writing to wifiaf83 file:', error);
    }
}

async function readWifiAf83File(): Promise<any> {
    try {
        const data = await fs.readFile(WIFIAF83_PATH, 'utf8');
        const jsonData = JSON.parse(data);
        return jsonData.data;
    } catch (error) {
        console.error('Error reading wifiaf83 file:', error);
        return null;
    }
}

export async function getWifiAf83Data(fetchFn: () => Promise<any>) {
    // Try to get data from cache first
    const cachedData = wifiaf83Cache.get(WIFIAF83_CACHE_KEY);
    
    try {
        // If not in cache or expired, fetch new data
        if (!cachedData) {
            try {
                const response = await fetchFn();

                // Check if the response has the expected structure
                if (!response || response.code !== 0) {
                    throw new Error(`Failed to fetch WifiAf83 data: ${response?.msg || 'Unknown error'}`);
                }

                // Store in cache and file
                wifiaf83Cache.set(WIFIAF83_CACHE_KEY, response.data);
                await updateWifiAf83File(response.data);
                return response.data;
            } catch (fetchError) {
                // If fetch fails and we have no cache, try to read from file
                const fileData = await readWifiAf83File();
                if (fileData) {
                    wifiaf83Cache.set(WIFIAF83_CACHE_KEY, fileData);
                    return fileData;
                }
                throw fetchError;
            }
        }
        
        // If we have cached data, try to fetch new data in the background
        fetchFn().then(response => {
            if (response && response.code === 0) {
                wifiaf83Cache.set(WIFIAF83_CACHE_KEY, response.data);
                updateWifiAf83File(response.data).catch(() => {
                    // Ignore file write errors in background update
                });
            }
        }).catch(() => {
            // Ignore background fetch errors
        });
        
        return cachedData;
    } catch (error) {
        // If we have cached data and get a rate limit error, return the cached data
        if (cachedData && error instanceof Error && 
            (error.message.includes('too frequent') || error.message.includes('rate limit'))) {
            console.log('Using cached data due to rate limit');
            return cachedData;
        }

        // If no cache and error is not rate limit, try file as last resort
        const fileData = await readWifiAf83File();
        if (fileData) {
            console.log('Using file data as fallback');
            wifiaf83Cache.set(WIFIAF83_CACHE_KEY, fileData);
            return fileData;
        }

        throw error;
    }
}

export async function getNames2Id(): Promise<Names2Id> {
    // Try to get from cache first
    const cachedData = names2idCache.get(NAMES2ID_CACHE_KEY);
    if (cachedData) {
        return cachedData;
    }

    // If not in cache, read from file
    const names2idData = await fs.readFile(NAMES2ID_PATH, 'utf8');
    const names2id: Names2Id = JSON.parse(names2idData);

    // Store in cache
    names2idCache.set(NAMES2ID_CACHE_KEY, names2id);

    return names2id;
}
