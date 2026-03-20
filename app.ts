'use strict';

import Homey from 'homey';

module.exports = class Ct200App extends Homey.App {
    public activePairingCode: string | null = null;

    /**
     * onInit is called when the app is initialized.
     */
    async onInit() {
        this.log('EasyControl app has been initialized');
    }

    emitTokenToDriver(data: { token: string, refreshToken: string }) {
        this.emit('internal_token_received', data);
    }

    setPairingCode(code: string | null): void {
        this.activePairingCode = code;
        this.log(`Active pairing code set to: ${code}`);
    }
};
