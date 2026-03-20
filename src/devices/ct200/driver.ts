import PairSession from 'homey/lib/PairSession';
import { Client, DeviceResponse } from '../../bosch';
import DeviceSettings from './deviceSettings';
import { XmppClient } from '../../bosch/xmppClient';
import XmppConnectionSettings from '../../bosch/models/settings/xmppConnectionSettings';
import Ct200BaseDriver from '../base/ct200BaseDriver';

export default class Ct200Driver extends Ct200BaseDriver {
    protected driverName: string = 'XMPP';

    #devices: DeviceResponse[] = [];
    #deviceData: DeviceSettings | null = null;

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
                        zoneId: device.zone,
                        pollingInterval: 30
                    } as DeviceSettings
                }));
        });
    }

    async validateDevice(data: DeviceSettings, session: PairSession): Promise<void> {
        this.log('Validating device...');

        let client: Client;

        session.nextView()
            .catch(e => this.error(e));

        try {
            this.log('Attempting to connect to the XMPP Client...');

            client = new XmppClient();
            await client.connect(<XmppConnectionSettings>{
                serialNumber: data.serialNumber,
                accessKey: data.accessKey,
                password: data.password
            });
        } catch (ex) {
            this.log(`Failed to connect to the XMPP Client: ${ex}`);
            return;
        }

        this.log('Valid device, fetching devices...');

        this.#deviceData = data;
        this.#devices = await client.getDevices() ?? [];

        this.log(`Found ${this.#devices.length} device(s)`);

        await client.disconnect();

        await session.nextView();
    }
}
