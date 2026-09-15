import type { Kilograms } from '@/domain/value-objects/kilograms'

export interface HarvestEntryProps {
  readonly id: number
  readonly date: Date
  readonly dug: Kilograms
  readonly stock: Kilograms
}

export class HarvestEntry {
  private constructor(private readonly props: HarvestEntryProps) {}

  static rehydrate(props: HarvestEntryProps): HarvestEntry {
    return new HarvestEntry(props)
  }

  get id(): number { return this.props.id }
  get date(): Date { return this.props.date }
  get dug(): Kilograms { return this.props.dug }
  get stock(): Kilograms { return this.props.stock }
}
