import type Homey from 'homey';

type TokenRequestBody = {
    token: string;
    refreshToken: string;
    code: string | number;
};

type PairingApp = Homey.App & {
    activePairingCode: string | null;
    emitTokenToDriver: (data: { token: string; refreshToken: string }) => void;
};

type PostTokenArgs = {
    homey: {
        app: PairingApp;
    };
    body: TokenRequestBody;
};

module.exports = {
    async postToken({ homey, body }: PostTokenArgs): Promise<{ success: true }> {
        const { token, refreshToken, code } = body;
        const app = homey.app;

        if (app.activePairingCode && app.activePairingCode === code.toString()) {
            app.emitTokenToDriver({ token, refreshToken });
            return { success: true };
        }

        throw new Error('Invalid code');
    }
};
