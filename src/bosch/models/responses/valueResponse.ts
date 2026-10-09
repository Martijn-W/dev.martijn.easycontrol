export interface ValueResponse<TValue> {
    id: string,
    type: string,
    writeable: number,
    recordable: number,
    value: TValue,
    used: string,
    available?: string | boolean,
    unitOfMeasure: 'C' | 'F' | '%',
    minValue: number,
    maxValue: number,
    stepSize: number
}
