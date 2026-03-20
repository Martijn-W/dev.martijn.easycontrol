import ConnectionSettings from './connectionSettings';

export default interface HttpConnectionSettings extends ConnectionSettings {
    accessToken: string;
    refreshToken: string;
    expiresAtUtc: Date;
}
