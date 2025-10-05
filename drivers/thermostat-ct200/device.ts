import Homey from 'homey';
import { Client } from './bosch';

import DeviceSettings from './deviceSettings';

const nameof = <T>(name: keyof T) => name;

module.exports = class extends Homey.Device {
    #client: Client = new Client();
    #shouldSync: boolean = true;
    #isSyncing: boolean = false;
    #timeout: NodeJS.Timeout | null = null;
    #settings: DeviceSettings | null = null;

    async onInit() {
        this.#settings = this.getSettings() as DeviceSettings;

        await this.#client.connect(
            this.#settings!.serialNumber,
            this.#settings!.accessKey,
            this.#settings!.password);

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

    async onDeleted() {
        await this.reset();

        this.log('EasyControl device has been deleted');
    }

    private async registerCapabilities(): Promise<void> {
        this.registerCapabilityListener('target_temperature', this.onSetTargetTemperature.bind(this));

        const capabilities: string[] = [
            'ec_measure_return_temperature',
            'ec_measure_actual_modulation'
        ];

        for (let capability of capabilities) {
            if (!this.hasCapability(capability)) {
                await this.addCapability(capability);
            }
        }
    }

    private async reset() {
        this.#shouldSync = false;
        this.#timeout && clearTimeout(this.#timeout);
        this.#client.disconnect();
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

    private async setThermostatData() {
        const zoneId = this.#settings!.zoneId;

        const zoneTemperature = await this.#client.getZoneTemperature(zoneId);
        const zoneTargetTemperature = await this.#client.getZoneTargetTemperature(zoneId);
        const zoneHumidity = await this.#client.getZoneHumidity(zoneId);
        const systemPressure = await this.#client.getApplianceSystemPressure();
        const wifiSignalStrength = await this.#client.getWifiSignalStrength();
        const returnTemperature = await this.#client.getHeatSourcesReturnTemperature();
        const actualModulation = await this.#client.getHeatSourcesActualModulation();

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
    }

    private async onSetTargetTemperature(value: any): Promise<void> {
        this.log(`Setting target temperature: ${value}C`);

        const response = await this.#client.setZoneTargetTemperature(this.#settings!.zoneId, value);

        if (response?.status !== 'ok') {
            this.error(`Failed to set target temperature: ${response?.status}`);
        }
    }

};
