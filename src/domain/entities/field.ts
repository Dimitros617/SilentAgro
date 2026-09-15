import type { FieldStatus } from '@/domain/enums'
import type { Kilograms } from '@/domain/value-objects/kilograms'

export interface FieldProps {
  readonly id: number
  readonly name: string
  readonly varietyName: string
  readonly areaM2: number
  readonly status: FieldStatus
  readonly yieldKg: Kilograms
  readonly isEstimate: boolean
  readonly sortOrder: number
}

export class Field {
  private constructor(private readonly props: FieldProps) {}

  static rehydrate(props: FieldProps): Field {
    return new Field(props)
  }

  get id(): number { return this.props.id }
  get name(): string { return this.props.name }
  get varietyName(): string { return this.props.varietyName }
  get areaM2(): number { return this.props.areaM2 }
  get status(): FieldStatus { return this.props.status }
  get yieldKg(): Kilograms { return this.props.yieldKg }
  get isEstimate(): boolean { return this.props.isEstimate }
  get sortOrder(): number { return this.props.sortOrder }
}
