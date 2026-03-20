import BaseDeviceSettings from '../base/baseDeviceSettings';
import { Ct200BaseDevice } from '../base/ct200BaseDevice';
import { HttpClient } from '../../bosch/httpClient';
import HttpConnectionSettings from '../../bosch/models/settings/httpConnectionSettings';
import DeviceSettings from './deviceSettings';
import { TokenCache } from 'bosch-xmpp-client/dist/types';

export default class Ct200HttpsDevice extends Ct200BaseDevice<HttpClient> {
    protected unsupportedCapabilities: string[] = ['ec_measure_return_temperature'];

    async onInit(): Promise<void> {
        this.client.onTokenUpdated((newToken: TokenCache) => {
            this.persistTokenSettings(newToken).catch(err => {
                this.error('Failed to store updated API token', err);
            });
        });

        await super.onInit();
    }

    protected getNewClient(): HttpClient {
        return new HttpClient();
    }

    protected getDeviceSettings(): BaseDeviceSettings {
        return this.fixSettings(this.getSettings() as DeviceSettings);
    }

    protected getConnectionSettings(): HttpConnectionSettings {
        return {
            serialNumber: this.settings!.serialNumber,
            accessToken: (<DeviceSettings>this.settings).accessToken,
            refreshToken: (<DeviceSettings>this.settings).refreshToken,
            expiresAtUtc: (<DeviceSettings>this.settings).expiresAtUtc
        };
    }

    public async recreateEasyControlClient(): Promise<void> {
        this.log('Recreating HTTP client with latest connection settings');

        await this.client.disconnect();
        await this.client.connect(this.getConnectionSettings());
    }

    public async persistTokenSettings(newToken: TokenCache): Promise<void> {
        this.log('Received updated API token, storing it in device settings');

        const currentSettings = this.settings as DeviceSettings | null;
        const refreshToken = newToken.refreshToken ?? currentSettings?.refreshToken;

        if (!refreshToken) {
            this.error('Token update did not include a refresh token, skipping settings update');
            return;
        }

        const updatedSettings: Pick<DeviceSettings, 'accessToken' | 'refreshToken' | 'expiresAtUtc'> = {
            accessToken: newToken.accessToken,
            refreshToken: refreshToken,
            expiresAtUtc: newToken.expiresAtUtc
        };

        await this.setSettings(updatedSettings);

        const mergedSettings = {
            ...(currentSettings ?? {}),
            ...updatedSettings
        } as DeviceSettings;

        this.settings = this.fixSettings(mergedSettings);
    }

    /**
     * Fixes the data types of the settings object.
     * @param settings
     * @private
     */
    private fixSettings(settings: DeviceSettings): DeviceSettings {
        return {
            ...settings,
            serialNumber: parseInt(settings.serialNumber as unknown as string),
            zoneId: parseInt(settings.zoneId as unknown as string),
            pollingInterval: parseInt(settings.pollingInterval as unknown as string),
            accessToken: settings.accessToken as unknown as string,
            refreshToken: settings.refreshToken as unknown as string,
            expiresAtUtc: new Date(settings.expiresAtUtc)
        };
    }
}
