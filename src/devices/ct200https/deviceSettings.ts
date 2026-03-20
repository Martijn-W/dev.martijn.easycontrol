import BaseDeviceSettings from '../base/baseDeviceSettings';

export default interface DeviceSettings extends BaseDeviceSettings {
    accessToken: string,
    refreshToken: string
    expiresAtUtc: Date
}
