export interface ValueResponse<TValue> {
    id: string,
    type: string,
    writeable: number,
    recordable: number,
    value: TValue,
    used: string,
    unitOfMeasure: 'C' | 'F',
    minValue: number,
    maxValue: number,
    stepSize: number
}
