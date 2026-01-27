import Ct200Device from '../devices/ct200/device';

export class ThermostatManager {
    private thermostats: Map<number, { name: string, device: Ct200Device }> = new Map<number, { name: string, device: Ct200Device }>();

    public addThermostat(serialNumber: number, deviceInstance: Ct200Device): void {
        this.thermostats.set(serialNumber, {name: deviceInstance.getName(), device: deviceInstance});
    }

    public removeThermostat(serialNumber: number): void {
        this.thermostats.delete(serialNumber);
    }

    public getThermostat(serialNumber: number): Ct200Device | undefined {
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
