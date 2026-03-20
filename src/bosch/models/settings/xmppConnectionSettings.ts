import ConnectionSettings from './connectionSettings';

export default interface XmppConnectionSettings extends ConnectionSettings {
    accessKey: string;
    password: string;
}

