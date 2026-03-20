import { Client } from './client';
import { XmppConfigBuilder, XmppEasyControlClient } from 'bosch-xmpp-client';
import XmppConnectionSettings from './models/settings/xmppConnectionSettings';

export class XmppClient extends Client {
    protected easyControlClient: XmppEasyControlClient | null = null;

    public async connect(connectionSettings: XmppConnectionSettings): Promise<void> {
        const config = new XmppConfigBuilder()
            .withSerialNumber(`${connectionSettings.serialNumber}`)
            .withAccessKey(connectionSettings.accessKey)
            .withPassword(connectionSettings.password)
            .build();

        this.easyControlClient = new XmppEasyControlClient(config);

        try {
            await this.easyControlClient.connect();
        } catch (e) {
            console.log(`Failed to connect to the XMPP Client: ${e}`);
        }
    }

    public async disconnect(): Promise<void> {
        if (this.easyControlClient === null)
            return;

        await this.easyControlClient.disconnect();
    }

}
