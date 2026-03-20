import { Client } from './client';
import { HttpConfigBuilder, HttpEasyControlClient } from 'bosch-xmpp-client';
import HttpConnectionSettings from './models/settings/httpConnectionSettings';
import { TokenCache } from 'bosch-xmpp-client/dist/types';

export class HttpClient extends Client {
    protected easyControlClient: HttpEasyControlClient | null = null;
    private tokenUpdatedListener: ((newToken: TokenCache) => void) | null = null;
    private tokenUpdatedCallback: ((newToken: TokenCache) => void) | null = null;

    public onTokenUpdated(callback: ((newToken: TokenCache) => void) | null): void {
        this.tokenUpdatedCallback = callback;
    }

    public connect(connectionSettings: HttpConnectionSettings): Promise<void> {
        const config = new HttpConfigBuilder()
            .withGatewayId(`${connectionSettings.serialNumber}`)
            .withToken({
                accessToken: connectionSettings.accessToken,
                refreshToken: connectionSettings.refreshToken,
                expiresAtUtc: connectionSettings.expiresAtUtc
            })
            .build();

        this.easyControlClient = new HttpEasyControlClient(config);
        this.tokenUpdatedListener = (newToken: TokenCache) => {
            console.log('Got new API token');
            this.tokenUpdatedCallback?.(newToken);
        };

        this.easyControlClient.on('tokenUpdated', this.tokenUpdatedListener);

        return Promise.resolve();
    }

    public disconnect(): Promise<void> {
        if (this.easyControlClient !== null && this.tokenUpdatedListener !== null) {
            this.easyControlClient.off('tokenUpdated', this.tokenUpdatedListener);
        }

        this.tokenUpdatedListener = null;
        this.easyControlClient = null;

        return Promise.resolve();
    }
}
