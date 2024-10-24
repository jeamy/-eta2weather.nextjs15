import { EtaConstants, Names2Id, Names2IdReader } from '../serverfunctions/Names2Id';
import { Config, ConfigKeys, readConfig} from '../serverfunctions/Config';
import { FetchWifiAf83 } from '../serverfunctions/FetchWifiAf83';
import { FetchEta, ETA } from '../serverfunctions/FetchEta';
import Diff from './Diff';
import { EtaApi } from './EtaApi';
import * as fs from 'fs';
import { store } from "../../redux";

type EtaValues = {
  einaus: string;
  schalt: string;
  kommenttaste: string;
  tes: number;
  tea: number;
};

type TempDiff = {
  diff: number | null;
  twa: number;
  twi: number;
};

export class SetEta {
  private config: Config = {} as Config;
  private names2id: Names2Id = {} as Names2Id;
  private etaApi: EtaApi;
  private fetchEta: FetchEta;

  constructor() {
    this.config = store.getState().config.data;
    this.etaApi = new EtaApi();
    this.fetchEta = new FetchEta(this.config, {});
  }

  public async setEta(): Promise<string> {
    try {
      await this.initializeData();
      const [etaData, wifiAf83Data] = await this.fetchData();

      if (!wifiAf83Data) throw new Error("Fetching WifiAF83 failed.");

      const etaValues = this.getEtaValues(etaData);
      const tempDiff = this.calculateTemperatureDiff(wifiAf83Data);

      if (tempDiff.diff === null) return '0';

      const newSliderPosition = this.calculateNewSliderPosition(etaValues, tempDiff.diff);
      await this.updateData(etaData, wifiAf83Data, newSliderPosition, tempDiff.diff);

      this.logData(etaValues, tempDiff, newSliderPosition);

      if (this.shouldUpdateSlider(etaValues.tes, newSliderPosition)) {
        await this.updateSliderPosition(etaData, newSliderPosition);
      } else {
        console.log("Setting slider skipped!\n");
      }

      return '1';
    } catch (error) {
      return this.handleError(error);
    }
  }

  private async initializeData(): Promise<void> {
     
    this.config = await readConfig(ConfigKeys.F_ETA);

    this.names2id = new Names2IdReader(this.config).readNames2Id();
  }

  private async fetchData(): Promise<[Record<string, any>, any]> {
    return Promise.all([
      new FetchEta(this.config, this.names2id).fetchEtaData(),
      new FetchWifiAf83(this.config).fetchWifiAF83Data()
    ]);
  }

  private getEtaValues(etaData: Record<string, any>): EtaValues {
    const getValue = (name: string) => this.getEtaNameData(name, etaData);
    return {
      einaus: getValue(EtaConstants.EIN_AUS_TASTE),
      schalt: getValue(EtaConstants.SCHALTZUSTAND),
      kommenttaste: getValue(EtaConstants.KOMMENTASTE),
      tes: Number(getValue(EtaConstants.SCHIEBERPOS)),
      tea: Number(getValue(EtaConstants.AUSSENTEMP))
    };
  }

  private calculateTemperatureDiff(wifiAf83Data: any): TempDiff {
    if (!('data' in wifiAf83Data)) {
      console.log("Keine Temperaturdaten verfügbar.");
      return { diff: null, twa: 0, twi: 0 };
    }

    const { indoor, outdoor } = wifiAf83Data.data;
    const twi = indoor.temperature.value;
    const twa = outdoor.temperature.value;
    const { T_SOLL, T_DELTA } = this.config;
    const diff = Math.min(Number(T_SOLL) + Number(T_DELTA) - twi, 5.0);
    return { diff: Number(diff.toFixed(1)), twa, twi };
  }

  private calculateNewSliderPosition({ einaus, schalt, kommenttaste }: EtaValues, diff: number): string {
    return (einaus === "Aus" || (schalt === "Aus" && kommenttaste === "Aus"))
      ? "0.0"
      : new Diff().getDiff(diff, 1.25, 5.0, 0.0, 100.0).toString();
  }

  private async updateData(etaData: Record<string, any>, wifiAf83Data: any, newPosition: string, diff: number): Promise<void> {
    etaData[ETA][EtaConstants.SCHIEBERPOS] = { strValue: newPosition };
    wifiAf83Data['diff'] = Number(Math.round(diff).toFixed(1));

    await Promise.all([
      this.writeData(this.config[ConfigKeys.F_ETA], JSON.stringify(etaData)),
      this.writeData(this.config[ConfigKeys.F_WIFIAF83], JSON.stringify(wifiAf83Data))
    ]);
  }

  private async updateSliderPosition(etaData: Record<string, any>, newPosition: string): Promise<void> {
    const scaledPosition = String(Number(newPosition) * 10);
    const id = this.names2id[EtaConstants.SCHIEBERPOS]['id'];

    await this.etaApi.setUserVar(id, scaledPosition, "0", "0");
    await this.fetchEta.prepareAndFetchGetUserVar(EtaConstants.SCHIEBERPOS, etaData);

    const updatedPosition = Number(this.getEtaNameData(EtaConstants.SCHIEBERPOS, etaData));
    const status = Number(newPosition) === updatedPosition ? 'OK' : 'ERROR';
    console.log(`Setting slider ${status}! Position: ${updatedPosition}\nSetting slider done!\n`);
  }

  private shouldUpdateSlider(oldPosition: number, newPosition: string): boolean {
    return Number(newPosition) !== oldPosition;
  }

  private getEtaNameData(name: string, etaData: Record<string, any>): string {
    const key = this.names2id[name]?.["id"];
    return etaData?.[key]?.["strValue"] ?? "Keine Daten!";
  }

  private async writeData(path: string, data: string): Promise<void> {
    await fs.promises.writeFile(path, data);
  }

  private handleError(error: unknown): string {
    console.error('Ein Fehler ist aufgetreten:', error instanceof Error ? error.message : String(error));
    return '0';
  }

  private logData(etaValues: EtaValues, tempDiff: TempDiff, newPosition: string): void {
    const { tea, tes } = etaValues;
    const { twa, twi } = tempDiff;
    const { T_SOLL, T_DELTA } = this.config;

    console.log(`
      Außentemperatur ETA: ${tea}
      Außentemperatur: ${twa}
      Innentemperatur: ${twi}
      Solltemperatur: ${T_SOLL}
      Deltatemperatur: ${T_DELTA}
      Schieber Position: ${tes}
      Schieber Position neu: ${newPosition}
    `);
  }
}