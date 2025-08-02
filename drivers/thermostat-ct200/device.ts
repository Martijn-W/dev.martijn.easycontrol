import Homey from 'homey';
import { Client } from './bosch';
import DeviceData from './deviceData';

module.exports = class extends Homey.Device {
    #client: Client = new Client();
    #shouldSync: boolean = true;
    #isSyncing: boolean = false;
    #timeout: NodeJS.Timeout | null = null;

    async onInit() {
        const deviceData = this.getSetting('device') as DeviceData;

        await this.#client.connect(deviceData.serialNumber, deviceData.accessKey, deviceData.password);

        this.log('EasyControl device has been initialized');

        await this.sync();
    }

    async onAdded() {
        this.log('EasyControl has been added');
    }

    async onSettings(): Promise<string | void> {
        this.log('EasyControl settings where changed');
    }

    async onDeleted() {
        this.#shouldSync = false;
        this.#timeout && clearTimeout(this.#timeout);
        this.#client.disconnect();

        this.log('EasyControl device has been deleted');
    }

    private async sync() {
        if (!this.#shouldSync || this.#isSyncing)
            return;

        this.log('Syncing data...');

        this.#isSyncing = true;

        await this.setThermostatData();

        this.#isSyncing = false;

        this.log('Data synced');

        this.#timeout = setTimeout(
            async () => await this.sync(),
            10000 //todo: get from settings
        );
    }

    private async setThermostatData() {
        const zoneId = this.getSetting('zoneId') as number;

        const zoneTemperature = await this.#client.getZoneTemperature(zoneId);
        const zoneTargetTemperature = await this.#client.getZoneTargetTemperature(zoneId);
        const zoneHumidity = await this.#client.getZoneHumidity(zoneId);
        const systemPressure = await this.#client.getApplianceSystemPressure();

        if (zoneTemperature != null) {
            this.log(`Current temperature: ${zoneTemperature.value}${zoneTemperature?.unitOfMeasure}`);

            this.setCapabilityValue('measure_temperature', zoneTemperature.value).catch(this.error);
        }

        if (zoneTargetTemperature != null) {
            this.log(`Current temperature: ${zoneTargetTemperature.value}${zoneTemperature?.unitOfMeasure}`);

            this.setCapabilityValue('target_temperature', zoneTargetTemperature.value).catch(this.error);
        }

        if (zoneHumidity != null) {
            this.log(`Current humidity: ${zoneHumidity.value}${zoneHumidity?.unitOfMeasure}`);

            this.setCapabilityValue('measure_humidity', zoneHumidity.value).catch(this.error);
        }

        if (systemPressure != null) {
            this.log(`Current system pressure: ${systemPressure.value}${systemPressure?.unitOfMeasure}`);

            // Convert from bar to millibar
            const pressure = systemPressure.value * 1000;
            this.setCapabilityValue('measure_pressure', pressure).catch(this.error);
        }
    }

};
