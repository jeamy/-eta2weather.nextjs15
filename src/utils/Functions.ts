import Diff from "@/reader/functions/Diff";
import { ConfigState } from "@/redux/configSlice";
import { WifiAF83State } from "@/redux/wifiAf83Slice";
import { EtaApi } from '@/reader/functions/EtaApi';
import { EtaConstants, Names2Id } from "@/reader/functions/types-constants/Names2IDconstants";

type EtaValues = {
    einaus: string;
    schaltzustand: string;
    heizentaste: string;
    tes: number;
    tea: number;
};

type TempDiff = {
    diff: number | null;
    twa: number;
    twi: number;
};

export function calculateNewSliderPosition({ einaus, schaltzustand, heizentaste }: EtaValues, diff: number): string {

    //    console.log(`
    //      Einaus: ${einaus}
    //      Schaltzustand: ${schaltzustand}
    //      Kommenttaste: ${kommenttaste}
    //      Diff: ${diff}
    //    `);
    return (einaus === "Aus" || (schaltzustand === "Aus" && heizentaste === "Aus"))
        ? "0.0"
        : new Diff().getDiff(diff, 1.25, 5.0, 0.0, 100.0).toString();
}

export function calculateTemperatureDiff(config: ConfigState, wifiAf83Data: WifiAF83State): { diff: number | null; twa: number; twi: number } {
    //    console.log('calculatingTemperature diff...', wifiAf83Data);

    const twi = wifiAf83Data.data.indoorTemperature;
    const twa = wifiAf83Data.data.temperature ?? 0;
    const { t_soll, t_delta } = config.data;

    /*    
        console.log(`
          Außentemperatur: ${twa}
          Innentemperatur: ${twi}
          Solltemperatur: ${t_soll}
          Deltatemperatur: ${t_delta}
        `);
    */

    const tSollNum = Number(t_soll);
    const tDeltaNum = Number(t_delta);

    if (isNaN(tSollNum) || isNaN(tDeltaNum) || isNaN(twi)) {
        console.error('Invalid temperature values:', { t_soll, t_delta, twi });
        return { diff: null, twa, twi };
    }

    const diff = Math.min(tSollNum + tDeltaNum - twi, 5.0);
//    console.log(`Diff calculation: ${tSollNum} + ${tDeltaNum} - ${twi} = ${diff}`);
    return { diff: Number(diff.toFixed(1)), twa, twi };
}

export interface EtaApiInterface {
    setUserVar: (id: string, value: string, flags: string, index: string) => Promise<void>;
}

export async function updateSliderPosition(
    newPosition: number,
    currentPosition: number,
    names2id: Names2Id,
    etaApi: EtaApi,
): Promise<{ success: boolean; position: number; error?: string }> {
    // Set the new position
    const id = names2id[EtaConstants.SCHIEBERPOS]?.['id'];
    if (!id) {
        return {
            success: false,
            position: currentPosition,
            error: `Keine ID gefunden für shortkey: ${EtaConstants.SCHIEBERPOS}`
        };
    }

    const scaledPosition = (newPosition * 10).toString();
    try {
        // Set the new position using the API route
        const response = await fetch('/api/eta/update', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                id,
                value: scaledPosition,
                begin: "0",
                end: "0"
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to update slider position');
        }

        const data = await response.json();
        return {
            success: true,
            position: newPosition
        };
    } catch (error) {
        console.error('Error setting slider position:', error);
        return {
            success: false,
            position: currentPosition,
            error: error instanceof Error ? error.message : String(error)
        };
    }
}
