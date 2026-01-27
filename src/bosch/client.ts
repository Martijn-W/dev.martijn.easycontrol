import { EasyControlClient, ConfigBuilder } from 'bosch-xmpp-client';
import { DeviceResponse, Endpoint, PutResponse, ValueResponse, ZoneResponse } from '.';

export class Client {
    private easyControlClient: EasyControlClient | null = null;

    public async connect(serialNumber: number, accessKey: string, password: string): Promise<void> {
        const config = new ConfigBuilder()
            .withSerialNumber(`${serialNumber}`)
            .withAccessKey(accessKey)
            .withPassword(password)
            .build();

        this.easyControlClient = new EasyControlClient(config);

        try {
            await this.easyControlClient.connect();
        } catch (e) {
            console.log(`Failed to connect to the XMPP Client: ${e}`);
        }
    }

    public async disconnect(): Promise<void> {
        if (this.easyControlClient === null)
            return;

        await this.easyControlClient.disconnect();
    }

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
            return await this.easyControlClient.put(endpoint, {'value': value});
        } catch (ex) {
            this.parseError(ex as Error);

            return null;
        }
    }

    private parseError(error: Error) {
        if (error.message === 'HTTP_TOO_MANY_REQUESTS') {
            console.warn('Spawning too many requests!');
        } else {
            console.error((error.stack || error) as string);
        }
    }
}
