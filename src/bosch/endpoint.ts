export enum Endpoint {
    Devices = '/devices/list',

    Zones = '/zones/list',
    ZoneTemperature = '/zones/zn%1/temperatureActual',
    ZoneTargetTemperature = '/zones/zn%1/temperatureHeatingSetpoint',
    ZoneHumidity = '/zones/zn%1/humidity',
    ZoneManualTemperatureHeating = '/zones/zn%1/manualTemperatureHeating',
    ZoneValvePosition = '/zones/zn%1/actualValvePosition',

    ApplianceSystemPressure = '/system/appliance/systemPressure',

    GatewayWifiRssi = '/gateway/wifi/rssi',

    HeatSourcesReturnTemperature = '/heatSources/returnTemperature',
    HeatSourcesActualModulation = '/heatSources/actualModulation',

    DeviceBattery = '/devices/device%1/battery',
    DeviceSignal = '/devices/device%1/signal',
    DeviceValvePosition = '/devices/device%1/etrv/valvePosition',
    DeviceTemperatureOffset = '/devices/device%1/etrv/offset',
    DeviceChildLockEnabled = '/devices/device%1/etrv/childLock/enabled',
    DeviceThermostatChildLockEnabled = '/devices/device%1/thermostat/childLock/enabled',

    SystemOutsideTemperature = '/system/sensors/temperatures/outdoor_t1',
    SystemTemperatureOffset = '/system/sensors/temperatures/offset'
}
