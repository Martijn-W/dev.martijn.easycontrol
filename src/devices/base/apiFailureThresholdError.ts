export default class ApiFailureThresholdError extends Error {
    public readonly failedCalls: number;

    constructor(failedCalls: number) {
        super(`Too many API calls failed during sync (${failedCalls})`);
        this.name = 'ApiFailureThresholdError';
        this.failedCalls = failedCalls;
    }
}
