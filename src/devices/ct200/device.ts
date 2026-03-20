import DeviceSettings from './deviceSettings';
import { XmppClient } from '../../bosch/xmppClient';
import { Ct200BaseDevice } from '../base/ct200BaseDevice';
import BaseDeviceSettings from '../base/baseDeviceSettings';
import XmppConnectionSettings from '../../bosch/models/settings/xmppConnectionSettings';

export default class Ct200Device extends Ct200BaseDevice<XmppClient> {
    protected unsupportedCapabilities: string[] = [];

    protected getNewClient(): XmppClient {
        return new XmppClient();
    }

    protected getDeviceSettings(): BaseDeviceSettings {
        return this.fixSettings(this.getSettings() as DeviceSettings);
    }

    protected getConnectionSettings(): XmppConnectionSettings {
        return {
            serialNumber: this.settings!.serialNumber,
            password: (<DeviceSettings>this.settings).password,
            accessKey: (<DeviceSettings>this.settings).accessKey
        };
    }

    /**
     * Fixes the data types of the settings object.
     * @param settings
     * @private
     */
    private fixSettings(settings: DeviceSettings): DeviceSettings {
        settings.serialNumber = parseInt(settings.serialNumber as unknown as string);
        settings.zoneId = parseInt(settings.zoneId as unknown as string);
        settings.pollingInterval = parseInt(settings.pollingInterval as unknown as string);

        return settings;
    }
}
