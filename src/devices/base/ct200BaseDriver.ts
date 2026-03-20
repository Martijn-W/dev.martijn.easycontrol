import Homey from 'homey';
import { Ct200BaseDevice } from './ct200BaseDevice';

export default abstract class Ct200BaseDriver extends Homey.Driver {
    protected abstract driverName: string;

    static #flowListenersRegistered = false;

    async onInit() {
        if (!Ct200BaseDriver.#flowListenersRegistered) {
            await this.registerActions();
            Ct200BaseDriver.#flowListenersRegistered = true;
        }

        this.log(`EasyControl Ct200 (${this.driverName}) driver has been initialized`);
    }

    private async registerActions(): Promise<void> {
        await this.registerSetTemperatureOffsetAction();
        await this.registerSetChildLockAction();
        await this.registerSetAwayModeAction();
    }

    private async registerSetTemperatureOffsetAction(): Promise<void> {
        const setTemperatureOffset = this.homey.flow.getActionCard('ec_ct200_set_temperature_offset');

        type TemperatureOffsetArguments = {
            readonly device: Ct200BaseDevice<any>,
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
            readonly device: Ct200BaseDevice<any>,
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

    private async registerSetAwayModeAction(): Promise<void> {
        const setAwayMode = this.homey.flow.getActionCard('ec_ct200_set_away_mode');
        const getAwayMode = this.homey.flow.getConditionCard('ec_ct200_get_away_mode');

        type AwayModeArguments = {
            readonly device: Ct200BaseDevice<any>,
            readonly enabled: string
        }

        setAwayMode.registerRunListener(async ({device, enabled}: AwayModeArguments) => {
            this.log(`Setting away mode: ${enabled}`);
            await device.onSetAwayMode(enabled.toLowerCase() === 'true');
        });

        getAwayMode.registerRunListener(async ({device, enabled}: AwayModeArguments) => {
            const awayModeValue = enabled.toLowerCase() === 'true';

            return device.getCapabilityValue('ec_away_mode') === awayModeValue;
        });
    }
}
