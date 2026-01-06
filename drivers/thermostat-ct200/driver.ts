import Homey from 'homey';
import { Client, DeviceResponse } from './bosch';
import PairSession from 'homey/lib/PairSession';

import ConnectionSettings from './connectionSettings';

module.exports = class extends Homey.Driver {
    #devices: DeviceResponse[] = [];
    #deviceData: ConnectionSettings | null = null;

    async onInit() {
        this.log('EasyControl driver has been initialized');
    }

    async onPair(session: PairSession) {
        session.setHandler('validate_device', async data => this.validateDevice(data, session));

        session.setHandler('list_devices', async () => {
            return this.#devices.filter(device => device.type === 'thermostat')
                .map(device => ({
                    name: atob(device.name),
                    data: {
                        id: device.id
                    },
                    settings: {
                        serialNumber: this.#deviceData!.serialNumber,
                        accessKey: this.#deviceData!.accessKey,
                        password: this.#deviceData!.password,
                        zoneId: device.zone
                    } as ConnectionSettings
                }));
        });
    }

    async validateDevice(data: ConnectionSettings, session: PairSession): Promise<void> {
        this.log('Validating device...');

        let client: Client;

        await session.nextView();

        try {
            client = new Client();
            await client.connect(data.serialNumber, data.accessKey, data.password);
        } catch (ex) {
            this.log(`Failed to connect to the XMPP Client: ${ex}`);
            return;
        }

        this.log('Valid device, fetching devices...')

        this.#deviceData = data;
        this.#devices = await client.getDevices() ?? [];

        this.log(`Found ${this.#devices.length} device(s)`)

        await client.disconnect();

        await session.nextView();
    }

};
