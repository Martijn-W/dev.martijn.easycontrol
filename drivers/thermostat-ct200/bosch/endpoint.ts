export enum Endpoint {
    Devices = '/devices/list',

    Zones = '/zones/list',
    ZoneTemperature = '/zones/zn%1/temperatureActual',
    ZoneTargetTemperature = '/zones/zn%1/temperatureHeatingSetpoint',
    ZoneHumidity = '/zones/zn%1/humidity',
    ZoneManualTemperatureHeating = '/zones/zn%1/manualTemperatureHeating',

    ApplianceSystemPressure = '/system/appliance/systemPressure',

    GatewayWifiRssi = '/gateway/wifi/rssi',

    HeatSourcesReturnTemperature = '/heatSources/returnTemperature'
}
