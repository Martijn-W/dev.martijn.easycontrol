// @ts-ignore
import { EasyControlClient } from 'bosch-xmpp';
import { Endpoint, ZoneResponse } from '.';
import { ValueResponse } from './models/responses/valueResponse';
import { DeviceResponse } from './models/responses/deviceResponse';

export class Client {
    private XMPP_CLIENT: EasyControlClient | null = null;

    public async connect(serialNumber: number, accessKey: string, password: string): Promise<void> {
        this.XMPP_CLIENT = EasyControlClient({
            serialNumber: serialNumber,
            accessKey: accessKey,
            password: password
        });

        await this.XMPP_CLIENT.connect()
            .catch((e: Error) => {
                console.log(`Failed to connect to the XMPP Client: ${e}`);
            });
    }

    public disconnect(): void {
        if (this.XMPP_CLIENT === null)
            return;

        this.XMPP_CLIENT.end();
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

    public async getZoneHumidity(zoneId: number): Promise<ValueResponse | null> {
        const endpoint = Endpoint.ZoneHumidity.replace('%1', `${zoneId}`);

        const response = await this.get(endpoint);

        return response as ValueResponse;
    }

    public async getApplianceSystemPressure(): Promise<ValueResponse | null> {
        const response = await this.get(Endpoint.ApplianceSystemPressure);

        return response as ValueResponse;
    }

    private async get(endpoint: string): Promise<{} | null> {
        if (this.XMPP_CLIENT === null) {
            return null;
        }

        try {
            return await this.XMPP_CLIENT.get(endpoint);
        } catch (ex) {
            this.parseError(ex as Error);

            return null;
        }
    }

    public async set(endpoint: Endpoint, value: string): Promise<{} | null> {
        try {
            return await this.XMPP_CLIENT.put(endpoint, `{"value": ${value}}`);
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
