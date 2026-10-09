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
        await this.registerThermostatModeFlowCards();
        await this.registerSetMinSupplyTemperatureAction();
        await this.registerSetMaxSupplyTemperatureAction();
        await this.registerSetHeatCurveMinAction();
        await this.registerSetHeatCurveMaxAction();
    }

    private async registerSetMinSupplyTemperatureAction(): Promise<void> {
        const setMinSupplyTemperature = this.homey.flow.getActionCard('ec_ct200_set_min_supply_temperature');

        type SupplyTemperatureArguments = {
            readonly device: Ct200BaseDevice<any>,
            readonly temperature: number
        }

        setMinSupplyTemperature.registerRunListener(async ({device, temperature}: SupplyTemperatureArguments) => {
            await device.onSetMinSupplyTemperature(temperature);
        });
    }

    private async registerSetMaxSupplyTemperatureAction(): Promise<void> {
        const setMaxSupplyTemperature = this.homey.flow.getActionCard('ec_ct200_set_max_supply_temperature');

        type SupplyTemperatureArguments = {
            readonly device: Ct200BaseDevice<any>,
            readonly temperature: number
        }

        setMaxSupplyTemperature.registerRunListener(async ({device, temperature}: SupplyTemperatureArguments) => {
            await device.onSetMaxSupplyTemperature(temperature);
        });
    }

    private async registerSetHeatCurveMinAction(): Promise<void> {
        const setHeatCurveMin = this.homey.flow.getActionCard('ec_ct200_set_heat_curve_min');

        type HeatCurveArguments = {
            readonly device: Ct200BaseDevice<any>,
            readonly temperature: number
        }

        setHeatCurveMin.registerRunListener(async ({device, temperature}: HeatCurveArguments) => {
            await device.onSetHeatCurveMin(temperature);
        });
    }

    private async registerSetHeatCurveMaxAction(): Promise<void> {
        const setHeatCurveMax = this.homey.flow.getActionCard('ec_ct200_set_heat_curve_max');

        type HeatCurveArguments = {
            readonly device: Ct200BaseDevice<any>,
            readonly temperature: number
        }

        setHeatCurveMax.registerRunListener(async ({device, temperature}: HeatCurveArguments) => {
            await device.onSetHeatCurveMax(temperature);
        });
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

    private async registerThermostatModeFlowCards(): Promise<void> {
        const setThermostatMode = this.homey.flow.getActionCard('ec_ct200_set_thermostat_mode');
        const getThermostatMode = this.homey.flow.getConditionCard('ec_ct200_get_thermostat_mode');

        type ThermostatModeArguments = {
            readonly device: Ct200BaseDevice<any>,
            readonly mode: { id: string, name: string }
        }

        type ModeOption = { id: string, title: { en: string, nl?: string } };

        const getOptions = (device: Ct200BaseDevice<any>, query: string) => {
            const options = device.getCapabilityOptions('ec_thermostat_mode') as { values?: ModeOption[] };
            return (options.values ?? [])
                .filter(v => {
                    if (!query)
                        return true;

                    const name = v.title.nl ?? v.title.en;

                    return name.toLowerCase().includes(query.toLowerCase());
                })
                .map(v => ({id: v.id, name: v.title.nl ?? v.title.en}));
        };

        setThermostatMode.registerArgumentAutocompleteListener('mode', async (query: string, args: ThermostatModeArguments) => {
            return getOptions(args.device, query);
        });

        setThermostatMode.registerRunListener(async ({device, mode}: ThermostatModeArguments) => {
            await device.onSetThermostatMode(mode.id);
        });

        getThermostatMode.registerArgumentAutocompleteListener('mode', async (query: string, args: ThermostatModeArguments) => {
            return getOptions(args.device, query);
        });

        getThermostatMode.registerRunListener(async ({device, mode}: ThermostatModeArguments) => {
            return device.getCapabilityValue('ec_thermostat_mode') === mode.id;
        });
    }
}
