const MAX_LIST_TEXT_LENGTH = 120

/** Stejné omezení textových filtrů pro URL i přímé volání seznamových use-cases. */
export function normalizeListText(value: string): string {
  return value.trim().slice(0, MAX_LIST_TEXT_LENGTH)
}
