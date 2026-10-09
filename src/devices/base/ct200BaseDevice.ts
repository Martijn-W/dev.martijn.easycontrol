import Homey from 'homey';
import { Client, thermostatManager, ValueResponse } from '../../bosch';
import { ProgramResponse } from '../../bosch/models/responses/programResponse';
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

    #lastKnownPrograms: string = '';
    #lastKnownProgramValues: Array<{ id: string, title: { en: string, nl: string } }> | null = null;
    #currentThermostatModeToken: Homey.FlowToken | null = null;

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

        if (!this.unsupportedCapabilities.includes('ec_thermostat_mode')) {
            const currentMode = this.getCapabilityValue('ec_thermostat_mode') as string | null;

            this.#currentThermostatModeToken = await this.homey.flow.createToken(
                `ec_current_thermostat_mode_${this.driver.id}_${this.settings!.serialNumber}`,
                {
                    type: 'string',
                    title: `${this.getName()} - ${this.homey.__('easycontrol.currentThermostatModeToken.title')}`,
                    value: currentMode ? this.#resolveModeName(currentMode) : ''
                }
            );
        }

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

        await this.#currentThermostatModeToken?.unregister();
        await this.#reset();

        this.log('EasyControl device has been deleted');
    }

    async registerValve(device: EtrvDevice): Promise<void> {
        this.connectedValves.push(device);

        if (!this.#lastKnownProgramValues) {
            const programs = await this.client.getClockPrograms();

            if (programs)
                await this.#syncThermostatModeOptions(programs.value);
        } else {
            await device.setCapabilityOptions('ec_thermostat_mode', {values: this.#lastKnownProgramValues}).catch(this.error);
        }
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

    async onSetThermostatMode(value: string): Promise<void> {
        this.log(`Setting thermostat mode: ${value}`);

        if (value === 'manual') {
            const response = await this.client.setZoneUserMode(this.settings!.zoneId, 'manual');

            if (response?.status !== 'ok') {
                throw new Error(this.homey.__('easycontrol.thermostatMode.error'));
            }
        } else {
            const programNumber = parseInt(value, 10);

            const userModeResponse = await this.client.setZoneUserMode(this.settings!.zoneId, 'clock');
            const clockProgramResponse = await this.client.setZoneClockProgram(this.settings!.zoneId, programNumber);

            if (userModeResponse?.status !== 'ok' || clockProgramResponse?.status !== 'ok') {
                throw new Error(this.homey.__('easycontrol.thermostatMode.error'));
            }
        }

        this.setCapabilityValue('ec_thermostat_mode', value).catch(this.error);
        this.#currentThermostatModeToken?.setValue(this.#resolveModeName(value)).catch(this.error);
    }

    async onSetMinSupplyTemperature(value: number): Promise<void> {
        await this.#setSupplySetting(
            'ec_min_supply_temperature',
            'minimum supply temperature',
            value,
            async () => await this.client.getHeatingCircuitMinSupply(),
            async () => await this.client.setHeatingCircuitMinSupply(value)
        );
    }

    async onSetMaxSupplyTemperature(value: number): Promise<void> {
        await this.#setSupplySetting(
            'ec_max_supply_temperature',
            'maximum supply temperature',
            value,
            async () => await this.client.getHeatingCircuitMaxSupply(),
            async () => await this.client.setHeatingCircuitMaxSupply(value)
        );
    }

    async onSetHeatCurveMin(value: number): Promise<void> {
        await this.#setSupplySetting(
            'ec_heat_curve_min',
            'heating curve minimum',
            value,
            async () => await this.client.getHeatingCircuitHeatCurveMin(),
            async () => await this.client.setHeatingCircuitHeatCurveMin(value)
        );
    }

    async onSetHeatCurveMax(value: number): Promise<void> {
        await this.#setSupplySetting(
            'ec_heat_curve_max',
            'heating curve maximum',
            value,
            async () => await this.client.getHeatingCircuitHeatCurveMax(),
            async () => await this.client.setHeatingCircuitHeatCurveMax(value)
        );
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
            'ec_away_mode',
            'ec_thermostat_mode',
            'ec_measure_ch_pump_modulation',
            'ec_measure_actual_supply_temperature',
            'ec_measure_power_setpoint',
            'ec_min_supply_temperature',
            'ec_max_supply_temperature',
            'ec_heat_curve_min',
            'ec_heat_curve_max'
        ];

        for (let capability of capabilities) {
            if (!this.unsupportedCapabilities.includes(capability) && !this.hasCapability(capability)) {
                await this.addCapability(capability);
            }
        }

        if (!this.unsupportedCapabilities.includes('ec_thermostat_mode')) {
            const programs = await this.client.getClockPrograms();

            if (programs)
                await this.#syncThermostatModeOptions(programs.value);
        }

        this.registerCapabilityListener('target_temperature', this.#onSetTargetTemperature.bind(this));
        this.registerCapabilityListener('ec_child_lock', this.onSetChildLock.bind(this));
        this.registerCapabilityListener('ec_away_mode', this.onSetAwayMode.bind(this));
        this.registerCapabilityListener('ec_thermostat_mode', this.onSetThermostatMode.bind(this));

        if (!this.unsupportedCapabilities.includes('ec_min_supply_temperature') && this.hasCapability('ec_min_supply_temperature'))
            this.registerCapabilityListener('ec_min_supply_temperature', this.onSetMinSupplyTemperature.bind(this));

        if (!this.unsupportedCapabilities.includes('ec_max_supply_temperature') && this.hasCapability('ec_max_supply_temperature'))
            this.registerCapabilityListener('ec_max_supply_temperature', this.onSetMaxSupplyTemperature.bind(this));

        if (!this.unsupportedCapabilities.includes('ec_heat_curve_min') && this.hasCapability('ec_heat_curve_min'))
            this.registerCapabilityListener('ec_heat_curve_min', this.onSetHeatCurveMin.bind(this));

        if (!this.unsupportedCapabilities.includes('ec_heat_curve_max') && this.hasCapability('ec_heat_curve_max'))
            this.registerCapabilityListener('ec_heat_curve_max', this.onSetHeatCurveMax.bind(this));
    }

    #resolveModeName(modeValue: string): string {
        const currentMode = this.#lastKnownProgramValues?.find(v => v.id === modeValue);

        return currentMode?.title.nl ?? currentMode?.title.en ?? modeValue;
    }

    async #syncThermostatModeOptions(programs: ProgramResponse[]): Promise<void> {
        const hash = JSON.stringify(programs);

        if (hash === this.#lastKnownPrograms)
            return;

        this.#lastKnownPrograms = hash;

        const values = [
            {id: 'manual', title: {en: 'Manual', nl: 'Manueel'}},
            ...programs.map(p => ({
                id: String(p.id),
                title: {en: atob(p.name), nl: atob(p.name)}
            }))
        ];

        this.#lastKnownProgramValues = values;

        await this.setCapabilityOptions('ec_thermostat_mode', {values});

        for (const valve of this.connectedValves) {
            await valve.setCapabilityOptions('ec_thermostat_mode', {values}).catch(this.error);
        }
    }

    async #setSupplySetting(
        capability: string,
        name: string,
        value: number,
        fetcher: () => Promise<ValueResponse<number> | null>,
        setter: () => Promise<{ status?: string } | null>
    ): Promise<void> {
        if (this.unsupportedCapabilities.includes(capability) || !this.hasCapability(capability)) {
            throw new Error(this.homey.__('easycontrol.supplySettings.unavailable'));
        }

        if (typeof value !== 'number' || !Number.isFinite(value)) {
            throw new Error(this.homey.__('easycontrol.supplySettings.invalidValue'));
        }

        const current = await fetcher();

        if (!this.#isUsableResponse(current)) {
            throw new Error(this.homey.__('easycontrol.supplySettings.unavailable'));
        }

        if (current.writeable !== 1) {
            throw new Error(this.homey.__('easycontrol.supplySettings.notWritable'));
        }

        const {minValue, maxValue, stepSize} = current;

        if (!Number.isFinite(minValue) || !Number.isFinite(maxValue) || minValue > maxValue) {
            throw new Error(this.homey.__('easycontrol.supplySettings.unavailable'));
        }

        if (value < minValue || value > maxValue) {
            throw new Error(this.homey.__('easycontrol.supplySettings.outOfRange', {min: minValue, max: maxValue}));
        }

        if (stepSize !== undefined && stepSize !== null) {
            if (typeof stepSize !== 'number' || !Number.isFinite(stepSize) || stepSize <= 0) {
                throw new Error(this.homey.__('easycontrol.supplySettings.invalidStep'));
            }

            const steps = (value - minValue) / stepSize;

            if (Math.abs(steps - Math.round(steps)) > 1e-6) {
                throw new Error(this.homey.__('easycontrol.supplySettings.invalidStep'));
            }
        }

        this.log(`Setting ${name}: ${value}`);

        const response = await setter();

        if (response?.status !== 'ok') {
            throw new Error(this.homey.__('easycontrol.supplySettings.writeFailed'));
        }

        this.setCapabilityValue(capability, value).catch(this.error);
    }

    #isUsableResponse(response: ValueResponse<number> | null): response is ValueResponse<number> {
        if (response == null || typeof response.value !== 'number' || !Number.isFinite(response.value))
            return false;

        if (`${response.used}`.toLowerCase() === 'false')
            return false;

        return `${response.available}`.toLowerCase() !== 'false';
    }

    async #syncSupplySetting(capability: string, name: string, response: ValueResponse<number> | null): Promise<void> {
        if (!this.#isUsableResponse(response)) {
            if (response != null)
                this.log(`! ${name} is unavailable or invalid, skipping update`);

            return;
        }

        this.log(`→ ${name}: ${response.value}${response.unitOfMeasure}`);

        this.setCapabilityValue(capability, response.value).catch(this.error);

        const options: { min?: number, max?: number, step?: number } = {};

        if (Number.isFinite(response.minValue))
            options.min = response.minValue;

        if (Number.isFinite(response.maxValue))
            options.max = response.maxValue;

        if (Number.isFinite(response.stepSize) && response.stepSize > 0)
            options.step = response.stepSize;

        if (options.min !== undefined && options.max !== undefined && options.min > options.max)
            return;

        const currentOptions = this.getCapabilityOptions(capability) as { min?: number, max?: number, step?: number };

        if (Object.entries(options).every(([key, optionValue]) => currentOptions[key as keyof typeof options] === optionValue))
            return;

        await this.setCapabilityOptions(capability, {...currentOptions, ...options}).catch(this.error);
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
        const zoneUserMode = await this.#fetchWithFailureTracking('getZoneUserMode', async () => await this.client.getZoneUserMode(zoneId));
        const zoneClockProgram = await this.#fetchWithFailureTracking('getZoneClockProgram', async () => await this.client.getZoneClockProgram(zoneId));
        const clockPrograms = await this.client.getClockPrograms().catch(() => null);

        const chPumpModulation: ValueResponse<number> | null = !this.unsupportedCapabilities.includes('ec_measure_ch_pump_modulation')
            ? await this.#fetchWithFailureTracking('getHeatSourcesCHpumpModulation', async () => await this.client.getHeatSourcesCHpumpModulation())
            : null;
        const actualSupplyTemperature: ValueResponse<number> | null = !this.unsupportedCapabilities.includes('ec_measure_actual_supply_temperature')
            ? await this.#fetchWithFailureTracking('getHeatSourcesActualSupplyTemperature', async () => await this.client.getHeatSourcesActualSupplyTemperature())
            : null;
        const powerSetpoint: ValueResponse<number> | null = !this.unsupportedCapabilities.includes('ec_measure_power_setpoint')
            ? await this.#fetchWithFailureTracking('getHeatingCircuitPowerSetpoint', async () => await this.client.getHeatingCircuitPowerSetpoint())
            : null;
        const minSupply: ValueResponse<number> | null = !this.unsupportedCapabilities.includes('ec_min_supply_temperature')
            ? await this.#fetchWithFailureTracking('getHeatingCircuitMinSupply', async () => await this.client.getHeatingCircuitMinSupply())
            : null;
        const maxSupply: ValueResponse<number> | null = !this.unsupportedCapabilities.includes('ec_max_supply_temperature')
            ? await this.#fetchWithFailureTracking('getHeatingCircuitMaxSupply', async () => await this.client.getHeatingCircuitMaxSupply())
            : null;
        const heatCurveMin: ValueResponse<number> | null = !this.unsupportedCapabilities.includes('ec_heat_curve_min')
            ? await this.#fetchWithFailureTracking('getHeatingCircuitHeatCurveMin', async () => await this.client.getHeatingCircuitHeatCurveMin())
            : null;
        const heatCurveMax: ValueResponse<number> | null = !this.unsupportedCapabilities.includes('ec_heat_curve_max')
            ? await this.#fetchWithFailureTracking('getHeatingCircuitHeatCurveMax', async () => await this.client.getHeatingCircuitHeatCurveMax())
            : null;

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

        if (this.#isUsableResponse(chPumpModulation)) {
            this.log(`→ CH pump modulation: ${chPumpModulation.value}${chPumpModulation.unitOfMeasure}`);

            this.setCapabilityValue('ec_measure_ch_pump_modulation', chPumpModulation.value).catch(this.error);
        }

        if (this.#isUsableResponse(actualSupplyTemperature)) {
            this.log(`→ actual supply temperature: ${actualSupplyTemperature.value}${actualSupplyTemperature.unitOfMeasure}`);

            this.setCapabilityValue('ec_measure_actual_supply_temperature', actualSupplyTemperature.value).catch(this.error);
        }

        if (this.#isUsableResponse(powerSetpoint)) {
            this.log(`→ power setpoint: ${powerSetpoint.value}${powerSetpoint.unitOfMeasure}`);

            this.setCapabilityValue('ec_measure_power_setpoint', powerSetpoint.value).catch(this.error);
        }

        await this.#syncSupplySetting('ec_min_supply_temperature', 'minimum supply temperature', minSupply);
        await this.#syncSupplySetting('ec_max_supply_temperature', 'maximum supply temperature', maxSupply);
        await this.#syncSupplySetting('ec_heat_curve_min', 'heating curve minimum', heatCurveMin);
        await this.#syncSupplySetting('ec_heat_curve_max', 'heating curve maximum', heatCurveMax);

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

        if (clockPrograms)
            await this.#syncThermostatModeOptions(clockPrograms.value);

        if (zoneUserMode != null) {
            const modeValue = zoneUserMode.value === 'manual'
                ? 'manual'
                : String(Math.round(zoneClockProgram?.value ?? 0));

            this.log(`→ thermostat mode: ${zoneUserMode.value}, program: ${zoneClockProgram?.value}`);

            this.setCapabilityValue('ec_thermostat_mode', modeValue).catch(this.error);
            this.#currentThermostatModeToken?.setValue(this.#resolveModeName(modeValue)).catch(this.error);
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
