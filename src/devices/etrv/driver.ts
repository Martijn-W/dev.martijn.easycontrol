import Homey from 'homey';
import DeviceSettings from './deviceSettings';
import { DeviceResponse, thermostatManager } from '../../bosch';
import PairSession from 'homey/lib/PairSession';
import Ct200Device from '../ct200/device';
import EtrvDevice from './device';

export default class EtrvDriver extends Homey.Driver {
    #thermostatDevice: { name: string, icon: string, data: { id: string } } | undefined;

    async onInit() {
        await this.registerActions();

        this.log('EtrvDriver has been initialized');
    }

    async onPair(session: PairSession): Promise<void> {
        session.setHandler('list_devices', async (data: any) => this.onListDevices(data, session));

        session.setHandler('list_thermostats_selection', async (data: { name: string, icon: string, data: { id: string } }[]) => this.onListThermostatsSelection(data, session));
    }

    private async onListDevices(data: any, session: PairSession) {
        const viewId = data?.viewId;

        if (viewId === 'list_thermostats' || !this.#thermostatDevice) {
            return this.listThermostats();
        }

        if (viewId === 'list_thermostat_valves' || (viewId === undefined && this.#thermostatDevice)) {
            return await this.listThermostatValves(session);
        }
    }

    private async onListThermostatsSelection(data: { name: string, icon: string, data: { id: string } }[], session: PairSession) {
        if (!data[0]) {
            await session.prevView();
            throw new Error('No valid thermostat selected');
        }

        this.#thermostatDevice = data[0];
    }

    private listThermostats() {
        const thermostats = thermostatManager.listThermostats();

        if (thermostats.length === 0) {
            throw new Error('No thermostats found, please add one first!');
        }

        return thermostats.map(thermostat => ({
                name: thermostat.name,
                icon: 'icon_thermostat.svg',
                data: {
                    id: thermostat.serialNumber
                }
            })
        );
    }

    private async listThermostatValves(session: PairSession) {
        if (!this.#thermostatDevice) {
            throw new Error('No thermostat selected');
        }

        const serialNumber = parseInt(this.#thermostatDevice.data.id);

        const thermostat: Ct200Device | undefined = thermostatManager.getThermostat(serialNumber);

        // Reset state (Homey 2019 reuses driver instance between pairing sessions)
        this.#thermostatDevice = undefined;

        if (!thermostat) {
            await session.prevView();
            throw new Error('Thermostat not found');
        }

        return (await thermostat.getClient().getDevices() ?? [])
            .filter((device: DeviceResponse) => device.type === 'thermostat_valve')
            .map((valve: DeviceResponse) => ({
                    name: atob(valve.name),
                    data: {
                        id: valve.id
                    },
                    settings: {
                        serialNumber: serialNumber,
                        zoneId: valve.zone,
                        deviceId: valve.id
                    } as DeviceSettings
                })
            );
    }

    private async registerActions(): Promise<void> {
        await this.registerSetTemperatureOffsetAction();
        await this.registerSetChildLockAction();
    }

    private async registerSetTemperatureOffsetAction(): Promise<void> {
        const setTemperatureOffset = this.homey.flow.getActionCard('ec_etrv_set_temperature_offset');

        type TemperatureOffsetArguments = {
            readonly device: EtrvDevice,
            readonly offset: string
        }

        setTemperatureOffset.registerRunListener(async ({device, offset}: TemperatureOffsetArguments) => {
            await device.onSetTemperatureOffset(parseFloat(offset));
        });
    }

    private async registerSetChildLockAction(): Promise<void> {
        const setChildLock = this.homey.flow.getActionCard('ec_etrv_set_child_lock');
        const getChildLock = this.homey.flow.getConditionCard('ec_etrv_get_child_lock');


        type ChildLockArguments = {
            readonly device: EtrvDevice,
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
