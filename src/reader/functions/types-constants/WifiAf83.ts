import { WifiData } from './WifiConstants';

export const WIFIAF83 = 'WIFIAF83';

export interface WifiAF83Data {
    time: number;
    datestring: string;
    temperature: number;
    indoorTemperature: number;
    allData: WifiData | null;
}

export const formatDateTime = (data: WifiAF83Data): void => {
    const date = new Date(data.time);
    data.datestring = date.toLocaleString('de-DE', {
        hour: 'numeric',
        minute: 'numeric',
        second: 'numeric',
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
    });
};
