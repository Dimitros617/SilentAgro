

export interface StorageReadingProps {
  readonly id: number
  readonly recordedAt: Date
  readonly temperatureC: number
  readonly humidityPct: number
}

export class StorageReading {
  private constructor(private readonly props: StorageReadingProps) {}

  static rehydrate(props: StorageReadingProps): StorageReading {
    return new StorageReading(props)
  }

  get id(): number { return this.props.id }
  get recordedAt(): Date { return this.props.recordedAt }
  get temperatureC(): number { return this.props.temperatureC }
  get humidityPct(): number { return this.props.humidityPct }
}
