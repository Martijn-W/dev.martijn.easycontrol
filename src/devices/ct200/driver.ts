import Homey from 'homey';
import PairSession from 'homey/lib/PairSession';
import { Client, DeviceResponse } from '../../bosch';
import DeviceSettings from './deviceSettings';
import Ct200Device from './device';
import EtrvDevice from '../etrv/device';

export default class Ct200Driver extends Homey.Driver {
    #devices: DeviceResponse[] = [];
    #deviceData: DeviceSettings | null = null;

    async onInit() {
        await this.registerActions();

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

    private async registerActions(): Promise<void> {
        await this.registerSetTemperatureOffsetAction();
        await this.registerSetChildLockAction();
    }

    private async registerSetTemperatureOffsetAction(): Promise<void> {
        const setTemperatureOffset = this.homey.flow.getActionCard('ec_ct200_set_temperature_offset');

        type TemperatureOffsetArguments = {
            readonly device: Ct200Device,
            readonly offset: string
        }

        setTemperatureOffset.registerRunListener(async ({device, offset}: TemperatureOffsetArguments) => {
            await device.onSetTemperatureOffset(parseFloat(offset));
        });
    }

    private async registerSetChildLockAction(): Promise<void> {
        const setChildLock = this.homey.flow.getActionCard('ec_ct200_set_child_lock');
        const getChildLock = this.homey.flow.getConditionCard('ec_ct200_get_child_lock');

        type ChildLockArguments = {
            readonly device: Ct200Device,
            readonly lock: string
        }

        setChildLock.registerRunListener(async ({device, lock}: ChildLockArguments) => {
            await device.onSetChildLock(lock.toLowerCase() === 'true');
        });

        getChildLock.registerRunListener(async ({device, lock}: ChildLockArguments) => {
            const lockValue = lock.toLowerCase() === 'true';

            return device.getCapabilityValue('ec_child_lock') === lockValue;
        });
    }
}
