import { first } from './cycle-a'
export function second() { return first() }
