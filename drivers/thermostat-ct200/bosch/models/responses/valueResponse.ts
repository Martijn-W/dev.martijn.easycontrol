export interface ValueResponse {
    id: string,
    type: string,
    writeable: number,
    recordable: number,
    value: number,
    used: string,
    unitOfMeasure: 'C' | 'F',
    minValue: number,
    maxValue: number,
    stepSize: number
}
