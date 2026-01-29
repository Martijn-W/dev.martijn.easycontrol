import Homey from 'homey';
import { thermostatManager } from '../../bosch';
import DeviceSettings from './deviceSettings';
import Ct200Device from '../ct200/device';

export default class EtrvDevice extends Homey.Device {
    #thermostat: Ct200Device | undefined;
    #settings: DeviceSettings | null = null;

    async onInit() {
        this.#settings = this.fixSettings(this.getSettings() as DeviceSettings);

        await this.registerCapabilities();

        let connectionTries = 0;
        do {
            this.#thermostat = thermostatManager.getThermostat(this.#settings!.serialNumber);
            ++connectionTries;

            if (this.#thermostat === undefined) {
                await this.delay(250);
            }

        } while (this.#thermostat === undefined && connectionTries < 5);

        if (this.#thermostat === undefined) {
            this.error('Failed to connect to thermostat after 5 attempts');
            return;
        }

        this.#thermostat.registerValve(this);

        this.log('EasyControl Thermostat Valve device has been initialized');
    }

    async onDeleted(): Promise<void> {
        this.#thermostat?.removeValve(this);
    }


    public onAdded() {
        console.log('>>>> DEVICE Added!', this.#thermostat === undefined);

        if (this.#thermostat) {
            this.#thermostat.requestSync();
        }
    }

    async onSetTemperatureOffset(value: number): Promise<void> {
        if (!this.#thermostat) {
            return;
        }

        if (value < -2 || value > 2 || value % .5 !== 0) {
            throw new Error('Temperature offset must be between -2 and 2 with a step value of .5');
        }

        this.log(`Setting temperature offset: ${value}`);

        const response = await this.#thermostat.getClient().setDeviceTemperatureOffset(this.#settings!.deviceId, value);

        if (response?.status !== 'ok') {
            throw new Error(`Failed to set temperature offset: ${response?.status}`);
        }

        this.setCapabilityValue('ec_temperature_offset', value).catch(this.error);
    }

    async onSetChildLock(value: boolean): Promise<void> {
        if (!this.#thermostat) {
            return;
        }

        this.log(`Setting child lock status: ${value}`);

        const response = await this.#thermostat.getClient().setDeviceChildLock(this.#settings!.deviceId, value);

        if (response?.status !== 'ok') {
            throw new Error(`Failed to set child lock status: ${response?.status}`);
        }

        this.setCapabilityValue('ec_child_lock', value).catch(this.error);
    }

    private async registerCapabilities(): Promise<void> {
        this.registerCapabilityListener('target_temperature', this.onSetTargetTemperature.bind(this));
        this.registerCapabilityListener('ec_temperature_offset', this.onSetTemperatureOffset.bind(this));
        this.registerCapabilityListener('ec_child_lock', this.onSetChildLock.bind(this));
    }

    private async onSetTargetTemperature(value: any): Promise<void> {
        if (!this.#thermostat) {
            return;
        }

        this.log(`Setting target temperature: ${value}C`);

        const response = await this.#thermostat.getClient().setZoneTargetTemperature(this.#settings!.zoneId, value);

        if (response?.status !== 'ok') {
            this.error(`Failed to set target temperature: ${response?.status}`);
        }
    }

    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async setThermostatValveData(): Promise<void> {
        if (!this.#thermostat) {
            return;
        }

        const client = this.#thermostat.getClient();

        const zoneId: number = this.#settings!.zoneId;
        const deviceId: number = this.#settings!.deviceId;

        const zoneTemperature = await client.getZoneTemperature(zoneId);
        const zoneTargetTemperature = await client.getZoneTargetTemperature(zoneId);
        const batteryStatus = await client.getDeviceBattery(deviceId);
        const deviceSignal = await client.getDeviceSignal(deviceId);
        const deviceValvePosition = await client.getDeviceValvePosition(deviceId);
        const deviceTemperatureOffset = await client.getDeviceTemperatureOffset(deviceId);
        const deviceChildLockEnabled = await client.getDeviceChildLock(deviceId);

        if (zoneTemperature != null) {
            this.log(`→ temperature: ${zoneTemperature.value}${zoneTemperature.unitOfMeasure}`);

            this.setCapabilityValue('measure_temperature', zoneTemperature.value).catch(this.error);
        }

        if (zoneTargetTemperature != null) {
            this.log(`→ target temperature: ${zoneTargetTemperature.value}${zoneTargetTemperature.unitOfMeasure}`);

            this.setCapabilityValue('target_temperature', zoneTargetTemperature.value).catch(this.error);
        }

        if (batteryStatus != null) {
            this.log(`→ battery status: ${batteryStatus.value}`);

            this.setCapabilityValue('alarm_battery', batteryStatus.value.toLowerCase() !== 'ok').catch(this.error);
        }

        if (deviceSignal != null) {
            this.log(`→ signal strength: ${deviceSignal.value}${deviceSignal.unitOfMeasure}`);

            this.setCapabilityValue('ec_measure_valve_signal_strength', deviceSignal.value).catch(this.error);
        }

        if (deviceValvePosition != null) {
            this.log(`→ valve position: ${deviceValvePosition.value}${deviceValvePosition.unitOfMeasure}`);

            this.setCapabilityValue('ec_valve_position', deviceValvePosition.value).catch(this.error);
        }

        if (deviceTemperatureOffset != null) {
            this.log(`→ temperature offset: ${deviceTemperatureOffset.value}${deviceTemperatureOffset.unitOfMeasure}`);

            this.setCapabilityValue('ec_temperature_offset', deviceTemperatureOffset.value).catch(this.error);
        }

        if (deviceChildLockEnabled != null) {
            this.log(`→ child lock status: ${deviceChildLockEnabled.value}`);

            const value: unknown = deviceChildLockEnabled.value;

            if (typeof value === 'boolean') {
                this.setCapabilityValue('ec_child_lock', value).catch(this.error);
            } else if (typeof value === 'string') {
                this.setCapabilityValue('ec_child_lock', value.toLowerCase() === 'true').catch(this.error);
            } else {
                this.log(`! unexpected child lock status type: ${typeof value}, value: ${value}`);
            }
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

        return settings;
    }
}
