import { Ct200BaseDevice } from '../devices/base/ct200BaseDevice';

export class ThermostatManager {
    private thermostats: Map<number, { name: string, device: Ct200BaseDevice<any> }> = new Map<number, { name: string, device: Ct200BaseDevice<any> }>();

    public addThermostat(serialNumber: number, deviceInstance: Ct200BaseDevice<any>): void {
        this.thermostats.set(serialNumber, {name: deviceInstance.getName(), device: deviceInstance});
    }

    public removeThermostat(serialNumber: number): void {
        this.thermostats.delete(serialNumber);
    }

    public getThermostat(serialNumber: number): Ct200BaseDevice<any> | undefined {
        return this.thermostats.get(serialNumber)?.device;
    }

    public listThermostats(): { serialNumber: number, name: string }[] {
        return Array.from(this.thermostats.entries()).map(([serialNumber, value]) => ({
            serialNumber,
            name: value.name
        }));
    }
}

export const thermostatManager: ThermostatManager = new ThermostatManager();
