import { TokenCache } from 'bosch-xmpp-client/dist/types';
import PairSession from 'homey/lib/PairSession';
import DeviceSettings from './deviceSettings';
import { HttpConfigBuilder, HttpEasyControlClient } from 'bosch-xmpp-client';
import { DeviceResponse, Endpoint } from '../../bosch';
import Ct200BaseDriver from '../base/ct200BaseDriver';
import Ct200HttpsDevice from './device';

export default class Ct200HttpsDriver extends Ct200BaseDriver {
    protected driverName: string = 'HTTPS';

    #tokenCache: TokenCache | null = null;
    #gateways: { id: number | null, deviceId: string, deviceType: string, deviceName: string | null, zoneId: number | null }[] = [];
    #activeRepairTokenListener: ((data: { token: string, refreshToken: string }) => void) | null = null;

    async onPair(session: PairSession): Promise<void> {
        const app = this.homey.app as any;

        session.setHandler('validate_device', async data => this.validateDevice(data, session));

        session.setHandler('list_devices', async () => {
            return this.#gateways.filter(device => device.deviceType === 'rrc2')
                .map(device => ({
                    name: device.deviceName ?? device.deviceId,
                    data: {
                        id: device.id
                    },
                    settings: {
                        serialNumber: parseInt(device.deviceId),
                        accessToken: this.#tokenCache?.accessToken,
                        refreshToken: this.#tokenCache?.refreshToken,
                        expiresAtUtc: this.#tokenCache?.expiresAtUtc,
                        zoneId: device.zoneId,
                        pollingInterval: 30
                    } as DeviceSettings
                }));
        });

        const onTokenReceived = (data: { token: string, refreshToken: string }) => {
            this.log('[onPair] Driver received token from App, pushing to View...');
            session.emit('token_received', data);
            resetPairingState();
        };

        const resetPairingState = this.#resetParingState(app, () => {
            app.removeListener('internal_token_received', onTokenReceived);
        });

        app.on('internal_token_received', onTokenReceived);

        session.setHandler('get_setup_info', this.#getSetupInfo(app));
        session.setHandler('disconnect', resetPairingState);
    }

    async onRepair(session: PairSession, device: Ct200HttpsDevice) {
        this.log('[onRepair] Repairing device...');

        const app = this.homey.app as any;
        let tokenHandled = false;
        const resetPairingState = this.#resetParingState(app, () => {
            if (this.#activeRepairTokenListener !== null) {
                app.removeListener('internal_token_received', this.#activeRepairTokenListener);
                this.#activeRepairTokenListener = null;
            }
        });

        // Ensure stale listeners from an earlier repair session cannot trigger duplicate updates.
        if (this.#activeRepairTokenListener !== null) {
            app.removeListener('internal_token_received', this.#activeRepairTokenListener);
            this.#activeRepairTokenListener = null;
        }

        const onTokenReceived = (data: { token: string, refreshToken: string }) => {
            if (tokenHandled) {
                return;
            }

            tokenHandled = true;
            this.log('[onRepair] Driver received token from App, setting new token...');

            resetPairingState();
            this.#activeRepairTokenListener = null;

            device.persistTokenSettings({
                accessToken: data.token,
                refreshToken: data.refreshToken,
                expiresAtUtc: new Date(Date.now() + 960000) // 16 minutes from now
            })
                .then(async () => await device.recreateEasyControlClient())
                .then(() => session.done())
                .catch(e => {
                    this.error('[onRepair] Failed to update token and recreate HTTP client', e);
                    session.done().catch(doneErr => this.error(doneErr));
                });
        };

        this.#activeRepairTokenListener = onTokenReceived;
        app.once('internal_token_received', onTokenReceived);

        session.setHandler('get_setup_info', this.#getSetupInfo(app));
        session.setHandler('disconnect', resetPairingState);
    }

    async validateDevice(data: { token: string, refreshToken: string }, session: PairSession): Promise<void> {
        this.log('Validating device...');

        try {
            this.log('Attempting to connect to the HTTP Client...');

            const token: TokenCache = {
                accessToken: data.token,
                refreshToken: data.refreshToken,
                expiresAtUtc: new Date()
            };

            this.#tokenCache = token;

            const ecClient = new HttpEasyControlClient(
                new HttpConfigBuilder()
                    .withGatewayId('000000000')
                    .withToken(token)
                    .build()
            );

            ecClient.on('tokenUpdated', (newToken: TokenCache) => {
                this.log('Got new token');
                this.#tokenCache = newToken;
            });

            console.log('Fetching devices...');

            this.#gateways = (await ecClient.getGateways() ?? [])
                .map(gateway => ({...gateway, deviceName: null, zoneId: null, id: null}));

            this.log(`Found ${this.#gateways.length} gateway(s)`);

            for (const gateway of this.#gateways) {
                try {
                    await this.#fetchGatewayDevices(gateway);
                } catch (ex) {
                    this.error(`[validateDevice] Failed to fetch devices from gateway ${gateway.deviceId}, skipping`, ex);
                }
            }
        } catch (ex) {
            this.error('[validateDevice] Failed to connect to the HTTP Client', ex);
        }

        await session.nextView()
            .catch(e => this.error(e));
    }

    async #fetchGatewayDevices(gateway: { id: number | null, deviceId: string, deviceType: string, deviceName: string | null, zoneId: number | null }, maxRetries: number = 3): Promise<void> {
        let lastError: unknown;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const ecClient = new HttpEasyControlClient(
                    new HttpConfigBuilder()
                        .withGatewayId(gateway.deviceId)
                        .withToken(this.#tokenCache!)
                        .build()
                );

                const response = await ecClient.get(Endpoint.Devices);

                if (response !== null && 'value' in response) {
                    const device = (response.value as DeviceResponse[])
                        .filter(device => device.type === 'thermostat');

                    if (device.length === 0) {
                        return;
                    }

                    gateway.deviceName = atob(device[0].name);
                    gateway.zoneId = device[0].zone;
                    gateway.id = device[0].id;
                }

                return;
            } catch (ex) {
                lastError = ex;
                this.log(`[fetchGatewayDevices] Attempt ${attempt}/${maxRetries} failed for gateway ${gateway.deviceId}`, ex);

                if (attempt < maxRetries) {
                    await new Promise(resolve => setTimeout(resolve, 1500));
                }
            }
        }

        throw lastError;
    }

    #resetParingState(app: any, onReset?: () => void) {
        let wasReset = false;

        return (): any => {
            if (wasReset) {
                return;
            }

            wasReset = true;
            this.log('Resetting paring state...');

            app.setPairingCode(null);
            onReset?.();
        };
    }

    #getSetupInfo(app: any) {
        return async () => {
            const pairingCode = Math.floor(1000 + Math.random() * 9000).toString();
            app.setPairingCode(pairingCode);

            const localIp = await this.homey.cloud.getLocalAddress();
            return {
                pairingCode,
                localIp: localIp.split(':')[0],
                appId: this.homey.manifest.id
            };
        };
    }
}
