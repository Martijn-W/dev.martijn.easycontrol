import Homey from 'homey';
import { Client, thermostatManager } from '../../bosch';
import DeviceSettings from './deviceSettings';
import EtrvDevice from '../etrv/device';

const nameof = <T>(name: keyof T) => name;

export default class Ct200Device extends Homey.Device {
    #client: Client = new Client();
    #shouldSync: boolean = true;
    #isSyncing: boolean = false;
    #timeout: NodeJS.Timeout | null = null;
    #settings: DeviceSettings | null = null;
    #connectedValves: EtrvDevice[] = [];

    async onInit() {
        this.#settings = this.fixSettings(this.getSettings() as DeviceSettings);

        await this.#client.connect(
            this.#settings!.serialNumber,
            this.#settings!.accessKey,
            this.#settings!.password);

        thermostatManager.addThermostat(this.#settings!.serialNumber, this);

        await this.registerCapabilities();

        this.log('EasyControl device has been initialized');

        this.#shouldSync = true;

        await this.sync();
    }

    async onSettings(event: {
        oldSettings: { [key: string]: boolean | string | number | undefined | null },
        newSettings: { [key: string]: boolean | string | number | undefined | null },
        changedKeys: string[]
    }): Promise<string | void> {
        this.log('EasyControl settings where changed');

        if (event.changedKeys.includes(nameof<DeviceSettings>('pollingInterval'))) {
            const newInterval = event.newSettings[nameof<DeviceSettings>('pollingInterval')] as number || null;

            this.log(`Polling interval changed, resetting timeout to: ${newInterval}s`);

            this.#timeout && clearTimeout(this.#timeout);
            this.scheduleNextSync(newInterval);
        }
    }

    async onDeleted(): Promise<void> {
        thermostatManager.removeThermostat(this.#settings!.serialNumber);

        await this.reset();

        this.log('EasyControl device has been deleted');
    }

    registerValve(device: EtrvDevice): void {
        this.#connectedValves.push(device);
    }

    removeValve(device: EtrvDevice): void {
        this.#connectedValves = this.#connectedValves.filter(valve => valve !== device);
    }

    getClient(): Client {
        return this.#client;
    }

    requestSync(): void {
        this.scheduleNextSync(0);
    }

    async onSetTemperatureOffset(value: number): Promise<void> {
        if (value < -2 || value > 2 || value % .5 !== 0) {
            throw new Error('Temperature offset must be between -2 and 2 with a step value of .5');
        }

        this.log(`Setting temperature offset: ${value}`);

        const response = await this.#client.setSystemTemperatureOffset(value);

        if (response?.status !== 'ok') {
            throw new Error(`Failed to set temperature offset: ${response?.status}`);
        }

        this.setCapabilityValue('ec_temperature_offset', value).catch(this.error);
    }

    async onSetChildLock(value: boolean): Promise<void> {
        this.log(`Setting child lock status: ${value}`);

        const response = await this.#client.setDeviceThermostatChildLock(this.getData().id, value);

        if (response?.status !== 'ok') {
            throw new Error(`Failed to set child lock status: ${response?.status}`);
        }

        this.setCapabilityValue('ec_child_lock', value).catch(this.error);
    }

    private async registerCapabilities(): Promise<void> {
        const capabilities: string[] = [
            'ec_measure_return_temperature',
            'ec_measure_actual_modulation',
            'ec_child_lock',
            'ec_measure_outside_temperature',
            'ec_temperature_offset'
        ];

        for (let capability of capabilities) {
            if (!this.hasCapability(capability)) {
                await this.addCapability(capability);
            }
        }

        this.registerCapabilityListener('target_temperature', this.onSetTargetTemperature.bind(this));
        this.registerCapabilityListener('ec_child_lock', this.onSetChildLock.bind(this));
    }

    private async reset() {
        this.#shouldSync = false;
        this.#timeout && clearTimeout(this.#timeout);
        await this.#client.disconnect();
    }

    private async sync() {
        if (!this.#shouldSync || this.#isSyncing)
            return;

        this.log('Syncing data...');

        this.#settings = this.getSettings() as DeviceSettings;
        this.#isSyncing = true;

        await this.setThermostatData();

        this.#isSyncing = false;

        this.log('Data synced');

        this.scheduleNextSync(this.#settings?.pollingInterval ?? 30);
    }

    private scheduleNextSync(intervalSeconds: number | null) {
        const nextIntervalMs = (intervalSeconds ?? 30) * 1000;

        this.log(`Next sync in: ${nextIntervalMs}ms`);

        this.#timeout = setTimeout(
            async () => await this.sync(),
            nextIntervalMs
        );
    }

    private async setThermostatData(): Promise<void> {
        const zoneId = this.#settings!.zoneId;

        const zoneTemperature = await this.#client.getZoneTemperature(zoneId);
        const zoneTargetTemperature = await this.#client.getZoneTargetTemperature(zoneId);
        const zoneHumidity = await this.#client.getZoneHumidity(zoneId);
        const systemPressure = await this.#client.getApplianceSystemPressure();
        const wifiSignalStrength = await this.#client.getWifiSignalStrength();
        const returnTemperature = await this.#client.getHeatSourcesReturnTemperature();
        const actualModulation = await this.#client.getHeatSourcesActualModulation();
        const deviceThermostatChildLockEnabled = await this.#client.getDeviceThermostatChildLock(this.getData().id);
        const outsideTemperature = await this.#client.getOutsideTemperature();
        const systemTemperatureOffset = await this.#client.getSystemTemperatureOffset();

        if (zoneTemperature != null) {
            this.log(`→ temperature: ${zoneTemperature.value}${zoneTemperature.unitOfMeasure}`);

            this.setCapabilityValue('measure_temperature', zoneTemperature.value).catch(this.error);
        }

        if (zoneTargetTemperature != null) {
            this.log(`→ target temperature: ${zoneTargetTemperature.value}${zoneTargetTemperature.unitOfMeasure}`);

            this.setCapabilityValue('target_temperature', zoneTargetTemperature.value).catch(this.error);
        }

        if (zoneHumidity != null) {
            this.log(`→ humidity: ${zoneHumidity.value}${zoneHumidity.unitOfMeasure}`);

            this.setCapabilityValue('measure_humidity', zoneHumidity.value).catch(this.error);
        }

        if (systemPressure != null) {
            this.log(`→ system pressure: ${systemPressure.value}${systemPressure.unitOfMeasure}`);

            // Convert from bar to millibar
            const pressure = systemPressure.value * 1000;
            this.setCapabilityValue('measure_pressure', pressure).catch(this.error);
        }

        if (wifiSignalStrength != null) {
            this.log(`→ wifi signal strength: ${wifiSignalStrength.value}${wifiSignalStrength.unitOfMeasure}`);

            this.setCapabilityValue('measure_signal_strength', wifiSignalStrength.value).catch(this.error);
        }

        if (returnTemperature != null) {
            this.log(`→ return temperature: ${returnTemperature.value}${returnTemperature.unitOfMeasure}`);

            this.setCapabilityValue('ec_measure_return_temperature', returnTemperature.value).catch(this.error);
        }

        if (actualModulation != null) {
            this.log(`→ actual modulation: ${actualModulation.value}${actualModulation.unitOfMeasure}`);

            this.setCapabilityValue('ec_measure_actual_modulation', actualModulation.value).catch(this.error);
        }

        if (deviceThermostatChildLockEnabled != null) {
            this.log(`→ child lock status: ${deviceThermostatChildLockEnabled.value}`);

            const value: unknown = deviceThermostatChildLockEnabled.value;

            if (typeof value === 'boolean') {
                this.setCapabilityValue('ec_child_lock', value).catch(this.error);
            } else if (typeof value === 'string') {
                this.setCapabilityValue('ec_child_lock', value.toLowerCase() === 'true').catch(this.error);
            } else {
                this.log(`! unexpected child lock status type: ${typeof value}, value: ${value}`);
            }
        }

        if (outsideTemperature != null) {
            this.log(`→ outside temperature: ${outsideTemperature.value}${outsideTemperature.unitOfMeasure}`);

            this.setCapabilityValue('ec_measure_outside_temperature', outsideTemperature.value).catch(this.error);
        }

        if (systemTemperatureOffset != null) {
            this.log(`→ system temperature offset: ${systemTemperatureOffset.value}${systemTemperatureOffset.unitOfMeasure}`);

            this.setCapabilityValue('ec_temperature_offset', systemTemperatureOffset.value).catch(this.error);
        }

        // Notify all connected thermostat valves that they need to update. Make sure to wait for each device to finish,
        // that way we don't have to worry about multiple messages conflicting with each other.
        for (const valve of this.#connectedValves) {
            try {
                this.log(`Syncing data for valve '${valve.getName()}'...`);
                await valve.setThermostatValveData();
            } catch (e) {
                this.error(`Failed to update thermostat valve data for device '${valve.getName()}'`, e);
            }
        }
    }

    private async onSetTargetTemperature(value: any): Promise<void> {
        this.log(`Setting target temperature: ${value}C`);

        const response = await this.#client.setZoneTargetTemperature(this.#settings!.zoneId, value);

        if (response?.status !== 'ok') {
            this.error(`Failed to set target temperature: ${response?.status}`);
        }
    }

    /**
     * Fixes the data types of the settings object.
     * @param settings
     * @private
     */
    private fixSettings(settings: DeviceSettings): DeviceSettings {
        settings.serialNumber = parseInt(settings.serialNumber as unknown as string);
        settings.zoneId = parseInt(settings.zoneId as unknown as string);
        settings.pollingInterval = parseInt(settings.pollingInterval as unknown as string);

        return settings;
    }
}
