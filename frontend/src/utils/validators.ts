export const Validators = {
  isValidWeight(value: string | null | undefined) {
    if (!value || !value.trim()) return true
    const parsed = Number(value)
    return Number.isFinite(parsed) && parsed > 0 && parsed <= 999
  },

  isValidReps(value: string | null | undefined) {
    if (!value || !value.trim()) return true
    const parsed = Number(value)
    return Number.isInteger(parsed) && parsed > 0 && parsed <= 999
  },

  getWeightErrorMessage(value: string | null | undefined) {
    if (!value || !value.trim()) return ''
    const parsed = Number(value)
    if (!Number.isFinite(parsed)) return 'Ingresa un peso valido'
    if (parsed <= 0) return 'El peso debe ser mayor a 0'
    if (parsed > 999) return 'El peso no puede exceder 999'
    return ''
  },

  getRepsErrorMessage(value: string | null | undefined) {
    if (!value || !value.trim()) return ''
    const parsed = Number(value)
    if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) return 'Ingresa reps enteras validas'
    if (parsed <= 0) return 'Las reps deben ser mayores a 0'
    if (parsed > 999) return 'Las reps no pueden exceder 999'
    return ''
  },
}
