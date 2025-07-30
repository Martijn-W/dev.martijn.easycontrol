import Homey from 'homey';
import { Client } from './bosch';

module.exports = class extends Homey.Device {

    #client: Client = new Client();

    async onInit() {
        const serialNumber = this.getSetting('serialNumber');
        const accessKey = this.getSetting('accessKey');
        const password = this.getSetting('password');

        await this.#client.connect(serialNumber, accessKey, password);
        await this.setInitialValues();

        this.log('EasyControl device has been initialized');
    }

    async onAdded() {
        this.log('EasyControl has been added');
    }

    async onSettings(): Promise<string | void> {
        this.log('EasyControl settings where changed');
    }

    async onDeleted() {
        this.#client.disconnect();

        this.log('EasyControl device has been deleted');
    }

    private async setInitialValues() {
        const zones = await this.#client.getZones();

        if (zones == null)
            return;

        const zone = zones[0]; // todo: move this to initial setup!

        const zoneTemperature = await this.#client.getZoneTemperature(zone.id);
        const zoneTargetTemperature = await this.#client.getZoneTargetTemperature(zone.id);
        const zoneHumidity = await this.#client.getZoneHumidity(zone.id);

        if (zoneTemperature != null) {
            console.log(`Current temperature: ${zoneTemperature.value}${zoneTemperature?.unitOfMeasure}`);

            this.setCapabilityValue('measure_temperature', zoneTemperature.value).catch(this.error);
        }

        if (zoneTargetTemperature != null) {
            console.log(`Current temperature: ${zoneTargetTemperature.value}${zoneTemperature?.unitOfMeasure}`);

            this.setCapabilityValue('target_temperature', zoneTargetTemperature.value).catch(this.error);
        }

        if (zoneHumidity != null) {
            console.log(`Current humidity: ${zoneHumidity.value}${zoneHumidity?.unitOfMeasure}`);

            this.setCapabilityValue('measure_humidity', zoneHumidity.value).catch(this.error);
        }
    }

};
