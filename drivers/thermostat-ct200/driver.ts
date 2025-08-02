import Homey from 'homey';
import { Client, DeviceResponse } from './bosch';
import PairSession from 'homey/lib/PairSession';
import DeviceData from './deviceData';

module.exports = class extends Homey.Driver {
    #devices: DeviceResponse[] = [];
    #deviceData: DeviceData | null = null;

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
                        device: this.#deviceData,
                        zoneId: device.zone
                    }
                }));
        });
    }

    async validateDevice(data: DeviceData, session: PairSession): Promise<void> {
        let client: Client;

        await session.nextView();

        try {
            client = new Client();
            await client.connect(data.serialNumber, data.accessKey, data.password);
        } catch (ex) {
            this.log(`Failed to connect to the XMPP Client: ${ex}`);
            return;
        }

        this.#deviceData = data;
        this.#devices = await client.getDevices() ?? [];

        client.disconnect();

        await session.nextView();

        // return {
        //     name: 'Bosch EasyControl',
        //     data,
        //     store: {
        //         paired_with_app_version: this.homey.app.manifest.version
        //     }
        // };
    }

};
