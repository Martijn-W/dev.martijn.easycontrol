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

    public async getZoneTemperature(zoneId: number): Promise<ValueResponse | null> {
        const endpoint = Endpoint.ZoneTemperature.replace('%1', `${zoneId}`);

        const response = await this.get(endpoint);

        return response as ValueResponse;
    }

    public async getZoneTargetTemperature(zoneId: number): Promise<ValueResponse | null> {
        const endpoint = Endpoint.ZoneTargetTemperature.replace('%1', `${zoneId}`);

        const response = await this.get(endpoint);

        return response as ValueResponse;
    }

    public async setZoneTargetTemperature(zoneId: number, temperature: number): Promise<PutResponse | null> {
        const endpoint = Endpoint.ZoneManualTemperatureHeating.replace('%1', `${zoneId}`);

        const response = await this.set(endpoint, temperature);

        return response as PutResponse;
    }

    public async getZoneHumidity(zoneId: number): Promise<ValueResponse | null> {
        const endpoint = Endpoint.ZoneHumidity.replace('%1', `${zoneId}`);

        const response = await this.get(endpoint);

        return response as ValueResponse;
    }

    public async getApplianceSystemPressure(): Promise<ValueResponse | null> {
        const response = await this.get(Endpoint.ApplianceSystemPressure);

        return response as ValueResponse;
    }

    public async getWifiSignalStrength(): Promise<ValueResponse | null> {
        const response = await this.get(Endpoint.GatewayWifiRssi);

        return response as ValueResponse;
    }

    public async getHeatSourcesReturnTemperature(): Promise<ValueResponse | null> {
        const response = await this.get(Endpoint.HeatSourcesReturnTemperature);

        return response as ValueResponse;
    }

    public async getHeatSourcesActualModulation(): Promise<ValueResponse | null> {
        const response = await this.get(Endpoint.HeatSourcesActualModulation);

        return response as ValueResponse;
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
