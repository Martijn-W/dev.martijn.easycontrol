import { DeviceResponse, Endpoint, PutResponse, ValueResponse, ZoneResponse } from '.';
import { IEasyControlClient } from 'bosch-xmpp-client/dist/types';
import ConnectionSettings from './models/settings/connectionSettings';

export abstract class Client {
    protected abstract easyControlClient: IEasyControlClient | null;

    public abstract connect(connectionSettings: ConnectionSettings): Promise<void>;

    public abstract disconnect(): Promise<void>;

    public async getDevices(): Promise<DeviceResponse[] | null> {
        const response = await this.get(Endpoint.Devices);

        if (response !== null && 'value' in response)
            return response.value as DeviceResponse[];

        return null;
    }

    public async getZones(): Promise<ZoneResponse[] | null> {
        const response = await this.get(Endpoint.Zones);

        if (response !== null && 'value' in response)
            return response.value as ZoneResponse[];

        return null;
    }

    public async getZoneTemperature(zoneId: number): Promise<ValueResponse<number> | null> {
        const endpoint = Endpoint.ZoneTemperature.replace('%1', `${zoneId}`);

        const response = await this.get(endpoint);

        return response as ValueResponse<number>;
    }

    public async getZoneTargetTemperature(zoneId: number): Promise<ValueResponse<number> | null> {
        const endpoint = Endpoint.ZoneTargetTemperature.replace('%1', `${zoneId}`);

        const response = await this.get(endpoint);

        return response as ValueResponse<number>;
    }

    public async setZoneTargetTemperature(zoneId: number, temperature: number): Promise<PutResponse | null> {
        const endpoint = Endpoint.ZoneManualTemperatureHeating.replace('%1', `${zoneId}`);

        const response = await this.set(endpoint, temperature);

        return response as PutResponse;
    }

    public async getZoneValvePosition(zoneId: number): Promise<ValueResponse<number> | null> {
        const endpoint = Endpoint.ZoneValvePosition.replace('%1', `${zoneId}`);

        const response = await this.get(endpoint);

        return response as ValueResponse<number>;
    }

    /** @deprecated Use system sensor instead */
    public async getZoneHumidity(zoneId: number): Promise<ValueResponse<number> | null> {
        const endpoint = Endpoint.ZoneHumidity.replace('%1', `${zoneId}`);

        const response = await this.get(endpoint);

        return response as ValueResponse<number>;
    }

    public async getApplianceSystemPressure(): Promise<ValueResponse<number> | null> {
        const response = await this.get(Endpoint.ApplianceSystemPressure);

        return response as ValueResponse<number>;
    }

    public async getWifiSignalStrength(): Promise<ValueResponse<number> | null> {
        const response = await this.get(Endpoint.GatewayWifiRssi);

        return response as ValueResponse<number>;
    }

    public async getHeatSourcesReturnTemperature(): Promise<ValueResponse<number> | null> {
        const response = await this.get(Endpoint.HeatSourcesReturnTemperature);

        return response as ValueResponse<number>;
    }

    public async getHeatSourcesActualModulation(): Promise<ValueResponse<number> | null> {
        const response = await this.get(Endpoint.HeatSourcesActualModulation);

        return response as ValueResponse<number>;
    }

    public async getDeviceBattery(deviceId: number): Promise<ValueResponse<string> | null> {
        const endpoint = Endpoint.DeviceBattery.replace('%1', `${deviceId}`);

        const response = await this.get(endpoint);

        return response as ValueResponse<string>;
    }

    public async getDeviceSignal(deviceId: number): Promise<ValueResponse<number> | null> {
        const endpoint = Endpoint.DeviceSignal.replace('%1', `${deviceId}`);

        const response = await this.get(endpoint);

        return response as ValueResponse<number>;
    }

    public async getDeviceValvePosition(deviceId: number): Promise<ValueResponse<number> | null> {
        const endpoint = Endpoint.DeviceValvePosition.replace('%1', `${deviceId}`);

        const response = await this.get(endpoint);

        return response as ValueResponse<number>;
    }

    public async getDeviceTemperatureOffset(deviceId: number): Promise<ValueResponse<number> | null> {
        const endpoint = Endpoint.DeviceTemperatureOffset.replace('%1', `${deviceId}`);

        const response = await this.get(endpoint);

        return response as ValueResponse<number>;
    }

    public async setDeviceTemperatureOffset(deviceId: number, offset: number): Promise<PutResponse | null> {
        const endpoint = Endpoint.DeviceTemperatureOffset.replace('%1', `${deviceId}`);

        const response = await this.set(endpoint, offset);

        return response as PutResponse;
    }

    public async getDeviceChildLock(deviceId: number): Promise<ValueResponse<string> | null> {
        const endpoint = Endpoint.DeviceChildLockEnabled.replace('%1', `${deviceId}`);

        const response = await this.get(endpoint);

        return response as ValueResponse<string>;
    }

    public async setDeviceChildLock(deviceId: number, status: boolean): Promise<PutResponse | null> {
        const endpoint = Endpoint.DeviceChildLockEnabled.replace('%1', `${deviceId}`);

        const response = await this.set(endpoint, status ? 'true' : 'false');

        return response as PutResponse;
    }

    public async getDeviceThermostatChildLock(deviceId: number): Promise<ValueResponse<string> | null> {
        const endpoint = Endpoint.DeviceThermostatChildLockEnabled.replace('%1', `${deviceId}`);

        const response = await this.get(endpoint);

        return response as ValueResponse<string>;
    }

    public async setDeviceThermostatChildLock(deviceId: number, status: boolean): Promise<PutResponse | null> {
        const endpoint = Endpoint.DeviceThermostatChildLockEnabled.replace('%1', `${deviceId}`);

        const response = await this.set(endpoint, status ? 'true' : 'false');

        return response as PutResponse;
    }

    public async getOutsideTemperature(): Promise<ValueResponse<number> | null> {
        const response = await this.get(Endpoint.SystemOutsideTemperature);

        return response as ValueResponse<number>;
    }

    public async getSystemSensorHumidity(): Promise<ValueResponse<number> | null> {
        const response = await this.get(Endpoint.SystemSensorHumidityIndoor);

        return response as ValueResponse<number>;
    }

    public async getSystemTemperatureOffset(): Promise<ValueResponse<number> | null> {
        const response = await this.get(Endpoint.SystemTemperatureOffset);

        return response as ValueResponse<number>;
    }

    public async setSystemTemperatureOffset(offset: number): Promise<PutResponse | null> {
        const response = await this.set(Endpoint.SystemTemperatureOffset, offset);

        return response as PutResponse;
    }

    public async getHeatingCircuitSupplyTemperatureSetpoint(): Promise<ValueResponse<number> | null> {
        const response = await this.get(Endpoint.HeatingCircuitSupplyTemperatureSetpoint.replace('%1', '1'));

        return response as ValueResponse<number>;
    }

    public async getSystemAwayModeEnabled(): Promise<ValueResponse<string> | null> {
        const response = await this.get(Endpoint.SystemAwayModeEnabled);

        return response as ValueResponse<string>;
    }

    public async setSystemAwayModeEnabled(enabled: boolean): Promise<PutResponse | null> {
        const response = await this.set(Endpoint.SystemAwayModeEnabled, enabled ? 'true' : 'false');

        return response as PutResponse;
    }

    private async get(endpoint: string): Promise<{} | null> {
        if (this.easyControlClient === null) {
            return null;
        }

        try {
            return await this.easyControlClient.get(endpoint);
        } catch (ex) {
            this.parseError(ex as Error);

            return null;
        }
    }

    public async set(endpoint: string, value: string | number | {}): Promise<{} | null> {
        if (this.easyControlClient === null) {
            console.error('Unable to set value. Reason: Client is not connected!');

            return null;
        }

        try {
            return await this.easyControlClient.put(endpoint, {'value': value}) || {status: 'ok'};
        } catch (ex) {
            this.parseError(ex as Error);

            return null;
        }
    }

    private parseError(error: Error) {
        if (this.isServerError(error)) {
            throw error;
        }

        if (error.message === 'HTTP_TOO_MANY_REQUESTS') {
            console.warn('Spawning too many requests!');
        } else {
            console.error((error.stack || error) as string);
        }
    }

    private isServerError(error: Error): boolean {
        const statusCode = this.getHttpStatusCode(error);

        if (statusCode !== null) {
            return statusCode >= 500 && statusCode <= 599;
        }

        return /HTTP_(INTERNAL_SERVER_ERROR|BAD_GATEWAY|SERVICE_UNAVAILABLE|GATEWAY_TIMEOUT)/.test(error.message);
    }

    private getHttpStatusCode(error: Error): number | null {
        const message = error.message ?? '';

        // Handles format: "HTTP 500: Internal Server Error"
        const fetchStyleStatusInMessage = message.match(/^HTTP\s+(\d{3})\s*:/i);
        if (fetchStyleStatusInMessage !== null) {
            return parseInt(fetchStyleStatusInMessage[1], 10);
        }

        return null;
    }
}
