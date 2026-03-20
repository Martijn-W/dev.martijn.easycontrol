import Homey from 'homey';
import { Client, thermostatManager, ValueResponse } from '../../bosch';
import EtrvDevice from '../etrv/device';
import BaseDeviceSettings from './baseDeviceSettings';
import ConnectionSettings from '../../bosch/models/settings/connectionSettings';
import ApiFailureThresholdError from './apiFailureThresholdError';

const nameof = <T>(name: keyof T) => name;

export abstract class Ct200BaseDevice<TClient extends Client> extends Homey.Device {
    protected client: TClient = this.getNewClient();
    protected connectedValves: EtrvDevice[] = [];
    protected settings: BaseDeviceSettings | null = null;
    protected abstract unsupportedCapabilities: string[];

    #shouldSync: boolean = true;
    #isSyncing: boolean = false;
    #timeout: NodeJS.Timeout | null = null;
    #apiFailureThreshold: number = 2;
    #apiRetryDelaySeconds: number = 60;
    #isUnavailableDueToApiFailures: boolean = false;
    #failedApiCallsInSync: number = 0;

    protected abstract getNewClient(): TClient;

    protected abstract getDeviceSettings(): BaseDeviceSettings;

    protected abstract getConnectionSettings(): ConnectionSettings;

    async onInit(): Promise<void> {
        this.settings = this.getDeviceSettings();

        await this.client.connect(this.getConnectionSettings());

        thermostatManager.addThermostat(this.settings!.serialNumber, this);

        await this.#registerCapabilities();

        this.log('EasyControl device has been initialized');

        this.#shouldSync = true;

        await this.#sync();
    }

    async onSettings(event: {
        oldSettings: { [key: string]: boolean | string | number | undefined | null },
        newSettings: { [key: string]: boolean | string | number | undefined | null },
        changedKeys: string[]
    }): Promise<string | void> {
        this.log('EasyControl settings where changed');

        if (event.changedKeys.includes(nameof<BaseDeviceSettings>('pollingInterval'))) {
            const newInterval = event.newSettings[nameof<BaseDeviceSettings>('pollingInterval')] as number || null;

            this.log(`Polling interval changed, resetting timeout to: ${newInterval}s`);

            this.#timeout && clearTimeout(this.#timeout);
            this.#scheduleNextSync(newInterval);
        }
    }

    async onDeleted(): Promise<void> {
        thermostatManager.removeThermostat(this.settings!.serialNumber);

        await this.#reset();

        this.log('EasyControl device has been deleted');
    }

    registerValve(device: EtrvDevice): void {
        this.connectedValves.push(device);
    }

    removeValve(device: EtrvDevice): void {
        this.connectedValves = this.connectedValves.filter(valve => valve !== device);
    }

    getClient(): Client {
        return this.client;
    }

    async #onSetTargetTemperature(value: any): Promise<void> {
        this.log(`Setting target temperature: ${value}C`);

        const response = await this.client.setZoneTargetTemperature(this.settings!.zoneId, value);

        if (response?.status !== 'ok') {
            this.error(`Failed to set target temperature: ${response?.status}`);
        }
    }

    async onSetTemperatureOffset(value: number): Promise<void> {
        if (value < -2 || value > 2 || value % .5 !== 0) {
            throw new Error('Temperature offset must be between -2 and 2 with a step value of .5');
        }

        this.log(`Setting temperature offset: ${value}`);

        const response = await this.client.setSystemTemperatureOffset(value);

        if (response?.status !== 'ok') {
            throw new Error(`Failed to set temperature offset: ${response?.status}`);
        }

        this.setCapabilityValue('ec_temperature_offset', value).catch(this.error);
    }

    async onSetChildLock(value: boolean): Promise<void> {
        this.log(`Setting child lock status: ${value}`);

        const response = await this.client.setDeviceThermostatChildLock(this.getData().id, value);

        if (response?.status !== 'ok') {
            throw new Error(`Failed to set child lock status: ${response?.status}`);
        }

        this.setCapabilityValue('ec_child_lock', value).catch(this.error);
    }

    async onSetAwayMode(value: boolean): Promise<void> {
        this.log(`Setting away mode status: ${value}`);

        const response = await this.client.setSystemAwayModeEnabled(value);

        if (response?.status !== 'ok') {
            throw new Error(this.homey.__('easycontrol.awayMode.error'));
        }

        this.setCapabilityValue('ec_away_mode', value).catch(this.error);
    }

    requestSync(): void {
        this.#scheduleNextSync(0);
    }

    async #reset() {
        this.#shouldSync = false;
        this.#timeout && clearTimeout(this.#timeout);
        await this.client.disconnect();
    }

    async #sync() {
        if (!this.#shouldSync || this.#isSyncing)
            return;

        this.log('Syncing data...');

        this.settings = this.getSettings() as BaseDeviceSettings;
        this.#isSyncing = true;
        let nextSyncInSeconds = this.settings?.pollingInterval ?? 30;

        try {
            await this.#setThermostatData();

            if (this.#isUnavailableDueToApiFailures) {
                await this.setAvailable().catch(this.error);
                await this.#setValvesAvailable();
                this.#isUnavailableDueToApiFailures = false;
            }

            this.log('Data synced');
        } catch (error) {
            if (error instanceof ApiFailureThresholdError) {
                this.error(`Reached API failure threshold (${error.failedCalls}), setting device unavailable and retrying later`);

                if (!this.#isUnavailableDueToApiFailures) {
                    await this.setUnavailable('Temporary API communication issue. Retrying shortly.').catch(this.error);
                    await this.#setValvesUnavailable('Temporary API communication issue. Retrying shortly.');
                    this.#isUnavailableDueToApiFailures = true;
                }

                nextSyncInSeconds = this.#apiRetryDelaySeconds;
            } else {
                this.error('Failed to sync data', error);
            }
        } finally {
            this.#isSyncing = false;

            this.#scheduleNextSync(nextSyncInSeconds);
        }
    }

    async #setValvesUnavailable(message: string): Promise<void> {
        for (const valve of this.connectedValves) {
            await valve.setUnavailable(message).catch(error => {
                this.error(`Failed to set valve '${valve.getName()}' unavailable`, error);
            });
        }
    }

    async #setValvesAvailable(): Promise<void> {
        for (const valve of this.connectedValves) {
            await valve.setAvailable().catch(error => {
                this.error(`Failed to set valve '${valve.getName()}' available`, error);
            });
        }
    }

    #scheduleNextSync(intervalSeconds: number | null) {
        const nextIntervalMs = (intervalSeconds ?? 30) * 1000;

        this.log(`Next sync in: ${nextIntervalMs}ms`);

        this.#timeout = setTimeout(
            async () => await this.#sync(),
            nextIntervalMs
        );
    }

    async #registerCapabilities(): Promise<void> {
        const capabilities: string[] = [
            'ec_measure_return_temperature',
            'ec_measure_actual_modulation',
            'ec_child_lock',
            'ec_measure_outside_temperature',
            'ec_temperature_offset',
            'ec_supply_temperature_setpoint',
            'ec_away_mode'
        ];

        for (let capability of capabilities) {
            if (!this.unsupportedCapabilities.includes(capability) && !this.hasCapability(capability)) {
                await this.addCapability(capability);
            }
        }

        this.registerCapabilityListener('target_temperature', this.#onSetTargetTemperature.bind(this));
        this.registerCapabilityListener('ec_child_lock', this.onSetChildLock.bind(this));
        this.registerCapabilityListener('ec_away_mode', this.onSetAwayMode.bind(this));
    }

    async #setThermostatData(): Promise<void> {
        const zoneId = this.settings!.zoneId;
        this.#failedApiCallsInSync = 0;

        const zoneTemperature = await this.#fetchWithFailureTracking('getZoneTemperature', async () => await this.client.getZoneTemperature(zoneId));
        const zoneTargetTemperature = await this.#fetchWithFailureTracking('getZoneTargetTemperature', async () => await this.client.getZoneTargetTemperature(zoneId));
        const SystemSensorHumidity = await this.#fetchWithFailureTracking('getSystemSensorHumidity', async () => await this.client.getSystemSensorHumidity());
        const systemPressure = await this.#fetchWithFailureTracking('getApplianceSystemPressure', async () => await this.client.getApplianceSystemPressure());
        const wifiSignalStrength = await this.#fetchWithFailureTracking('getWifiSignalStrength', async () => await this.client.getWifiSignalStrength());

        const returnTemperature: ValueResponse<number> | null = !this.unsupportedCapabilities.includes('ec_measure_return_temperature')
            ? await this.#fetchWithFailureTracking('getHeatSourcesReturnTemperature', async () => await this.client.getHeatSourcesReturnTemperature())
            : null;

        const actualModulation = await this.#fetchWithFailureTracking('getHeatSourcesActualModulation', async () => await this.client.getHeatSourcesActualModulation());
        const deviceThermostatChildLockEnabled = await this.#fetchWithFailureTracking('getDeviceThermostatChildLock', async () => await this.client.getDeviceThermostatChildLock(this.getData().id));
        const outsideTemperature = await this.#fetchWithFailureTracking('getOutsideTemperature', async () => await this.client.getOutsideTemperature());
        const systemTemperatureOffset = await this.#fetchWithFailureTracking('getSystemTemperatureOffset', async () => await this.client.getSystemTemperatureOffset());
        const supplyTemperatureSetpoint = await this.#fetchWithFailureTracking('getHeatingCircuitSupplyTemperatureSetpoint', async () => await this.client.getHeatingCircuitSupplyTemperatureSetpoint());
        const systemAwayModeEnabled = await this.#fetchWithFailureTracking('getSystemAwayModeEnabled', async () => await this.client.getSystemAwayModeEnabled());

        if (zoneTemperature != null) {
            this.log(`→ temperature: ${zoneTemperature.value}${zoneTemperature.unitOfMeasure}`);

            this.setCapabilityValue('measure_temperature', zoneTemperature.value).catch(this.error);
        }

        if (zoneTargetTemperature != null) {
            this.log(`→ target temperature: ${zoneTargetTemperature.value}${zoneTargetTemperature.unitOfMeasure}`);

            this.setCapabilityValue('target_temperature', zoneTargetTemperature.value).catch(this.error);
        }

        if (SystemSensorHumidity != null) {
            this.log(`→ humidity: ${SystemSensorHumidity.value}${SystemSensorHumidity.unitOfMeasure}`);

            this.setCapabilityValue('measure_humidity', SystemSensorHumidity.value).catch(this.error);
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

        if (supplyTemperatureSetpoint != null) {
            this.log(`→ supply temperature setpoint: ${supplyTemperatureSetpoint.value}${supplyTemperatureSetpoint.unitOfMeasure}`);

            this.setCapabilityValue('ec_supply_temperature_setpoint', supplyTemperatureSetpoint.value).catch(this.error);
        }

        if (systemAwayModeEnabled != null) {
            this.log(`→ away mode status: ${systemAwayModeEnabled.value}`);

            const value: unknown = systemAwayModeEnabled.value;

            if (typeof value === 'boolean') {
                this.setCapabilityValue('ec_away_mode', value).catch(this.error);
            } else if (typeof value === 'string') {
                this.setCapabilityValue('ec_away_mode', value.toLowerCase() === 'true').catch(this.error);
            } else {
                this.log(`! unexpected away mode status type: ${typeof value}, value: ${value}`);
            }
        }

        // Notify all connected thermostat valves that they need to update. Make sure to wait for each device to finish,
        // that way we don't have to worry about multiple messages conflicting with each other.
        for (const valve of this.connectedValves) {
            try {
                this.log(`Syncing data for valve '${valve.getName()}'...`);
                await valve.setThermostatValveData();
            } catch (e) {
                this.error(`Failed to update thermostat valve data for device '${valve.getName()}'`, e);
            }
        }
    }

    async #fetchWithFailureTracking<T>(name: string, fetcher: () => Promise<T>): Promise<T | null> {
        try {
            return await fetcher();
        } catch (error) {
            this.#failedApiCallsInSync++;
            this.error(`API call failed (${this.#failedApiCallsInSync}/${this.#apiFailureThreshold}): ${name}`, error);

            if (this.#failedApiCallsInSync >= this.#apiFailureThreshold) {
                throw new ApiFailureThresholdError(this.#failedApiCallsInSync);
            }

            return null;
        }
    }
}
