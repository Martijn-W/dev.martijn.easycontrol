export enum Endpoint {
    Zones = '/zones/list',
    ZoneTemperature = '/zones/zn%1/temperatureActual',
    ZoneTargetTemperature = '/zones/zn%1/temperatureHeatingSetpoint',
    ZoneHumidity = '/zones/zn%1/humidity',

    ApplianceSystemPressure = '/system/appliance/pressure'
}
